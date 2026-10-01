/**
 * Command Centre — library of every artifact the AI Controller has ever generated:
 * slides, quizzes, and assignment records. Pulled from the teacher_chat history.
 */
import { useEffect, useState } from "react";
import {
  BookOpen,
  ListChecks,
  ClipboardCheck,
  RefreshCw,
  Loader2,
  BookMarked,
  HelpCircle,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  fetchTeacherChatHistory,
  fetchLessonById,
  fetchQuizById,
  type TeacherChatArtifact,
  type TeacherChatMessage,
  type Lesson,
  type QuizRecord,
  type QuizQuestion,
} from "@/services/api";
import { LessonSlideDeck } from "@/components/LessonSlideDeck";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ArtifactRecord extends TeacherChatArtifact {
  created_at: string;
  dedup_key: string;
}

type FilterKey = "all" | "lesson" | "quiz" | "assignment";

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractArtifacts(messages: TeacherChatMessage[]): ArtifactRecord[] {
  const seen = new Set<string>();
  const records: ArtifactRecord[] = [];

  // Messages arrive oldest-first; reverse so newest appears first in the grid
  const reversed = [...messages].reverse();
  for (const msg of reversed) {
    if (msg.role !== "assistant" || !msg.artifacts?.length) continue;
    for (const a of msg.artifacts) {
      const key =
        a.lesson_id ??
        a.quiz_id ??
        `${a.type}-${a.topic ?? ""}-${msg.created_at ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      records.push({ ...a, created_at: msg.created_at ?? "", dedup_key: key });
    }
  }
  return records;
}

function fmtDate(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-MY", { day: "numeric", month: "short" });
}

// ── Main component ────────────────────────────────────────────────────────────

export function CommandCentrePanel() {
  const [messages, setMessages] = useState<TeacherChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [previewLesson, setPreviewLesson] = useState<Lesson | null>(null);
  const [previewQuiz, setPreviewQuiz] = useState<QuizRecord | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  async function load() {
    try {
      const msgs = await fetchTeacherChatHistory();
      setMessages(msgs);
    } catch {
      /* network error — keep stale state */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const artifacts = extractArtifacts(messages);

  const counts: Record<FilterKey, number> = {
    all: artifacts.length,
    lesson: artifacts.filter((a) => a.type === "lesson").length,
    quiz: artifacts.filter((a) => a.type === "quiz").length,
    assignment: artifacts.filter((a) => a.type === "assignment").length,
  };

  const filtered =
    filter === "all" ? artifacts : artifacts.filter((a) => a.type === filter);

  async function openLesson(a: ArtifactRecord) {
    if (!a.lesson_id) return;
    setOpeningId(a.lesson_id);
    try {
      const lesson = await fetchLessonById(a.lesson_id);
      if (lesson) setPreviewLesson(lesson);
    } finally {
      setOpeningId(null);
    }
  }

  async function openQuiz(a: ArtifactRecord) {
    if (!a.quiz_id) return;
    setOpeningId(a.quiz_id);
    try {
      const quiz = await fetchQuizById(a.quiz_id);
      if (quiz) setPreviewQuiz(quiz);
    } finally {
      setOpeningId(null);
    }
  }

  // ── Filter tabs ─────────────────────────────────────────────────────────────

  const FILTERS: { key: FilterKey; label: string; Icon: typeof BookMarked }[] = [
    { key: "all", label: "All", Icon: BookMarked },
    { key: "lesson", label: "Slides", Icon: BookOpen },
    { key: "quiz", label: "Quizzes", Icon: HelpCircle },
    { key: "assignment", label: "Assigned", Icon: ClipboardCheck },
  ];

  return (
    <>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold">Command Centre</h2>
            <p className="text-sm text-muted-foreground">
              Every slide deck, quiz, and assignment the AI has generated for your class
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setRefreshing(true); void load(); }}
            disabled={loading || refreshing}
            className="rounded-xl"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {/* Filter chips */}
        <div className="inline-flex flex-wrap gap-1 rounded-full border border-border bg-card/60 p-1 text-sm">
          {FILTERS.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium transition",
                filter === key
                  ? "bg-gradient-primary text-primary-foreground shadow-glow"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {label}
              <span className="rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] font-semibold leading-none">
                {counts[key]}
              </span>
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-border bg-card/40 px-6 py-14 text-center">
            <p className="text-sm text-muted-foreground">
              {filter === "all"
                ? "No AI-generated content yet."
                : filter === "lesson"
                ? "No slide decks yet."
                : filter === "quiz"
                ? "No quizzes yet."
                : "No assignments yet."}
            </p>
            <p className="mt-1 text-xs text-muted-foreground/60">
              Use the <strong>AI Controller</strong> tab to generate slides, quizzes, and tasks.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((a, i) => (
              <ArtifactCard
                key={a.dedup_key + i}
                a={a}
                onOpenLesson={openLesson}
                onOpenQuiz={openQuiz}
                openingId={openingId}
              />
            ))}
          </div>
        )}
      </div>

      {/* Lesson preview modal */}
      <LessonSlideDeck
        open={!!previewLesson}
        onClose={() => setPreviewLesson(null)}
        lesson={previewLesson}
        subject={previewLesson?.subject ?? ""}
        topic={previewLesson?.topic ?? ""}
      />

      {/* Quiz preview modal */}
      <QuizPreviewModal quiz={previewQuiz} onClose={() => setPreviewQuiz(null)} />
    </>
  );
}

// ── Artifact cards ────────────────────────────────────────────────────────────

function ArtifactCard({
  a,
  onOpenLesson,
  onOpenQuiz,
  openingId,
}: {
  a: ArtifactRecord;
  onOpenLesson: (a: ArtifactRecord) => void;
  onOpenQuiz: (a: ArtifactRecord) => void;
  openingId: string | null;
}) {
  const date = fmtDate(a.created_at);

  if (a.type === "lesson") {
    const isLoading = openingId === a.lesson_id;
    return (
      <button
        onClick={() => onOpenLesson(a)}
        disabled={!a.lesson_id || isLoading}
        className={cn(
          "flex flex-col items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 p-4 text-left transition",
          a.lesson_id
            ? "cursor-pointer hover:border-primary/60 hover:bg-primary/10"
            : "cursor-default opacity-70",
        )}
      >
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-1.5">
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary-glow" />
            ) : (
              <BookOpen className="h-4 w-4 text-primary-glow" />
            )}
            <span className="text-[10px] font-bold uppercase tracking-wide text-primary-glow">
              Slides
            </span>
          </div>
          {date && <span className="text-xs text-muted-foreground">{date}</span>}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">
            {a.title || a.topic || "Untitled"}
          </div>
          {a.subject && (
            <div className="truncate text-xs text-muted-foreground">{a.subject}</div>
          )}
        </div>
        {a.lesson_id && (
          <span className="text-xs text-primary-glow">
            {isLoading ? "Opening…" : "Tap to preview →"}
          </span>
        )}
      </button>
    );
  }

  if (a.type === "quiz") {
    const isLoading = openingId === a.quiz_id;
    return (
      <button
        onClick={() => onOpenQuiz(a)}
        disabled={!a.quiz_id || isLoading}
        className={cn(
          "flex flex-col items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 p-4 text-left transition",
          a.quiz_id
            ? "cursor-pointer hover:border-warning/60 hover:bg-warning/10"
            : "cursor-default opacity-70",
        )}
      >
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-1.5">
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-warning" />
            ) : (
              <ListChecks className="h-4 w-4 text-warning" />
            )}
            <span className="text-[10px] font-bold uppercase tracking-wide text-warning">
              Quiz
            </span>
          </div>
          {date && <span className="text-xs text-muted-foreground">{date}</span>}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">
            {a.topic || "Untitled"}
          </div>
          {a.subject && (
            <div className="truncate text-xs text-muted-foreground">{a.subject}</div>
          )}
        </div>
        {(a.num_questions != null || a.question_type) && (
          <div className="text-xs text-muted-foreground">
            {[
              a.num_questions ? `${a.num_questions} questions` : null,
              a.question_type?.toUpperCase(),
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        )}
        {a.quiz_id && (
          <span className="text-xs text-warning">
            {isLoading ? "Opening…" : "Tap to preview →"}
          </span>
        )}
      </button>
    );
  }

  // assignment
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-success/30 bg-success/5 p-4">
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-1.5">
          <ClipboardCheck className="h-4 w-4 text-success" />
          <span className="text-[10px] font-bold uppercase tracking-wide text-success">
            Assigned
          </span>
        </div>
        {date && <span className="text-xs text-muted-foreground">{date}</span>}
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-foreground">
          {a.topic || "Untitled"}
        </div>
        {a.task_type && (
          <div className="truncate text-xs text-muted-foreground capitalize">{a.task_type}</div>
        )}
      </div>
      {a.student_count != null && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="h-3 w-3 shrink-0" />
          {a.student_count} student{a.student_count === 1 ? "" : "s"}
          {a.students?.length
            ? `: ${a.students.slice(0, 3).join(", ")}${a.students.length > 3 ? `…+${a.students.length - 3}` : ""}`
            : ""}
        </div>
      )}
    </div>
  );
}

// ── Quiz preview modal ────────────────────────────────────────────────────────

function QuizPreviewModal({
  quiz,
  onClose,
}: {
  quiz: QuizRecord | null;
  onClose: () => void;
}) {
  if (!quiz) return null;
  const questions: QuizQuestion[] = quiz.questions_jsonb ?? [];
  const qType = quiz.question_type ?? "mcq";

  return (
    <Dialog open={!!quiz} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-base">
            {quiz.topic || "Quiz"}
          </DialogTitle>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {quiz.subject && (
              <Badge variant="secondary" className="text-xs">{quiz.subject}</Badge>
            )}
            {quiz.difficulty_level && (
              <Badge variant="outline" className="text-xs capitalize">{quiz.difficulty_level}</Badge>
            )}
            {qType && (
              <Badge variant="outline" className="text-xs uppercase">{qType}</Badge>
            )}
            {quiz.language && (
              <Badge variant="outline" className="text-xs">{quiz.language}</Badge>
            )}
          </div>
        </DialogHeader>

        {questions.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No questions found.</p>
        ) : (
          <ol className="space-y-5 pt-2">
            {questions.map((q, i) => (
              <li key={i} className="rounded-xl border border-border bg-card/50 p-4">
                <p className="mb-3 text-sm font-medium text-foreground">
                  <span className="mr-1.5 font-bold text-primary">{i + 1}.</span>
                  {q.question}
                </p>

                {/* MCQ options */}
                {q.options && q.options.length > 0 && (
                  <ul className="space-y-1.5">
                    {q.options.map((opt, oi) => {
                      const letter = String.fromCharCode(65 + oi); // A, B, C, D
                      const isCorrect = opt === q.correct_answer;
                      return (
                        <li
                          key={oi}
                          className={cn(
                            "flex items-start gap-2 rounded-lg px-3 py-2 text-sm",
                            isCorrect
                              ? "bg-success/15 text-success font-medium"
                              : "bg-muted/40 text-muted-foreground",
                          )}
                        >
                          <span className="shrink-0 font-semibold">{letter}.</span>
                          {opt}
                          {isCorrect && (
                            <span className="ml-auto shrink-0 text-xs font-bold">✓</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {/* Short answer model answer */}
                {qType === "short_answer" && q.model_answer && (
                  <div className="mt-2 rounded-lg bg-success/10 px-3 py-2 text-xs text-success">
                    <span className="font-semibold">Model answer: </span>{q.model_answer}
                  </div>
                )}

                {/* Essay model answer */}
                {qType === "essay" && q.model_essay && (
                  <div className="mt-2 rounded-lg bg-success/10 px-3 py-2 text-xs text-success">
                    <span className="font-semibold">Model essay: </span>{q.model_essay}
                  </div>
                )}

                {q.kbat_level && (
                  <div className="mt-2 text-[10px] text-muted-foreground/70">
                    KBAT: {q.kbat_level}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
