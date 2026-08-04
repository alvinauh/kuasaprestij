import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TutorChatDrawer } from "@/components/TutorChatDrawer";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/lesson/$lessonId")({
  head: ({ params }) => ({
    meta: [
      { title: `Lesson ${params.lessonId} — Skor` },
      { name: "description", content: "Lesson detail with AI tutor chat." },
    ],
  }),
  component: LessonDetailPage,
});

function LessonDetailPage() {
  const { lessonId } = Route.useParams();
  const { user } = useAuth();
  const { lang } = useI18n();
  const [chatOpen, setChatOpen] = useState(true);
  const STUDENT_ID = user?.id ?? "00000000-0000-0000-0000-000000000001";
  const isMs = lang === "ms";

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
      </header>

      <main className="relative z-10 mx-auto max-w-md px-4 pt-6 pb-24">
        <section className="rounded-3xl border border-border/70 bg-card/70 p-5 backdrop-blur">
          <div className="text-xs uppercase tracking-widest text-primary-glow">
            {isMs ? "Pelajaran" : "Lesson"}
          </div>
          <h1 className="mt-2 font-display text-2xl font-semibold leading-snug break-all">
            {lessonId}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {isMs
              ? "Buka panel tutor untuk bertanya tentang pelajaran ini."
              : "Open the tutor panel to ask questions about this lesson."}
          </p>
          <Button
            onClick={() => setChatOpen(true)}
            size="lg"
            className="mt-5 h-12 rounded-2xl bg-gradient-primary px-6 font-bold shadow-glow"
          >
            <MessageCircle className="mr-2 h-4 w-4" />
            {isMs ? "Tanya Tutor" : "Ask Tutor"}
          </Button>
        </section>
      </main>

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
