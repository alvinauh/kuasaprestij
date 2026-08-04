import { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  Send,
  Loader2,
  BookOpen,
  ListChecks,
  ClipboardCheck,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  sendTeacherChat,
  fetchTeacherChatHistory,
  fetchLessonById,
  type TeacherChatMessage,
  type TeacherChatArtifact,
  type Lesson,
} from "@/services/api";
import { LessonSlideDeck } from "@/components/LessonSlideDeck";

/**
 * AI Controller — the teacher talks to the platform in plain language.
 * It reads what students are weak at, generates slides/questions grounded in the
 * DSKP syllabus, assigns tasks, and remembers what was already assigned.
 * Backed by POST /teacher/chat (agents/teacher_agent.py planner loop).
 */

const SUGGESTIONS = [
  "Which topics is the class weakest on right now?",
  "Make a 5-question MCQ quiz on Photosynthesis for Form 4 Biology.",
  "Generate slides on Kinematics, then assign a practice task to the weak students.",
  "What have I assigned so far this week?",
];

function ArtifactCard({
  a,
  onOpenLesson,
  loading,
}: {
  a: TeacherChatArtifact;
  onOpenLesson?: (a: TeacherChatArtifact) => void;
  loading?: boolean;
}) {
  if (a.type === "lesson") {
    const clickable = !!a.lesson_id && !!onOpenLesson;
    return (
      <button
        type="button"
        disabled={!clickable || loading}
        onClick={clickable ? () => onOpenLesson!(a) : undefined}
        className={cn(
          "mt-2 flex w-full items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3 text-left transition",
          clickable && "hover:border-primary/60 hover:bg-primary/10",
        )}
      >
        {loading ? (
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary-glow" />
        ) : (
          <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-primary-glow" />
        )}
        <div className="text-sm">
          <div className="font-semibold text-foreground">Slides / notes ready</div>
          <div className="text-muted-foreground">{a.title || a.topic}</div>
          {clickable && (
            <div className="mt-0.5 text-xs text-primary-glow">
              {loading ? "Opening…" : "Tap to preview"}
            </div>
          )}
        </div>
      </button>
    );
  }
  if (a.type === "quiz") {
    return (
      <div className="mt-2 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/5 p-3">
        <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <div className="text-sm">
          <div className="font-semibold text-foreground">
            {a.num_questions ?? ""} {a.question_type?.toUpperCase() || "quiz"} question(s)
          </div>
          <div className="text-muted-foreground">{a.topic}</div>
          {a.quiz_id && (
            <div className="mt-0.5 text-xs text-muted-foreground/70">Quiz ID: {a.quiz_id}</div>
          )}
        </div>
      </div>
    );
  }
  // assignment
  return (
    <div className="mt-2 flex items-start gap-3 rounded-xl border border-success/30 bg-success/5 p-3">
      <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
      <div className="text-sm">
        <div className="font-semibold text-foreground">
          Assigned to {a.student_count ?? 0} student(s)
        </div>
        <div className="text-muted-foreground">
          {a.task_type} · {a.topic}
        </div>
        {a.students && a.students.length > 0 && (
          <div className="mt-0.5 text-xs text-muted-foreground/70">{a.students.join(", ")}</div>
        )}
      </div>
    </div>
  );
}

export function AiControllerPanel() {
  const [messages, setMessages] = useState<TeacherChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Lesson preview: fetch an already-generated lesson by id (no regeneration)
  // and show it in the shared LessonNotesModal.
  const [previewLesson, setPreviewLesson] = useState<Lesson | null>(null);
  const [previewMeta, setPreviewMeta] = useState<{ topic: string; subject: string } | null>(null);
  const [loadingLessonId, setLoadingLessonId] = useState<string | null>(null);

  const openLesson = async (a: TeacherChatArtifact) => {
    if (!a.lesson_id) return;
    setLoadingLessonId(a.lesson_id);
    setError(null);
    try {
      const lesson = await fetchLessonById(a.lesson_id);
      setPreviewLesson(lesson);
      setPreviewMeta({ topic: a.topic || lesson.title || "", subject: a.subject || "" });
    } catch (e) {
      console.error("[AiController] lesson preview failed", e);
      setError("Couldn't open that lesson. Try again in a moment.");
    } finally {
      setLoadingLessonId(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const hist = await fetchTeacherChatHistory();
        if (!cancelled) setMessages(hist);
      } catch (e) {
        console.warn("[AiController] history load failed", e);
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || sending) return;
    setError(null);
    setMessages((m) => [...m, { role: "teacher", content: msg }]);
    setInput("");
    setSending(true);
    try {
      const { reply, artifacts } = await sendTeacherChat(msg);
      setMessages((m) => [...m, { role: "assistant", content: reply, artifacts }]);
    } catch (e) {
      console.error("[AiController] send failed", e);
      setError("The controller failed to respond. Try again in a moment.");
    } finally {
      setSending(false);
    }
  };

  const empty = !loadingHistory && messages.length === 0;

  return (
    <div className="flex h-[calc(100dvh-13rem)] flex-col rounded-2xl border border-border bg-card/60 shadow-card">
      <div className="flex items-center gap-2 border-b border-border/60 px-5 py-3">
        <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-primary">
          <Sparkles className="h-4 w-4 text-primary-foreground" />
        </div>
        <div>
          <div className="font-display text-sm font-bold">AI Controller</div>
          <div className="text-xs text-muted-foreground">
            Ask it to check weak topics, make slides & questions, or assign tasks.
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {loadingHistory && (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {empty && (
          <div className="mx-auto max-w-xl pt-6 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gradient-primary">
              <Sparkles className="h-6 w-6 text-primary-foreground" />
            </div>
            <h3 className="mt-3 font-display text-lg font-bold">Run your class from one chat</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              I know who's weak at what and what you've assigned. Tell me what you need.
            </p>
            <div className="mt-4 grid gap-2 text-left">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => void send(s)}
                  className="rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground transition hover:border-primary/50 hover:bg-card/80"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={cn("flex", m.role === "teacher" ? "justify-end" : "justify-start")}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                m.role === "teacher"
                  ? "rounded-br-md bg-primary text-primary-foreground"
                  : "rounded-bl-md bg-muted/60 text-foreground",
              )}
            >
              <span className="whitespace-pre-wrap">{m.content}</span>
              {m.artifacts?.map((a, j) => (
                <ArtifactCard
                  key={j}
                  a={a}
                  onOpenLesson={openLesson}
                  loading={!!a.lesson_id && loadingLessonId === a.lesson_id}
                />
              ))}
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md bg-muted/60 px-4 py-2.5 text-sm text-muted-foreground">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              Working on it…
            </div>
          </div>
        )}
      </div>

      {error && <div className="px-4 pb-1 text-xs text-destructive">{error}</div>}

      <div className="flex items-center gap-2 border-t border-border/60 p-3">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. Quiz the weak students on Kinematics and assign it"
          disabled={sending}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          className="h-11 rounded-2xl"
        />
        <Button
          onClick={() => void send(input)}
          disabled={sending || !input.trim()}
          size="icon"
          className="h-11 w-11 shrink-0 rounded-2xl bg-gradient-primary"
          aria-label="Send"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>

      <LessonSlideDeck
        open={!!previewLesson}
        onClose={() => setPreviewLesson(null)}
        lesson={previewLesson}
        subject={previewMeta?.subject || ""}
        topic={previewMeta?.topic || ""}
      />
    </div>
  );
}
