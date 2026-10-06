import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, BookOpen, CheckCircle2, Lightbulb, Loader2, Sparkles, XCircle } from "lucide-react";
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
  const [hintsShown, setHintsShown] = useState<Record<number, boolean>>({});

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
          {result?.recorded && !result.recorded.first_attempt && (
            <p className="mt-1 text-xs text-muted-foreground">
              {isMs
                ? `Cubaan semula — markah yang dihantar kepada guru kekal ${result.recorded.score}/${result.recorded.max_score ?? "?"}.`
                : `Retake — the score your teacher sees stays ${result.recorded.score}/${result.recorded.max_score ?? "?"}.`}
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
              {q.worked_example && (
                <details open className="mb-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm">
                  <summary className="flex cursor-pointer items-center gap-1.5 font-semibold text-emerald-300">
                    <BookOpen className="h-4 w-4" /> {isMs ? "Contoh berpandu dahulu" : "Worked example first"}
                  </summary>
                  <p className="mt-2 whitespace-pre-line text-foreground/90">{q.worked_example}</p>
                </details>
              )}
              {q.object_lesson && (
                <div className="mb-3 rounded-xl border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-sm">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-sky-300">
                    <Sparkles className="h-3.5 w-3.5" /> {isMs ? "Fikirkan ini dahulu" : "Think about this first"}
                  </p>
                  <p className="mt-1 text-foreground/90">{q.object_lesson}</p>
                </div>
              )}
              {(q.passage || q.stimulus) && (
                <p className="mb-3 whitespace-pre-line rounded-xl bg-muted/40 px-3 py-2 text-sm text-foreground/90">
                  {q.passage || q.stimulus}
                </p>
              )}
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

              {q.support_hint && !result && (
                hintsShown[i] ? (
                  <p className="mt-3 flex gap-1.5 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                    <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" /> {q.support_hint}
                  </p>
                ) : (
                  <button type="button" onClick={() => setHintsShown((h) => ({ ...h, [i]: true }))}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 px-3 py-1 text-xs font-medium text-amber-200 hover:bg-amber-500/10">
                    <Lightbulb className="h-3.5 w-3.5" /> {isMs ? "Perlukan petunjuk?" : "Need a hint?"}
                  </button>
                )
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
