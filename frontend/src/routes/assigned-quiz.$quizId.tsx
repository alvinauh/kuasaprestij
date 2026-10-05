import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import {
  fetchAssignedQuiz,
  submitAssignedQuiz,
  type AssignedQuiz,
  type AssignedQuizResult,
} from "@/services/api";

// Plays a quiz exactly as the teacher sent it (Command Centre → Send).
// Lives at /assigned-quiz because nginx routes /quiz/* to the API.

interface QuizSearch {
  taskId?: string;
}

export const Route = createFileRoute("/assigned-quiz/$quizId")({
  validateSearch: (search: Record<string, unknown>): QuizSearch => ({
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
  }),
  head: () => ({ meta: [{ title: "Quiz — Skor" }] }),
  component: AssignedQuizPage,
});

function AssignedQuizPage() {
  const { quizId } = Route.useParams();
  const { taskId } = Route.useSearch();
  const { lang } = useI18n();
  const isMs = lang === "ms";

  const [quiz, setQuiz] = useState<AssignedQuiz | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AssignedQuizResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAssignedQuiz(quizId)
      .then((q) => {
        if (cancelled) return;
        setQuiz(q);
        setAnswers(q.questions.map(() => ""));
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [quizId]);

  const unanswered = answers.filter((a) => !a.trim()).length;

  async function submit() {
    setSubmitting(true);
    try {
      setResult(await submitAssignedQuiz(quizId, answers, taskId));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-[100dvh] bg-gradient-feed text-foreground">
      <header className="relative z-10 flex items-center px-5 pt-5">
        <Link to="/" className="flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1.5 text-sm backdrop-blur hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          {isMs ? "Kembali" : "Back"}
        </Link>
      </header>

      <main className="relative z-10 mx-auto max-w-2xl space-y-4 px-4 pt-6 pb-24">
        <section className="rounded-3xl border border-border/70 bg-card/70 p-5 backdrop-blur">
          <div className="text-xs uppercase tracking-widest text-primary-glow">
            {isMs ? "Kuiz daripada guru" : "Quiz from your teacher"}
          </div>
          <h1 className="mt-2 font-display text-2xl font-semibold leading-snug">
            {quiz?.topic ?? (error ? (isMs ? "Kuiz" : "Quiz") : isMs ? "Memuatkan…" : "Loading…")}
          </h1>
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
          {result && (
            <p className="mt-3 text-lg font-semibold">
              {result.total > 0
                ? `${isMs ? "Markah" : "Score"}: ${result.score} / ${result.total}`
                : isMs ? "Dihantar! Bandingkan jawapan anda dengan jawapan contoh." : "Submitted! Compare your answers with the model answers."}
            </p>
          )}
        </section>

        {!quiz && !error && (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
        )}

        {quiz?.questions.map((q, i) => {
          const r = result?.results[i];
          const isMcq = (q.question_type ?? quiz.question_type) === "mcq";
          return (
            <section key={i} className="rounded-2xl border border-border/70 bg-card/70 p-4 backdrop-blur">
              <div className="flex items-start gap-2">
                <span className="font-bold text-primary">{i + 1}.</span>
                <p className="flex-1 whitespace-pre-line text-sm font-medium">{q.question}</p>
                {r?.correct === true && <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />}
                {r?.correct === false && <XCircle className="h-5 w-5 shrink-0 text-destructive" />}
              </div>

              {isMcq ? (
                <div className="mt-3 space-y-2">
                  {(q.options ?? []).map((opt, oi) => {
                    const chosen = answers[i] === opt;
                    const isKey = r && opt === r.correct_answer;
                    return (
                      <button key={oi} type="button" disabled={!!result}
                        onClick={() => setAnswers((a) => a.map((x, k) => (k === i ? opt : x)))}
                        className={cn(
                          "flex w-full items-start gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition",
                          isKey ? "border-success bg-success/15"
                            : r && chosen ? "border-destructive bg-destructive/10"
                            : chosen ? "border-primary bg-primary/15"
                            : "border-border bg-muted/30 hover:bg-muted/60",
                        )}>
                        <span className="font-semibold">{String.fromCharCode(65 + oi)}.</span>
                        <span>{opt}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <Textarea className="mt-3" rows={4} disabled={!!result} value={answers[i] ?? ""}
                  placeholder={isMs ? "Tulis jawapan anda" : "Write your answer"}
                  onChange={(e) => setAnswers((a) => a.map((x, k) => (k === i ? e.target.value : x)))} />
              )}

              {r?.explanation && <p className="mt-2 text-xs text-muted-foreground">{r.explanation}</p>}
              {r?.model_answer && (
                <div className="mt-2 rounded-lg bg-success/10 px-3 py-2 text-xs">
                  <span className="font-semibold">{isMs ? "Jawapan contoh: " : "Model answer: "}</span>
                  {r.model_answer}
                </div>
              )}
            </section>
          );
        })}

        {quiz && !result && (
          <Button size="lg" onClick={() => void submit()} disabled={submitting || unanswered === quiz.questions.length}
            className="h-12 w-full rounded-2xl bg-gradient-primary font-bold shadow-glow">
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isMs ? "Hantar" : "Submit"}
            {unanswered > 0 && ` (${unanswered} ${isMs ? "belum dijawab" : "unanswered"})`}
          </Button>
        )}
      </main>
    </div>
  );
}
