import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronUp, Gamepad2, Loader2, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { submitAnswer, fetchSessionChallenge, type AnswerResponse, type SessionResponse } from "@/services/api";
import { buildChallengeFrom } from "@/lib/challenge";
import { CatchStarsGame, type GameChallenge } from "@/components/games/CatchStarsGame";
import { FlappyAnswerGame } from "@/components/games/FlappyAnswerGame";
import { QUESTION_SECONDS, speedBonus, totalPoints } from "@/lib/gameProgress";
import { SpeedTimer } from "./SpeedTimer";
import { EssayMarkingCountdown } from "@/components/EssayMarkingCountdown";

type Letter = "A" | "B" | "C" | "D";
const LETTERS: Letter[] = ["A", "B", "C", "D"];

// Games playable with an MCQ challenge (both steer toward the correct answer
// gate/tile, so a win proves knowledge → auto-submit as correct).
type GameKind = "flappy" | "catch";
const GAME_OPTIONS: { kind: GameKind; emoji: string; label: { en: string; ms: string } }[] = [
  { kind: "flappy", emoji: "🐦", label: { en: "Answer Flappy", ms: "Flappy Jawapan" } },
  { kind: "catch", emoji: "⭐", label: { en: "Catch the Answer", ms: "Tangkap Jawapan" } },
];
const LETTER_TINT: Record<Letter, string> = {
  A: "border-red-400/60 bg-red-500/10",
  B: "border-blue-400/60 bg-blue-500/10",
  C: "border-amber-400/60 bg-amber-500/10",
  D: "border-emerald-400/60 bg-emerald-500/10",
};

export interface SlideResult {
  correct: boolean;
  points: number;
  mastery?: number;
  topicComplete?: boolean;
  nextTopic?: string;
  triggerPenalty?: boolean;
  sessionId?: string;
  /** The just-answered MCQ rebuilt with its correct answer (from feedback, which
   *  is NOT stripped) so the penalty game can replay it. Null for non-MCQ. */
  challenge?: GameChallenge | null;
}

interface QuestionSlideProps {
  session: SessionResponse;
  isActive: boolean;
  studentId: string;
  subject: string;
  apiLang: string;
  streak: number;
  lang: string;
  timerEnabled: boolean;
  /** A penalty game is queued for this slide, awaiting the student's tap. The
   *  game is NOT auto-opened so the graded feedback stays readable first. */
  penaltyPending?: boolean;
  onResult: (r: SlideResult) => void;
  onOpenTutor: (sessionId?: string) => void;
  onRequestNext: () => void;
  onLaunchPenalty?: () => void;
}

export function QuestionSlide({
  session, isActive, studentId, subject, apiLang, streak, lang, timerEnabled,
  penaltyPending, onResult, onOpenTutor, onRequestNext, onLaunchPenalty,
}: QuestionSlideProps) {
  const qType = session.question_type ?? "mcq";
  const isMcq = qType === "mcq" || qType === "listening";
  const isEssay = qType === "essay";
  const interactive = session.interactive as { video_url?: string } | null | undefined;
  const videoUrl = typeof interactive?.video_url === "string" ? interactive.video_url : "";

  const [selected, setSelected] = useState<Letter | null>(null);
  const [textAnswer, setTextAnswer] = useState("");
  const [checking, setChecking] = useState(false);
  const [feedback, setFeedback] = useState<AnswerResponse | null>(null);
  // Optimistic verdict shown the instant a choice is tapped (from the prefetched
  // correct answer), so the reward doesn't wait on the /submit_answer round-trip.
  const [instant, setInstant] = useState<{ correct: boolean } | null>(null);
  const [pointsBurst, setPointsBurst] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(QUESTION_SECONDS);
  const [gameChallenge, setGameChallenge] = useState<GameChallenge | null>(null);
  // Which game the student picked. null while the picker is showing.
  const [gameKind, setGameKind] = useState<GameKind | null>(null);
  const [readyChallenge, setReadyChallenge] = useState<GameChallenge | null>(null);
  const [gamifyLoading, setGamifyLoading] = useState(false);
  const answeredRef = useRef(false);

  // Prefetch the gamify challenge AND warm the Kaplay chunk while this slide is
  // active, so "gamify this" opens instantly instead of waiting on a network
  // round-trip plus a cold dynamic import.
  useEffect(() => {
    if (!isActive || !isMcq || !session.session_id || feedback) return;
    let cancelled = false;
    void import("kaplay"); // warm the game engine chunk in the background
    void (async () => {
      const correctRaw = await fetchSessionChallenge(session.session_id!);
      if (cancelled) return;
      const ch = buildChallengeFrom(session.question, session.options, correctRaw, "mcq");
      if (ch) setReadyChallenge(ch);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, isMcq, session.session_id, feedback]);

  // "I'm bored, gamify this!" — resolve the MCQ challenge, then show a picker so
  // the student chooses which game to play it as. Winning any of them requires
  // steering into the correct answer, so a win proves knowledge → auto-submit as
  // correct. A loss just closes; answer normally.
  const startGamify = () => {
    if (!session.session_id || gamifyLoading || feedback || instant) return;
    // Instant open when prefetched (the common path).
    if (readyChallenge) {
      setGameChallenge(readyChallenge);
      return;
    }
    // Fallback: prefetch hasn't landed yet — fetch on demand.
    setGamifyLoading(true);
    void (async () => {
      try {
        const correctRaw = await fetchSessionChallenge(session.session_id!);
        const ch = buildChallengeFrom(session.question, session.options, correctRaw, "mcq");
        if (ch) {
          setGameChallenge(ch);
        } else {
          toast.error(
            lang === "ms"
              ? "Tak boleh jadikan permainan untuk soalan ini. Jawab macam biasa."
              : "Can't gamify this question. Answer it normally.",
          );
        }
      } finally {
        setGamifyLoading(false);
      }
    })();
  };

  const handleGamifyEnd = (won: boolean) => {
    const ch = gameChallenge;
    setGameChallenge(null);
    setGameKind(null);
    if (won && ch) void submit(ch.options[ch.correctLetter] ?? "", ch.correctLetter);
  };

  // Countdown only while active + unanswered (freezes the moment they answer).
  useEffect(() => {
    if (!isActive || feedback || instant || !timerEnabled) return;
    const id = setInterval(() => setSecondsLeft((s) => (s <= 0 ? 0 : s - 0.1)), 100);
    return () => clearInterval(id);
  }, [isActive, feedback, instant, timerEnabled]);

  const fireBurst = (pts: number) => {
    setPointsBurst(pts);
    setTimeout(() => setPointsBurst(null), 1100);
  };

  const submit = async (answerText: string, letter?: Letter) => {
    if (checking || feedback || answeredRef.current) return;
    answeredRef.current = true;
    setChecking(true);
    if (letter) setSelected(letter);

    // Optimistic reward: if the correct answer was prefetched, show the verdict +
    // haptic + points burst immediately, then reconcile with the server below.
    let firedOptimistic = false;
    const known = readyChallenge?.correctLetter;
    if (letter && known) {
      const optimisticCorrect = letter === known;
      firedOptimistic = true;
      setInstant({ correct: optimisticCorrect });
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate(optimisticCorrect ? 20 : [30, 20, 30]);
      }
      if (optimisticCorrect) {
        fireBurst(totalPoints(undefined, streak, timerEnabled ? secondsLeft : QUESTION_SECONDS));
      }
    }

    try {
      const res = await submitAnswer(
        studentId, session.topic ?? "", "", answerText,
        (session.question_data ?? {}) as Record<string, unknown>,
        undefined, apiLang, session.subject ?? subject, session.session_id, qType,
      );
      const correct = res.is_correct ?? res.correct ?? false;
      const pts = correct ? totalPoints(res.points_awarded, streak, timerEnabled ? secondsLeft : QUESTION_SECONDS) : 0;
      // Server is authoritative — reconcile if the optimistic guess was wrong.
      setInstant({ correct });
      setFeedback({ ...res, correct });
      if (correct && !firedOptimistic) {
        fireBurst(pts);
      }
      onResult({
        correct, points: pts, mastery: res.mastery_score,
        topicComplete: res.topic_complete, nextTopic: res.next_topic,
        triggerPenalty: res.trigger_penalty_game === true,
        sessionId: session.session_id,
        // Feedback carries the correct answer (session payload strips it), so the
        // penalty game can replay this exact question.
        challenge: buildChallengeFrom(
          session.question,
          session.options,
          res.correct_answer,
          session.question_type ?? "mcq",
        ),
      });
    } catch {
      answeredRef.current = false; // allow retry on network error
      setInstant(null);            // clear the optimistic verdict so retry is clean
      setSelected(null);
      if (!isMcq) {
        toast.error(
          lang === "ms"
            ? "Penandaan mengambil masa terlalu lama. Jawapan anda selamat — tekan Hantar untuk cuba lagi."
            : "Marking took too long. Your answer is safe — tap Submit to try again.",
        );
      }
    } finally {
      setChecking(false);
    }
  };

  const bonus = timerEnabled ? speedBonus(secondsLeft) : 0;
  // Prefer server truth, fall back to the optimistic verdict for instant visuals.
  const verdict: boolean | null = feedback ? feedback.correct : instant ? instant.correct : null;
  const answered = feedback != null || instant != null;

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-3xl border border-border/70 bg-gradient-feed">
      {/* Ambient background: concept video (muted loop) or subtle gradient */}
      {videoUrl ? (
        <video
          key={videoUrl} src={videoUrl} autoPlay muted loop playsInline
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-20"
        />
      ) : null}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/40 via-background/70 to-background" />

      {/* Content */}
      <div className="relative flex h-full flex-col gap-2.5 p-4">
        {/* top row: kbat chip + timer */}
        <div className="flex shrink-0 items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {session.kbat_level && (
              <span className="rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary-glow">
                {session.kbat_level}
              </span>
            )}
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {(session.subject ?? subject) || ""}
            </span>
          </div>
          {isMcq && timerEnabled && !feedback && <SpeedTimer secondsLeft={secondsLeft} />}
        </div>

        {/* stimulus + question — scrollable region so long prompts never push the
            answer choices out of the column; answers/feedback below stay pinned.
            Once an essay is graded, this prompt collapses to a capped, scrollable
            strip so it stops competing for height with the essay report below —
            otherwise the report gets squeezed to ~0px and the format can't be
            scrolled to. */}
        <div
          className={cn(
            "min-h-0 overflow-y-auto overscroll-contain pr-1",
            isEssay && answered ? "max-h-[18vh] flex-none" : "flex-1",
          )}
        >
          {session.stimulus && (
            <div className="mb-2.5 rounded-xl border-l-2 border-primary/60 bg-primary/5 px-3 py-2 text-sm leading-relaxed text-foreground/90">
              {session.stimulus}
            </div>
          )}
          <h1 className="font-display text-xl font-semibold leading-snug tracking-tight sm:text-2xl">
            {session.question}
          </h1>
        </div>

        {/* "I'm bored, gamify this!" — only for MCQ, before answering */}
        {isMcq && !answered && isActive && session.session_id && (
          <button
            onClick={() => void startGamify()}
            disabled={gamifyLoading}
            className="flex shrink-0 items-center justify-center gap-2 rounded-full border border-fuchsia-400/50 bg-gradient-to-r from-fuchsia-500/20 to-indigo-500/20 px-4 py-2 text-sm font-bold text-fuchsia-200 transition hover:from-fuchsia-500/30 hover:to-indigo-500/30 disabled:opacity-50"
          >
            {gamifyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gamepad2 className="h-4 w-4" />}
            {lang === "ms" ? "Bosan? Jadikan permainan! 🎮" : "I'm bored, gamify this! 🎮"}
          </button>
        )}

        {/* answers */}
        <div className="flex shrink-0 flex-col gap-2">
          {isMcq ? (
            LETTERS.map((letter) => {
              const text = session.options?.[letter];
              if (!text) return null;
              const isPicked = selected === letter;
              const showCorrect = isPicked && verdict === true;
              const showWrong = isPicked && verdict === false;
              return (
                <button
                  key={letter}
                  disabled={answered || checking}
                  onClick={() => submit(text, letter)}
                  className={cn(
                    "group flex items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left backdrop-blur transition-all",
                    LETTER_TINT[letter],
                    !answered && "hover:scale-[1.01] hover:border-primary/70",
                    showCorrect && "border-emerald-400 bg-emerald-500/20 animate-answer-correct",
                    showWrong && "border-red-400 bg-red-500/20 animate-shake-x",
                    answered && !isPicked && "opacity-50",
                  )}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/20 bg-black/20 text-sm font-bold">
                    {letter}
                  </span>
                  <span className="text-sm font-medium leading-snug">{text}</span>
                </button>
              );
            })
          ) : (
            <div className="flex flex-col gap-2">
              {isEssay ? (
                // Essays need room to write — multi-line textarea; Enter inserts a
                // newline, submission is via the button (or Ctrl/Cmd+Enter).
                <Textarea
                  value={textAnswer}
                  onChange={(e) => setTextAnswer(e.target.value)}
                  disabled={answered || checking}
                  placeholder={lang === "ms" ? "Tulis karangan anda di sini…" : "Write your essay here…"}
                  rows={8}
                  className={cn(
                    "resize-y rounded-2xl border-2 bg-card/60 px-4 py-3 text-base leading-relaxed",
                    // After grading, collapse the answer to a compact scrollable
                    // preview so the essay report below has room to expand.
                    answered ? "max-h-20 min-h-0 overflow-y-auto opacity-70" : "min-h-[10rem]",
                  )}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit(textAnswer);
                  }}
                />
              ) : (
                <Input
                  value={textAnswer}
                  onChange={(e) => setTextAnswer(e.target.value)}
                  disabled={answered || checking}
                  placeholder={lang === "ms" ? "Taip jawapan…" : "Type your answer…"}
                  className="h-14 rounded-2xl border-2 bg-card/60 px-4 text-base"
                  onKeyDown={(e) => { if (e.key === "Enter") void submit(textAnswer); }}
                />
              )}
              {/* Once graded, drop the (now-disabled) Submit button so the
                  essay report can claim the reclaimed vertical space. */}
              {!answered && (
                <Button
                  onClick={() => void submit(textAnswer)}
                  disabled={checking || !textAnswer.trim()}
                  size="lg"
                  className="h-12 rounded-2xl bg-gradient-primary font-bold shadow-glow"
                >
                  {checking ? <Loader2 className="h-5 w-5 animate-spin" /> : lang === "ms" ? "Hantar" : "Submit"}
                </Button>
              )}
            </div>
          )}
        </div>

        {/* feedback strip — verdict + optional speed badge appear instantly from
            the optimistic verdict; the explanation text streams in with the server. */}
        {verdict !== null && (
          <div
            className={cn(
              "animate-slide-up-in shrink-0 rounded-2xl border p-3 text-sm",
              verdict
                ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-200"
                : "border-red-400/50 bg-red-500/10 text-red-200",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold">
                {verdict ? (lang === "ms" ? "Betul! 🎉" : "Correct! 🎉") : (lang === "ms" ? "Belum tepat" : "Not quite")}
              </span>
              {verdict && bonus > 0 && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-neon-green">+{bonus} speed</span>
              )}
            </div>
            {/* For essays the detailed feedback lives inside the scrollable
                report below, so the strip stays a compact verdict badge and
                doesn't hog the column (it never shrinks). */}
            {!isEssay && feedback?.feedback && <p className="mt-1 leading-relaxed text-foreground/85">{feedback.feedback}</p>}
            {!isEssay && verdict === false && feedback?.misconception && (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">💡 {feedback.misconception}</p>
            )}
          </div>
        )}

        {/* Essay report — for essays we show more than a one-line critique: the
            band/marks, what worked, what to fix, and (crucially) a worked model of
            HOW THE ESSAY SHOULD LOOK so the student has a format to aim for. */}
        {isEssay && feedback?.essay_detail && (
          <div className="animate-slide-up-in min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain rounded-2xl border border-fuchsia-400/30 bg-fuchsia-500/5 p-3 text-sm">
            {feedback.feedback && (
              <p className="leading-relaxed text-foreground/90">{feedback.feedback}</p>
            )}
            {(feedback.essay_detail.band || feedback.marks_awarded != null) && (
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-fuchsia-200">
                {feedback.essay_detail.band && <span>{lang === "ms" ? "Band" : "Band"} {feedback.essay_detail.band}</span>}
                {feedback.marks_awarded != null && feedback.max_marks != null && (
                  <span className="rounded-full bg-fuchsia-500/20 px-2 py-0.5">
                    {feedback.marks_awarded}/{feedback.max_marks} {lang === "ms" ? "markah" : "marks"}
                  </span>
                )}
              </div>
            )}

            {!!feedback.essay_detail.strengths?.length && (
              <div>
                <p className="font-semibold text-emerald-300">{lang === "ms" ? "Kekuatan" : "Strengths"}</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-foreground/85">
                  {feedback.essay_detail.strengths.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}

            {!!feedback.essay_detail.improvements?.length && (
              <div>
                <p className="font-semibold text-amber-300">{lang === "ms" ? "Penambahbaikan" : "Improvements"}</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-foreground/85">
                  {feedback.essay_detail.improvements.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}

            {feedback.essay_detail.model_structure && (
              <div>
                <p className="font-semibold text-primary-glow">
                  {lang === "ms" ? "Cara ia sepatutnya kelihatan" : "How it should look"}
                </p>
                <p className="mt-1 whitespace-pre-line leading-relaxed text-foreground/85">
                  {feedback.essay_detail.model_structure}
                </p>
              </div>
            )}

            {feedback.essay_detail.model_answer && (
              <details className="rounded-xl border border-white/10 bg-black/20 p-2">
                <summary className="cursor-pointer font-semibold text-primary-glow">
                  {lang === "ms" ? "Contoh jawapan model" : "Model answer example"}
                </summary>
                <p className="mt-2 whitespace-pre-line leading-relaxed text-foreground/80">
                  {feedback.essay_detail.model_answer}
                </p>
              </details>
            )}
          </div>
        )}

        {/* Penalty game gate — appears under the feedback so the student reads
            their graded feedback FIRST, then taps to play (or just swipes on).
            The game never auto-covers the feedback. */}
        {penaltyPending && (
          <button
            onClick={onLaunchPenalty}
            className="animate-slide-up-in flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-indigo-500 px-4 py-3 text-sm font-bold text-white shadow-glow transition hover:opacity-90 active:scale-95"
          >
            <Gamepad2 className="h-4 w-4" />
            {lang === "ms"
              ? "Dah baca maklum balas? Main untuk pulih 🎮"
              : "Read your feedback? Play to recover 🎮"}
          </button>
        )}

        {/* footer: tutor + swipe hint */}
        <div className="flex shrink-0 items-center justify-between pt-1">
          <button
            onClick={() => onOpenTutor(session.session_id)}
            disabled={!session.session_id}
            className="flex items-center gap-1.5 text-xs text-muted-foreground transition hover:text-primary-glow disabled:opacity-40"
          >
            <MessageCircle className="h-4 w-4" />
            {lang === "ms" ? "Tanya Tutor" : "Ask Tutor"}
          </button>
          <button
            onClick={onRequestNext}
            className={cn(
              "flex items-center gap-1 text-xs font-semibold text-primary-glow",
              answered ? "animate-swipe-hint" : "opacity-60",
            )}
          >
            <ChevronUp className="h-4 w-4" />
            {lang === "ms" ? "Leret ke atas" : "Swipe up"}
          </button>
        </div>
      </div>

      {/* Essay marking countdown — essays are graded by a live LLM call that can
          take minutes; show remaining time before the 5-min timeout. */}
      <EssayMarkingCountdown active={checking && !isMcq} lang={lang} totalSeconds={540} />

      {/* "Gamify this" overlay — pick a game, then play the current MCQ as it */}
      {gameChallenge && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/85 p-3 backdrop-blur-sm">
          <button
            onClick={() => { setGameChallenge(null); setGameKind(null); }}
            className="self-end rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80 hover:bg-white/20"
          >
            {lang === "ms" ? "Batal ✕" : "Cancel ✕"}
          </button>

          {!gameKind ? (
            /* Game picker */
            <div className="flex w-full max-w-sm flex-col items-center gap-4">
              <p className="text-center text-base font-bold text-white">
                {lang === "ms" ? "Pilih permainan 🎮" : "Choose a game 🎮"}
              </p>
              <div className="grid w-full grid-cols-2 gap-3">
                {GAME_OPTIONS.map((g) => (
                  <button
                    key={g.kind}
                    onClick={() => setGameKind(g.kind)}
                    className="flex flex-col items-center gap-2 rounded-2xl border border-fuchsia-400/50 bg-gradient-to-br from-fuchsia-500/20 to-indigo-500/20 px-4 py-5 text-sm font-bold text-fuchsia-100 transition hover:from-fuchsia-500/30 hover:to-indigo-500/30 hover:scale-[1.03]"
                  >
                    <span className="text-3xl">{g.emoji}</span>
                    {lang === "ms" ? g.label.ms : g.label.en}
                  </button>
                ))}
              </div>
            </div>
          ) : gameKind === "catch" ? (
            <CatchStarsGame challenge={gameChallenge} onGameEnd={handleGamifyEnd} />
          ) : (
            <FlappyAnswerGame challenge={gameChallenge} onGameEnd={handleGamifyEnd} />
          )}

          <p className="text-center text-xs text-white/60">
            {lang === "ms"
              ? "Menang = jawapan betul dihantar. Kalah? Jawab biasa."
              : "Win = your correct answer is submitted. Lose? Just answer normally."}
          </p>
        </div>
      )}

      {/* points burst */}
      {pointsBurst != null && (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center">
          <span className="animate-points-float text-4xl font-black text-neon-green drop-shadow-[0_0_12px_rgba(74,222,128,0.6)]">
            +{pointsBurst}
          </span>
        </div>
      )}
    </div>
  );
}
