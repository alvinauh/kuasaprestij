import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { submitAnswer, type AnswerResponse } from "@/services/api";

export interface H5PInteraction {
  duration?: { from?: number; to?: number };
  pause?: boolean;
  action?: {
    library?: string;
    params?: {
      files?: Array<{ path?: string; mime?: string }>;
      question?: string;
      answers?: Array<{
        text?: string;
        correct?: boolean;
        tipsAndFeedback?: { chosenFeedback?: string; tip?: string };
      }>;
      textField?: string;
      distractors?: string;
    };
  };
}

export interface H5PContent {
  interactiveVideo?: {
    video?: { files?: Array<{ path?: string; mime?: string }> };
    assets?: { interactions?: H5PInteraction[] };
  };
}

/** Lean interactive-question schema (going-forward format; replaces the H5P blob). */
export interface InteractiveBlob {
  video_url?: string;
  audio_url?: string;
  audio_end_sec?: number;
  question?: string;
  options?: string[];
  mcq_start_sec?: number;
  drag?: {
    sentence?: string;
    distractors?: string[];
    start_sec?: number;
    end_sec?: number;
  } | null;
}

interface InteractiveVideoPlayerProps {
  h5pContent?: H5PContent | null;
  /** Preferred lean blob; when present, h5pContent is ignored. */
  interactive?: InteractiveBlob | null;
  questionData: Record<string, unknown>;
  sessionId: string;
  studentId: string;
  topic: string;
  subject: string;
  language: string;
  correctAnswer?: string;
  mnemonicLyrics?: string[] | null;
  /** Skip the video+DragText intro and jump straight to the MCQ. */
  skipIntro?: boolean;
  /** Called the first time the video intro naturally transitions to MCQ. */
  onIntroComplete?: () => void;
  /** SVG diagram string to use as background when skipIntro=true. */
  diagramSvg?: string | null;
  onAnswerSubmit: (result: AnswerResponse) => void;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").trim();
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

interface DragTextParsed {
  segments: Array<{ type: "text"; value: string } | { type: "blank"; correct: string }>;
  bank: string[];
  correctOrder: string[];
}

function parseDragText(textField: string, distractors: string): DragTextParsed {
  const segments: DragTextParsed["segments"] = [];
  const correctOrder: string[] = [];
  const re = /\*([^*]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(textField)) !== null) {
    if (m.index > last) segments.push({ type: "text", value: textField.slice(last, m.index) });
    const word = m[1].split(":")[0].trim();
    segments.push({ type: "blank", correct: word });
    correctOrder.push(word);
    last = re.lastIndex;
  }
  if (last < textField.length) segments.push({ type: "text", value: textField.slice(last) });
  const extras = (distractors || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  return { segments, correctOrder, bank: shuffle([...correctOrder, ...extras]) };
}

export function InteractiveVideoPlayer({
  h5pContent,
  interactive,
  questionData,
  sessionId,
  studentId,
  topic,
  subject,
  language,
  correctAnswer,
  mnemonicLyrics,
  skipIntro = false,
  onIntroComplete,
  diagramSvg,
  onAnswerSubmit,
}: InteractiveVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const parsed = useMemo(() => {
    // Preferred path: lean interactive blob.
    if (interactive) {
      const options = (interactive.options ?? []).filter((t) => t.length > 0);
      const drag =
        interactive.drag && interactive.drag.sentence
          ? parseDragText(
              interactive.drag.sentence,
              (interactive.drag.distractors ?? []).join("\n"),
            )
          : null;
      return {
        videoUrl: interactive.video_url ?? "",
        audioUrl: interactive.audio_url ?? "",
        dragAt: interactive.drag?.start_sec ?? 0,
        mcqAt: interactive.mcq_start_sec ?? 8,
        questionText: stripHtml(interactive.question ?? ""),
        options,
        // Correct answers are graded server-side; never trust the client blob.
        answerMeta: options.map((text) => ({ text, correct: false, feedback: "" })),
        drag,
      };
    }

    // Backward-compat: convert a legacy H5P blob (stored rows not yet migrated).
    const iv = h5pContent?.interactiveVideo;
    const videoUrl = iv?.video?.files?.[0]?.path ?? "";
    const interactions = iv?.assets?.interactions ?? [];
    const audioInteraction = interactions.find((i) => i.action?.library?.startsWith("H5P.Audio"));
    const dragInteraction = interactions.find((i) =>
      i.action?.library?.startsWith("H5P.DragText"),
    );
    const mcqInteraction = interactions.find((i) =>
      i.action?.library?.startsWith("H5P.MultiChoice"),
    );
    // Backward compatibility: fall back to positional indices
    const audio = audioInteraction ?? interactions[0];
    const mcq = mcqInteraction ?? (dragInteraction ? interactions[2] : interactions[1]);

    const audioUrl = audio?.action?.params?.files?.[0]?.path ?? "";
    const dragAt = dragInteraction?.duration?.from ?? 0;
    const mcqAt = mcq?.duration?.from ?? 8;

    const rawQuestion = mcq?.action?.params?.question ?? "";
    const answers = mcq?.action?.params?.answers ?? [];
    const options = answers.map((a) => a?.text ?? "").filter((t) => t.length > 0);
    const answerMeta = answers
      .map((a) => ({
        text: a?.text ?? "",
        correct: a?.correct === true,
        feedback: a?.tipsAndFeedback?.chosenFeedback || a?.tipsAndFeedback?.tip || "",
      }))
      .filter((a) => a.text.length > 0);

    const drag =
      dragInteraction && dragInteraction.action?.params?.textField
        ? parseDragText(
            dragInteraction.action.params.textField,
            dragInteraction.action.params.distractors ?? "",
          )
        : null;

    return {
      videoUrl,
      audioUrl,
      dragAt,
      mcqAt,
      questionText: stripHtml(rawQuestion),
      options,
      answerMeta,
      drag,
    };
  }, [h5pContent, interactive]);

  const noDiagramVideo = !parsed.videoUrl && !!diagramSvg;
  const [phase, setPhase] = useState<"intro" | "drag" | "mcq">(() => {
    if (skipIntro || noDiagramVideo) {
      // If a DragText step exists, enter drag phase first; otherwise jump straight to MCQ.
      return parsed.drag ? "drag" : "mcq";
    }
    return "intro";
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AnswerResponse | null>(null);
  const [canAdvance, setCanAdvance] = useState(false);
  const [lyricIdx, setLyricIdx] = useState(0);

  // DragText state
  const [placed, setPlaced] = useState<Array<string | null>>([]);
  const [usedBankIdx, setUsedBankIdx] = useState<Set<number>>(new Set());
  const [dragResult, setDragResult] = useState<boolean[] | null>(null);

  useEffect(() => {
    if (parsed.drag) {
      setPlaced(new Array(parsed.drag.correctOrder.length).fill(null));
      setUsedBankIdx(new Set());
      setDragResult(null);
    }
  }, [parsed.drag]);

  const safeLyrics = Array.isArray(mnemonicLyrics)
    ? mnemonicLyrics.filter((l): l is string => typeof l === "string" && l.trim().length > 0)
    : [];

  // In diagram mode (no video), trigger audio playback on mount.
  useEffect(() => {
    if (noDiagramVideo && parsed.audioUrl) {
      const a = audioRef.current;
      if (a) { a.currentTime = 0; a.play().catch(() => undefined); }
    }
  }, [noDiagramVideo, parsed.audioUrl]);

  const handleCanPlay = () => {
    const a = audioRef.current;
    if (a && parsed.audioUrl) {
      a.currentTime = 0;
      a.play().catch(() => undefined);
    }
  };

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    if (phase === "intro") {
      // If DragText exists, pause for it first; otherwise pause directly at MCQ.
      if (parsed.drag && v.currentTime >= parsed.dragAt) {
        v.pause();
        audioRef.current?.pause();
        setPhase("drag");
        onIntroComplete?.();
      } else if (!parsed.drag && v.currentTime >= parsed.mcqAt) {
        v.pause();
        audioRef.current?.pause();
        setPhase("mcq");
        onIntroComplete?.();
      }
    }
    if (safeLyrics.length > 0) {
      const total = (parsed.drag ? parsed.dragAt : parsed.mcqAt) || 8;
      const ratio = Math.min(1, v.currentTime / total);
      setLyricIdx(Math.min(safeLyrics.length - 1, Math.floor(ratio * safeLyrics.length)));
    }
  };

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      videoRef.current?.pause();
    };
  }, []);

  const resumeToMcq = () => {
    setPhase("mcq");
    // Resume video to MCQ timestamp
    const v = videoRef.current;
    if (v && parsed.mcqAt > v.currentTime) {
      v.currentTime = parsed.mcqAt;
    }
  };

  const handleDragChipTap = (bankIdx: number, word: string) => {
    if (dragResult) return;
    if (usedBankIdx.has(bankIdx)) return;
    const nextSlot = placed.findIndex((p) => p === null);
    if (nextSlot === -1) return;
    const np = [...placed];
    np[nextSlot] = word;
    setPlaced(np);
    const used = new Set(usedBankIdx);
    used.add(bankIdx);
    setUsedBankIdx(used);
  };

  const handleSlotTap = (slotIdx: number) => {
    if (dragResult) return;
    const word = placed[slotIdx];
    if (!word || !parsed.drag) return;
    const np = [...placed];
    np[slotIdx] = null;
    setPlaced(np);
    // Free first matching used bank chip
    const bankIdx = parsed.drag.bank.findIndex(
      (w, i) => w === word && usedBankIdx.has(i),
    );
    if (bankIdx >= 0) {
      const used = new Set(usedBankIdx);
      used.delete(bankIdx);
      setUsedBankIdx(used);
    }
  };

  const handleDragCheck = () => {
    if (!parsed.drag) return;
    const results = parsed.drag.correctOrder.map(
      (w, i) => (placed[i] ?? "").trim().toLowerCase() === w.trim().toLowerCase(),
    );
    setDragResult(results);
    setTimeout(resumeToMcq, 1500);
  };

  const buildLocalResult = (answer: string): AnswerResponse => {
    const selectedMeta = parsed.answerMeta.find((a) => a.text === answer);
    const questionCorrect =
      correctAnswer ||
      (typeof questionData?.correct_answer === "string" ? questionData.correct_answer : "") ||
      (typeof questionData?.answer === "string" ? questionData.answer : "") ||
      (typeof questionData?.correct === "string" ? questionData.correct : "") ||
      parsed.answerMeta.find((a) => a.correct)?.text ||
      "";
    const isCorrect = questionCorrect
      ? answer.trim().toLowerCase() === questionCorrect.trim().toLowerCase()
      : selectedMeta?.correct === true;
    const fallbackFeedback = isCorrect
      ? "Correct — great work."
      : questionCorrect
        ? `Not quite. The correct answer is ${questionCorrect}.`
        : "Answer recorded. Continue to the next question.";

    return {
      correct: isCorrect,
      correct_answer: questionCorrect,
      feedback: selectedMeta?.feedback || fallbackFeedback,
    };
  };

  const handleSubmit = async () => {
    if (!selected || submitting || result) return;
    setSubmitting(true);
    const localResult = buildLocalResult(selected);
    try {
      const res = await submitAnswer(
        studentId,
        topic,
        "",
        selected,
        {},
        undefined,
        language,
        subject,
        sessionId,
      );
      setResult({ ...res, feedback: res.feedback || localResult.feedback });
      setTimeout(() => setCanAdvance(true), 1200);
    } catch (err) {
      console.error("[InteractiveVideoPlayer] submit failed:", err);
      setResult(localResult);
      setTimeout(() => setCanAdvance(true), 1200);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative mx-auto w-full max-w-[480px] overflow-hidden rounded-3xl border border-primary/40 bg-black shadow-glow">
      <div className="relative aspect-[9/16] w-full">
        {(skipIntro || noDiagramVideo) ? (
          /* No video intro — show diagram as background, or gradient fallback */
          diagramSvg ? (
            <div
              className="absolute inset-0 overflow-hidden bg-card [&_svg]:h-full [&_svg]:w-full [&_svg]:object-contain"
              dangerouslySetInnerHTML={{ __html: diagramSvg }}
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 to-primary/60" />
          )
        ) : parsed.videoUrl ? (
          <video
            ref={videoRef}
            src={parsed.videoUrl}
            autoPlay
            playsInline
            onCanPlay={handleCanPlay}
            onTimeUpdate={handleTimeUpdate}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 to-primary/60" />
        )}
        {parsed.audioUrl && <audio ref={audioRef} src={parsed.audioUrl} preload="auto" />}

        {/* Mnemonic subtitle */}
        {phase === "intro" && safeLyrics.length > 0 && (
          <div className="absolute inset-x-0 bottom-6 px-4">
            <div className="rounded-2xl bg-black/60 px-4 py-3 text-center text-base font-semibold text-white backdrop-blur-md">
              {safeLyrics[lyricIdx]}
            </div>
          </div>
        )}

        {/* DragText overlay */}
        {phase === "drag" && parsed.drag && (
          <div className="absolute inset-0 flex flex-col gap-3 bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-white">Fill in the Blanks 📝</h3>
              <button
                onClick={resumeToMcq}
                className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white hover:bg-white/25"
                aria-label="Skip"
              >
                Skip <X className="h-3 w-3" />
              </button>
            </div>

            <div className="rounded-2xl bg-card/95 p-4 text-foreground shadow-lg">
              <p className="text-base leading-relaxed">
                {parsed.drag.segments.map((seg, i) => {
                  if (seg.type === "text") return <span key={i}>{seg.value}</span>;
                  const blankIdx = parsed.drag!.segments
                    .slice(0, i + 1)
                    .filter((s) => s.type === "blank").length - 1;
                  const word = placed[blankIdx];
                  const r = dragResult?.[blankIdx];
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSlotTap(blankIdx)}
                      className={cn(
                        "inline-block min-w-[80px] border-b-2 border-primary mx-1 text-center font-semibold align-baseline",
                        word ? "px-2" : "px-1",
                        r === true && "text-green-600 border-green-500",
                        r === false && "text-red-600 border-red-500",
                      )}
                    >
                      {word ?? "___"}
                      {r === true && " ✓"}
                      {r === false && " ✗"}
                    </button>
                  );
                })}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {parsed.drag.bank.map((w, i) => {
                const used = usedBankIdx.has(i);
                return (
                  <button
                    key={`${w}-${i}`}
                    type="button"
                    onClick={() => handleDragChipTap(i, w)}
                    disabled={used || !!dragResult}
                    className={cn(
                      "min-h-[48px] rounded-full px-4 py-2 font-medium shadow transition",
                      used
                        ? "bg-green-500/30 text-white/40 line-through"
                        : "bg-primary text-white hover:scale-105",
                    )}
                  >
                    {w}
                  </button>
                );
              })}
            </div>

            <div className="mt-auto">
              <Button
                onClick={handleDragCheck}
                disabled={placed.some((p) => p === null) || !!dragResult}
                size="lg"
                className="h-12 w-full rounded-xl bg-white text-base font-bold text-black hover:bg-white/90"
              >
                Semak / Check
              </Button>
            </div>
          </div>
        )}

        {/* MCQ overlay */}
        {phase === "mcq" && (
          <div
            className={cn(
              "absolute inset-0 flex flex-col gap-3 p-4 transition-colors",
              skipIntro ? "" : "backdrop-blur-sm",
              result
                ? result.correct
                  ? "bg-[oklch(0.35_0.18_150/0.85)]"
                  : "bg-[oklch(0.4_0.22_25/0.85)]"
                : skipIntro ? "bg-white/80" : "bg-black/70",
            )}
          >
            <div className="rounded-2xl bg-card/95 p-4 text-foreground shadow-lg">
              <div className="text-xs uppercase tracking-widest text-primary-glow">Question</div>
              <p className="mt-1 text-base font-semibold leading-snug">{parsed.questionText}</p>
            </div>

            <div className="flex flex-1 flex-col justify-end gap-2.5">
              {parsed.options.map((opt) => {
                const isSelected = selected === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    disabled={!!result || submitting}
                    onClick={() => setSelected(opt)}
                    className={cn(
                      "w-full rounded-xl bg-primary px-4 py-3 text-left text-sm font-semibold text-primary-foreground transition disabled:opacity-70",
                      isSelected && "ring-2 ring-white",
                    )}
                  >
                    {opt}
                  </button>
                );
              })}

              {!result ? (
                <Button
                  onClick={handleSubmit}
                  disabled={!selected || submitting}
                  size="lg"
                  className="h-12 w-full rounded-xl bg-white text-base font-bold text-black hover:bg-white/90"
                >
                  {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Submit Answer"}
                </Button>
              ) : (
                <div className="rounded-xl bg-black/40 p-3 text-white">
                  <div className="text-lg font-bold">
                    {result.correct ? "✔ Correct!" : "✗ Try again!"}
                  </div>
                  {result.feedback && (
                    <p className="mt-1 text-sm leading-relaxed">{result.feedback}</p>
                  )}
                  {canAdvance && (
                    <Button
                      onClick={() => onAnswerSubmit(result)}
                      size="lg"
                      className="mt-3 h-11 w-full rounded-xl bg-white text-base font-bold text-black hover:bg-white/90"
                    >
                      Next Question
                    </Button>
                  )}
                </div>
              )}
            </div>

            {submitting && !result && (
              <div className="absolute inset-0 grid place-items-center bg-black/40">
                <Loader2 className="h-10 w-10 animate-spin text-white" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Feedback debug panel */}
      <details className="border-t border-border/40 bg-black/60 px-3 py-2 text-[11px] text-white/80">
        <summary className="cursor-pointer select-none font-mono uppercase tracking-widest text-white/60">
          🔧 Feedback debug
        </summary>
        <div className="mt-2 space-y-1 font-mono leading-snug">
          <div><span className="text-white/50">session:</span> {sessionId || "—"}</div>
          <div><span className="text-white/50">phase:</span> {phase}</div>
          <div><span className="text-white/50">selected:</span> {selected ?? "—"}</div>
          <div>
            <span className="text-white/50">correct_answer:</span>{" "}
            {correctAnswer || (parsed.answerMeta.find((a) => a.correct)?.text ?? "—")}
          </div>
          <div><span className="text-white/50">submitting:</span> {String(submitting)}</div>
          <div>
            <span className="text-white/50">result.correct:</span>{" "}
            {result ? String(result.correct) : "—"}
          </div>
          {result?.feedback && (
            <div className="whitespace-pre-wrap break-words">
              <span className="text-white/50">feedback:</span> {result.feedback}
            </div>
          )}
          {result?.misconception && (
            <div className="whitespace-pre-wrap break-words">
              <span className="text-white/50">misconception:</span> {result.misconception}
            </div>
          )}
          <div className="pt-1 text-white/50">
            options: {parsed.options.length} · dragAt: {parsed.dragAt}s · mcqAt: {parsed.mcqAt}s · drag: {parsed.drag ? "yes" : "no"}
          </div>
        </div>
      </details>
    </div>
  );
}
