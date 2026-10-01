import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Lang } from "@/lib/i18n";
import type { SessionResponse, AnswerResponse } from "@/services/api";
import type { ExamPrefs } from "@/hooks/useStudentPrefs";

type Letter = "A" | "B" | "C" | "D";
const LETTERS = ["A", "B", "C", "D"] as const;

interface Props {
  session: SessionResponse | null;
  examPrefs: ExamPrefs;
  formLevel: number;
  activeLanguage: Lang;
  activeSubject: string;
  questionNumber: number;
  subPartAnswers: Record<string, string>;
  setSubPartAnswers: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  textAnswer: string;
  setTextAnswer: React.Dispatch<React.SetStateAction<string>>;
  feedback: AnswerResponse | null;
  submittingText: boolean;
  selected: Letter | null;
  checking: Letter | null;
  correctFlash: Letter | null;
  wrongFlash: Letter | null;
  loading: boolean;
  onSubPartsSubmit: () => Promise<void>;
  onTextSubmit: () => Promise<void>;
  onAnswer: (letter: Letter) => void;
}

const PAPER_BG: Record<string, string> = {
  white: "#ffffff",
  cream: "#fdf6e3",
  blue:  "#eef2ff",
};

const FONT_FAMILY: Record<string, string> = {
  serif: '"Times New Roman", Times, Georgia, serif',
  sans:  'system-ui, Arial, sans-serif',
};

function ruledStyle(marks: number, lineStyle: string): React.CSSProperties {
  const lines = Math.max(marks, 1);
  const lineH = 32;
  const minH = lines * lineH + 16;
  if (lineStyle === "plain") return { minHeight: minH };
  if (lineStyle === "graph") return {
    minHeight: minH,
    backgroundImage:
      "repeating-linear-gradient(to right,#d1d5db 0,#d1d5db 1px,transparent 1px,transparent)," +
      "repeating-linear-gradient(to bottom,#d1d5db 0,#d1d5db 1px,transparent 1px,transparent)",
    backgroundSize: "20px 20px",
    lineHeight: "20px",
  };
  // ruled (default)
  return {
    minHeight: minH,
    backgroundImage:
      "repeating-linear-gradient(transparent,transparent 31px,#d1d5db 31px,#d1d5db 32px)",
    backgroundAttachment: "local",
    lineHeight: "32px",
    paddingTop: "6px",
  };
}

export function ExamPaperCard({
  session,
  examPrefs,
  formLevel,
  activeLanguage,
  activeSubject,
  questionNumber,
  subPartAnswers,
  setSubPartAnswers,
  textAnswer,
  setTextAnswer,
  feedback,
  submittingText,
  selected,
  checking,
  correctFlash,
  wrongFlash,
  loading,
  onSubPartsSubmit,
  onTextSubmit,
  onAnswer,
}: Props) {
  const ms = activeLanguage === "ms";

  const paperLabelBm: Record<string, string> = {
    mcq:           "Kertas 1 — Bahagian A",
    short_answer:  "Kertas 2 — Bahagian A",
    essay:         "Kertas 2 — Bahagian B",
    listening:     "Kertas 3",
  };
  const paperLabelEn: Record<string, string> = {
    mcq:           "Paper 1 — Section A",
    short_answer:  "Paper 2 — Section A",
    essay:         "Paper 2 — Section B",
    listening:     "Paper 3",
  };

  const qt = session?.question_type ?? "mcq";
  const labelBm = paperLabelBm[qt] ?? "Kertas 1 — Bahagian A";
  const labelEn = paperLabelEn[qt] ?? "Paper 1 — Section A";

  const totalMarks =
    qt === "mcq"
      ? 1
      : (session?.sub_parts ?? []).reduce((s, p) => s + (p.marks ?? 0), 0) || null;

  const fontStyle: React.CSSProperties = {
    fontFamily: FONT_FAMILY[examPrefs.font],
    backgroundColor: PAPER_BG[examPrefs.paperColour],
    color: "#1a1a1a",
  };

  const markLabel = (m: number) =>
    ms ? `[${m} markah]` : `[${m} ${m === 1 ? "mark" : "marks"}]`;

  // ── Loading skeleton ───────────────────────────────────────────────
  if (loading || !session) {
    return (
      <div className="rounded-sm border-2 border-zinc-300 shadow-md overflow-hidden" style={fontStyle}>
        <div className="bg-zinc-800 text-white px-4 py-2 space-y-1">
          <Skeleton className="h-3 w-48 bg-zinc-600" />
        </div>
        <div className="p-5 space-y-4">
          <Skeleton className="h-4 w-24 bg-zinc-200" />
          <Skeleton className="h-5 w-full bg-zinc-200" />
          <Skeleton className="h-5 w-4/5 bg-zinc-200" />
          <Skeleton className="h-20 w-full bg-zinc-100" />
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-sm border-2 border-zinc-400 shadow-lg overflow-hidden print:shadow-none"
      style={fontStyle}
    >
      {/* ── Exam header bar ─────────────────────────────────────────── */}
      <div className="bg-zinc-800 text-white px-4 py-2.5 flex items-center justify-between gap-4 select-none">
        <div className="text-sm font-bold uppercase tracking-widest">
          {examPrefs.bilingualLabels ? (
            <span>{labelBm}<span className="mx-2 opacity-50">·</span>{labelEn}</span>
          ) : ms ? labelBm : labelEn}
        </div>
        {totalMarks !== null && examPrefs.showMarks && (
          <div className="shrink-0 rounded border border-white/30 px-2 py-0.5 text-xs font-bold tabular-nums text-white/90">
            {ms ? `${totalMarks} markah` : `${totalMarks} marks`}
          </div>
        )}
      </div>

      {/* ── Question body ────────────────────────────────────────────── */}
      <div className="p-5 space-y-4">

        {/* Question number + meta */}
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-base font-bold">
            {ms ? `Soalan ${questionNumber}` : `Question ${questionNumber}`}
          </p>
          <span className="text-xs text-zinc-500 tabular-nums">
            {session.subject ?? activeSubject}
            {" · "}
            {ms ? `Tingkatan ${formLevel}` : `Form ${formLevel}`}
          </span>
        </div>

        {/* Stimulus material */}
        {session.stimulus && (
          <div className="rounded border border-zinc-300 bg-zinc-50 p-3">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              {ms ? "Bahan Rangsangan / Stimulus" : "Stimulus Material / Bahan Rangsangan"}
            </p>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{session.stimulus}</p>
          </div>
        )}

        {/* Listening passage */}
        {qt === "listening" && session.passage && (
          <div className="rounded border border-zinc-300 bg-zinc-50 p-3">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              {ms ? "Petikan / Passage" : "Passage / Petikan"}
            </p>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{session.passage}</p>
          </div>
        )}

        {/* Question text */}
        <p className="text-[15px] leading-relaxed">{session.question}</p>

        {/* ── Answer area ─────────────────────────────────────────── */}

        {/* MCQ */}
        {qt === "mcq" && (
          <div className="space-y-2 pt-1">
            {LETTERS.map((letter) => {
              const isChecking  = checking === letter;
              const isSelected  = selected === letter;
              const isCorrect   = correctFlash === letter;
              const isWrong     = wrongFlash === letter;
              return (
                <button
                  key={letter}
                  onClick={() => onAnswer(letter)}
                  disabled={!!checking || !!feedback || !session}
                  className={cn(
                    "flex w-full items-start gap-3 rounded border px-3 py-2.5 text-left text-sm transition-all",
                    "border-zinc-300 hover:border-zinc-500 hover:bg-zinc-50",
                    "disabled:cursor-not-allowed disabled:opacity-60",
                    isSelected && !feedback && "border-zinc-700 bg-zinc-100 font-semibold",
                    isCorrect  && "border-emerald-500 bg-emerald-50",
                    isWrong    && "border-red-400 bg-red-50",
                  )}
                  style={{ fontFamily: FONT_FAMILY[examPrefs.font] }}
                >
                  <span className={cn(
                    "grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs font-bold",
                    isSelected || isCorrect || isWrong
                      ? "border-zinc-700 bg-zinc-800 text-white"
                      : "border-zinc-400 bg-white text-zinc-700",
                    isCorrect && "bg-emerald-600 border-emerald-600",
                    isWrong   && "bg-red-500 border-red-500",
                  )}>
                    {isChecking ? <Loader2 className="h-3 w-3 animate-spin" /> : letter}
                  </span>
                  <span className="flex-1 leading-snug">{session.options?.[letter]}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Short answer — sub-parts */}
        {qt === "short_answer" && (session.sub_parts?.length ?? 0) > 0 && (
          <div className="space-y-4">
            {session.sub_parts!.map((part) => (
              <div key={part.label}>
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <p className="text-sm leading-relaxed">
                    <span className="font-bold mr-1.5">{part.label}</span>
                    {part.question}
                  </p>
                  {examPrefs.showMarks && (
                    <span className="shrink-0 text-[11px] text-zinc-500 font-medium whitespace-nowrap">
                      {markLabel(part.marks)}
                    </span>
                  )}
                </div>
                <Textarea
                  value={subPartAnswers[part.label] ?? ""}
                  onChange={(e) =>
                    setSubPartAnswers((prev) => ({ ...prev, [part.label]: e.target.value }))
                  }
                  disabled={!!feedback || submittingText}
                  placeholder=""
                  className="w-full rounded-none border border-zinc-400 bg-transparent px-2 py-1 text-sm resize-none focus:ring-0 focus:border-zinc-600"
                  style={{
                    fontFamily: FONT_FAMILY[examPrefs.font],
                    ...ruledStyle(part.marks, examPrefs.lineStyle),
                  }}
                />
              </div>
            ))}
            <Button
              onClick={() => void onSubPartsSubmit()}
              disabled={
                !!feedback ||
                submittingText ||
                !session.sub_parts!.some((p) => (subPartAnswers[p.label] ?? "").trim().length > 0)
              }
              size="lg"
              className="w-full h-11 rounded-sm bg-zinc-800 text-white font-bold hover:bg-zinc-700 border-0"
            >
              {submittingText
                ? <Loader2 className="h-5 w-5 animate-spin" />
                : ms ? "Hantar Jawapan" : "Submit Answers"}
            </Button>
          </div>
        )}

        {/* Short answer — single text box (no sub_parts) */}
        {qt === "short_answer" && (session.sub_parts?.length ?? 0) === 0 && (
          <div className="space-y-3">
            <Textarea
              value={textAnswer}
              onChange={(e) => setTextAnswer(e.target.value)}
              disabled={!!feedback || submittingText}
              placeholder=""
              className="w-full rounded-none border border-zinc-400 bg-transparent px-2 py-1 text-sm resize-none focus:ring-0"
              style={{
                fontFamily: FONT_FAMILY[examPrefs.font],
                ...ruledStyle(3, examPrefs.lineStyle),
              }}
            />
            <Button
              onClick={() => void onTextSubmit()}
              disabled={!!feedback || submittingText || !textAnswer.trim()}
              size="lg"
              className="w-full h-11 rounded-sm bg-zinc-800 text-white font-bold hover:bg-zinc-700 border-0"
            >
              {submittingText
                ? <Loader2 className="h-5 w-5 animate-spin" />
                : ms ? "Hantar Jawapan" : "Submit Answer"}
            </Button>
          </div>
        )}

        {/* Essay */}
        {qt === "essay" && (
          <div className="space-y-3">
            <div className="relative">
              <Textarea
                value={textAnswer}
                onChange={(e) => setTextAnswer(e.target.value)}
                disabled={!!feedback || submittingText}
                placeholder=""
                className="w-full rounded-none border border-zinc-400 bg-transparent px-2 pb-7 py-1 text-sm resize-none focus:ring-0"
                style={{
                  fontFamily: FONT_FAMILY[examPrefs.font],
                  ...ruledStyle(15, examPrefs.lineStyle),
                }}
              />
              <div className="pointer-events-none absolute bottom-1.5 right-2 text-[10px] text-zinc-400 tabular-nums">
                {textAnswer.trim() ? textAnswer.trim().split(/\s+/).length : 0}{" "}
                {ms ? "patah perkataan" : "words"}
              </div>
            </div>
            <Button
              onClick={() => void onTextSubmit()}
              disabled={!!feedback || submittingText || !textAnswer.trim()}
              size="lg"
              className="w-full h-11 rounded-sm bg-zinc-800 text-white font-bold hover:bg-zinc-700 border-0"
            >
              {submittingText
                ? <Loader2 className="h-5 w-5 animate-spin" />
                : ms ? "Hantar Karangan" : "Submit Essay"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
