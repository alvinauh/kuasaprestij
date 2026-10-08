import { useEffect, useRef, useState } from "react";
import { X, CheckCircle2, XCircle, BookOpen, ChevronLeft } from "lucide-react";
import { fetchQuestionHistory, type HistoryRecord } from "@/services/api";

interface Props {
  studentId: string;
  subject: string;
  topic: string;
  lang: string;
  onClose: () => void;
}

// ── KBAT colour map ────────────────────────────────────────────────────────
const kbatColor: Record<string, string> = {
  Mengingati:    "bg-slate-500/80",
  Memahami:      "bg-blue-500/80",
  Mengaplikasi:  "bg-emerald-500/80",
  Menganalisis:  "bg-amber-500/80",
  Menilai:       "bg-orange-500/80",
  Mencipta:      "bg-rose-500/80",
  Remembering:   "bg-slate-500/80",
  Understanding: "bg-blue-500/80",
  Applying:      "bg-emerald-500/80",
  Analysing:     "bg-amber-500/80",
  Evaluating:    "bg-orange-500/80",
  Creating:      "bg-rose-500/80",
};

function kbatClass(level: string) {
  return kbatColor[level] ?? "bg-violet-500/80";
}

function relativeTime(iso: string, lang: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return lang === "ms" ? "baru saja" : "just now";
  if (diff < 3600) {
    const m = Math.floor(diff / 60);
    return lang === "ms" ? `${m} min lalu` : `${m}m ago`;
  }
  if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    return lang === "ms" ? `${h} jam lalu` : `${h}h ago`;
  }
  const d = Math.floor(diff / 86400);
  return lang === "ms" ? `${d} hari lalu` : `${d}d ago`;
}

// ── Detail view (full question read-only) ──────────────────────────────────
function HistoryDetail({
  record,
  lang,
  onBack,
}: {
  record: HistoryRecord;
  lang: string;
  onBack: () => void;
}) {
  const opts = record.options_json;
  const isMcq = record.question_type === "mcq" && opts;

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 gap-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-white/60 hover:text-white transition-colors w-fit"
      >
        <ChevronLeft className="h-4 w-4" />
        {lang === "ms" ? "Kembali" : "Back"}
      </button>

      {/* Header badges */}
      <div className="flex flex-wrap gap-2 text-xs font-semibold">
        <span className={`rounded-full px-2.5 py-0.5 text-white ${kbatClass(record.kbat_level)}`}>
          {record.kbat_level}
        </span>
        <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-white/80">
          {record.topic}
        </span>
        <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-white/80">
          {relativeTime(record.created_at, lang)}
        </span>
        {record.is_correct ? (
          <span className="rounded-full bg-emerald-500/80 px-2.5 py-0.5 text-white flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            {lang === "ms" ? "Betul" : "Correct"}
          </span>
        ) : (
          <span className="rounded-full bg-red-500/80 px-2.5 py-0.5 text-white flex items-center gap-1">
            <XCircle className="h-3 w-3" />
            {lang === "ms" ? "Salah" : "Wrong"}
          </span>
        )}
      </div>

      {/* Question text */}
      <p className="text-white text-base leading-relaxed font-medium">
        {record.question_text}
      </p>

      {/* MCQ options */}
      {isMcq && (
        <div className="flex flex-col gap-2">
          {(["A", "B", "C", "D"] as const).map((letter) => {
            const text = opts![letter];
            if (!text) return null;
            const isCorrect = record.correct_answer?.toUpperCase() === letter;
            const isStudentPick = record.student_answer?.toUpperCase() === letter;
            let cls = "border border-white/20 bg-white/5 text-white/70";
            if (isCorrect) cls = "border border-emerald-400 bg-emerald-500/20 text-emerald-200 font-semibold";
            if (isStudentPick && !isCorrect) cls = "border border-red-400 bg-red-500/20 text-red-200 line-through";
            return (
              <div key={letter} className={`rounded-xl px-4 py-2.5 text-sm flex items-center gap-2 ${cls}`}>
                <span className="font-bold">{letter}.</span>
                <span>{text}</span>
                {isCorrect && <CheckCircle2 className="ml-auto h-4 w-4 text-emerald-400 shrink-0" />}
                {isStudentPick && !isCorrect && <XCircle className="ml-auto h-4 w-4 text-red-400 shrink-0" />}
              </div>
            );
          })}
        </div>
      )}

      {/* Non-MCQ: student answer */}
      {!isMcq && record.student_answer && (
        <div>
          <p className="text-xs text-white/50 mb-1">
            {lang === "ms" ? "Jawapan pelajar" : "Student answer"}
          </p>
          <div className={`rounded-xl px-4 py-3 text-sm text-white/80 border ${
            record.is_correct ? "border-emerald-400/40 bg-emerald-500/10" : "border-red-400/40 bg-red-500/10"
          }`}>
            {record.student_answer}
          </div>
        </div>
      )}

      {/* Feedback */}
      {record.feedback_text && (
        <div>
          <p className="text-xs text-white/50 mb-1">
            {lang === "ms" ? "Maklum balas" : "Feedback"}
          </p>
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70 leading-relaxed">
            {record.feedback_text}
          </div>
        </div>
      )}

      {/* Error category */}
      {!record.is_correct && record.error_category && record.error_category !== "None" && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <span className="font-semibold">{lang === "ms" ? "Kesilapan: " : "Misconception: "}</span>
          {record.error_category}
        </div>
      )}
    </div>
  );
}

// ── Mini card shown in the Mission Control grid ────────────────────────────
function HistoryCard({
  record,
  index,
  lang,
  onClick,
}: {
  record: HistoryRecord;
  index: number;
  lang: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group relative flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-3 text-left backdrop-blur-sm hover:border-white/25 hover:bg-white/10 hover:scale-[1.03] active:scale-[0.98] transition-all duration-200"
      style={{
        animation: `kpMissionFlip 0.45s cubic-bezier(0.34,1.4,0.64,1) ${index * 40}ms both`,
      }}
    >
      {/* Result indicator */}
      <div className="absolute top-2.5 right-2.5">
        {record.is_correct ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        ) : (
          <XCircle className="h-4 w-4 text-red-400" />
        )}
      </div>

      {/* KBAT badge */}
      <span className={`self-start rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${kbatClass(record.kbat_level)}`}>
        {record.kbat_level}
      </span>

      {/* Question preview */}
      <p className="text-xs text-white/80 leading-relaxed line-clamp-3 pr-5">
        {record.question_text}
      </p>

      {/* Footer */}
      <div className="mt-auto flex items-center gap-1.5 text-[10px] text-white/40">
        <BookOpen className="h-3 w-3 shrink-0" />
        <span className="truncate">{record.topic}</span>
        <span className="ml-auto shrink-0">{relativeTime(record.created_at, lang)}</span>
      </div>
    </button>
  );
}

// ── Main overlay ───────────────────────────────────────────────────────────
export function QuestionHistoryOverlay({ studentId, subject, topic, lang, onClose }: Props) {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<HistoryRecord | null>(null);
  const [filter, setFilter] = useState<"all" | "correct" | "wrong">("all");
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    fetchQuestionHistory(studentId, { subject, topic, limit: 40 })
      .then((r) => setRecords(r.records))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, [studentId, subject, topic]);

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const visible = records.filter((r) =>
    filter === "correct" ? r.is_correct : filter === "wrong" ? !r.is_correct : true,
  );

  const correctCount = records.filter((r) => r.is_correct).length;
  const accuracy = records.length ? Math.round((correctCount / records.length) * 100) : 0;

  return (
    <>
      {/* Inline keyframe definition */}
      <style>{`
        @keyframes kpMissionFlip {
          0%   { transform: translateY(60px) scale(0.7); opacity: 0; }
          100% { transform: translateY(0)    scale(1);   opacity: 1; }
        }
        @keyframes kpOverlayIn {
          0%   { opacity: 0; }
          100% { opacity: 1; }
        }
      `}</style>

      <div
        ref={overlayRef}
        onClick={handleBackdropClick}
        className="fixed inset-0 z-50 flex flex-col"
        style={{ animation: "kpOverlayIn 0.2s ease-out both" }}
      >
        {/* Blurred dark backdrop */}
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />

        {/* Panel */}
        <div className="relative z-10 flex flex-col h-full max-h-full overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
            <div className="flex-1">
              <h2 className="text-white font-bold text-base">
                {lang === "ms" ? "Semua Soalan" : "Question History"}
              </h2>
              {!loading && records.length > 0 && (
                <p className="text-white/50 text-xs mt-0.5">
                  {records.length} {lang === "ms" ? "soalan" : "questions"} · {accuracy}% {lang === "ms" ? "tepat" : "accuracy"}
                </p>
              )}
            </div>

            {/* Filter chips */}
            <div className="flex gap-1 text-xs font-semibold">
              {(["all", "correct", "wrong"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-full px-2.5 py-1 transition-colors ${
                    filter === f
                      ? "bg-white text-black"
                      : "bg-white/10 text-white/70 hover:bg-white/20"
                  }`}
                >
                  {f === "all"
                    ? lang === "ms" ? "Semua" : "All"
                    : f === "correct"
                    ? lang === "ms" ? "✓ Betul" : "✓ Right"
                    : lang === "ms" ? "✗ Salah" : "✗ Wrong"}
                </button>
              ))}
            </div>

            <button
              onClick={onClose}
              className="rounded-full bg-white/10 p-1.5 text-white/70 hover:bg-white/20 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {selected ? (
              <HistoryDetail
                record={selected}
                lang={lang}
                onBack={() => setSelected(null)}
              />
            ) : loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="flex flex-col items-center gap-3 text-white/50">
                  <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
                  <span className="text-sm">
                    {lang === "ms" ? "Memuatkan sejarah…" : "Loading history…"}
                  </span>
                </div>
              </div>
            ) : visible.length === 0 ? (
              <div className="flex items-center justify-center h-full text-white/40 text-sm">
                {lang === "ms"
                  ? "Tiada soalan dijumpai."
                  : "No questions found yet — answer some to see them here."}
              </div>
            ) : (
              /* Mission Control grid */
              <div className="p-4 grid gap-3"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}
              >
                {visible.map((r, i) => (
                  <HistoryCard
                    key={r.id}
                    record={r}
                    index={i}
                    lang={lang}
                    onClick={() => setSelected(r)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
