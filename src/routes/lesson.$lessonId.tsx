import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, MessageCircle, Presentation, Target, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TutorChatDrawer } from "@/components/TutorChatDrawer";
import { LessonSlideDeck } from "@/components/LessonSlideDeck";
import { fetchLessonById, completeAiTask, type Lesson } from "@/services/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

interface LessonSearch {
  taskId?: string;
  subject?: string;
  topic?: string;
}

export const Route = createFileRoute("/lesson/$lessonId")({
  validateSearch: (search: Record<string, unknown>): LessonSearch => ({
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
    subject: typeof search.subject === "string" ? search.subject : undefined,
    topic: typeof search.topic === "string" ? search.topic : undefined,
  }),
  head: ({ params }) => ({
    meta: [
      { title: `Lesson ${params.lessonId} — Skor` },
      { name: "description", content: "Lesson slides with AI tutor chat." },
    ],
  }),
  component: LessonDetailPage,
});

function LessonDetailPage() {
  const { lessonId } = Route.useParams();
  const { taskId, subject: searchSubject, topic: searchTopic } = Route.useSearch();
  const { user } = useAuth();
  const { lang } = useI18n();
  const navigate = useNavigate();
  const isMs = lang === "ms";
  const STUDENT_ID = user?.id ?? "00000000-0000-0000-0000-000000000001";

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [deckOpen, setDeckOpen] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    fetchLessonById(lessonId)
      .then((l) => {
        if (cancelled) return;
        setLesson(l);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lessonId]);

  const subject = lesson?.subject || searchSubject || "";
  const topic = lesson?.topic || searchTopic || "";
  const title = lesson?.title || topic || (isMs ? "Pelajaran" : "Lesson");

  const handlePractice = () => {
    // Reuse the existing dashboard deep-link handoff: the home route consumes
    // `kp_practice_intent` on mount and auto-starts a free-practice session.
    try {
      sessionStorage.setItem("kp_practice_intent", JSON.stringify({ subject, topic }));
    } catch {
      // sessionStorage unavailable — fall through to plain navigation.
    }
    void navigate({ to: "/" });
  };

  const handleComplete = () => {
    if (!taskId || done) return;
    setCompleting(true);
    void completeAiTask(taskId)
      .then(() => setDone(true))
      .finally(() => setCompleting(false));
  };

  return (
    <div className="relative min-h-[100dvh] bg-gradient-feed text-foreground">
      <header className="relative z-10 flex items-center justify-between px-5 pt-5">
        <Link
          to="/"
          className="flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1.5 text-sm backdrop-blur hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {isMs ? "Kembali" : "Back"}
        </Link>
        {taskId && (
          <Button
            variant={done ? "secondary" : "outline"}
            size="sm"
            onClick={handleComplete}
            disabled={completing || done}
            className="rounded-full"
          >
            {done ? (
              <>
                <CheckCircle2 className="mr-1.5 h-4 w-4 text-green-500" />
                {isMs ? "Selesai" : "Done"}
              </>
            ) : completing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              isMs ? "Tanda selesai" : "Mark done"
            )}
          </Button>
        )}
      </header>

      <main className="relative z-10 mx-auto max-w-md px-4 pt-6 pb-24">
        <section className="rounded-3xl border border-border/70 bg-card/70 p-5 backdrop-blur">
          <div className="text-xs uppercase tracking-widest text-primary-glow">
            {[subject, topic].filter(Boolean).join(" · ") || (isMs ? "Pelajaran" : "Lesson")}
          </div>
          <h1 className="mt-2 font-display text-2xl font-semibold leading-snug">
            {loading ? (isMs ? "Memuatkan…" : "Loading…") : title}
          </h1>

          {failed ? (
            <p className="mt-3 text-sm text-destructive">
              {isMs
                ? "Tidak dapat memuatkan pelajaran ini. Cuba lagi nanti."
                : "Couldn't load this lesson. Please try again later."}
            </p>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              {isMs
                ? "Tonton slaid, tanya tutor AI, kemudian cuba latihan untuk topik ini."
                : "View the slides, ask the AI tutor, then try practice questions on this topic."}
            </p>
          )}

          <div className="mt-5 flex flex-col gap-3">
            <Button
              onClick={() => setDeckOpen(true)}
              size="lg"
              disabled={loading || failed}
              className="h-12 rounded-2xl bg-gradient-primary px-6 font-bold shadow-glow"
            >
              <Presentation className="mr-2 h-4 w-4" />
              {isMs ? "Tonton Slaid" : "View Slides"}
            </Button>

            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={() => setChatOpen(true)}
                variant="outline"
                size="lg"
                className="h-12 rounded-2xl font-semibold"
              >
                <MessageCircle className="mr-2 h-4 w-4" />
                {isMs ? "Tanya Tutor" : "Ask Tutor"}
              </Button>
              <Button
                onClick={handlePractice}
                variant="outline"
                size="lg"
                disabled={!subject || !topic}
                className="h-12 rounded-2xl font-semibold"
              >
                <Target className="mr-2 h-4 w-4" />
                {isMs ? "Latihan" : "Practice"}
              </Button>
            </div>
          </div>
        </section>
      </main>

      <LessonSlideDeck
        open={deckOpen && !!lesson}
        onClose={() => setDeckOpen(false)}
        lesson={lesson}
        subject={subject}
        topic={topic}
      />

      <TutorChatDrawer
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        studentId={STUDENT_ID}
        lessonId={lessonId}
        language={lang}
      />
    </div>
  );
}
