import { useState } from "react";
import { ChevronDown, Lightbulb, Package, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GenerateTaskResult } from "@/services/api";

// What the student will get from an AI Task: cached questions + object lessons,
// adapted by the AI (hint per question, reworded object lesson, simpler wording when
// the student's support plan asks for it). Options and answers are never changed.
export function SupportTaskPreview({ result }: { result: GenerateTaskResult }) {
  const [open, setOpen] = useState<number | null>(0);
  const qs = result.questions ?? [];

  if (result.source !== "cached" || qs.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-background/40 px-3 py-2 text-xs text-muted-foreground">
        No ready-made questions for <span className="font-medium text-foreground">{result.topic}</span> yet, so
        this is a written task. The student practises the topic in a normal session.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 font-semibold text-sky-300">
          <Package className="h-3 w-3" /> {qs.length} cached question{qs.length !== 1 ? "s" : ""}
        </span>
        {result.ai_adapted ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/20 px-2 py-0.5 font-semibold text-violet-200">
            <Sparkles className="h-3 w-3" /> Adapted by AI
          </span>
        ) : (
          <span className="rounded-full bg-warning/15 px-2 py-0.5 font-semibold text-warning">
            AI support unavailable: cached questions as-is
          </span>
        )}
        {(result.supports_applied ?? []).map((s) => (
          <span key={s} className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-300">
            {s}
          </span>
        ))}
      </div>
      {(result.mistakes_targeted ?? []).length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Hints target: {(result.mistakes_targeted ?? []).slice(0, 2).join(" · ")}
        </p>
      )}

      <ol className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
        {qs.map((q, i) => (
          <li key={i} className="rounded-lg border border-border/70 bg-background/40">
            <button
              type="button"
              onClick={() => setOpen(open === i ? null : i)}
              className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs"
            >
              <span className="font-semibold text-muted-foreground">{i + 1}.</span>
              <span className={cn("min-w-0 flex-1", open === i ? "" : "line-clamp-2")}>{q.question}</span>
              <ChevronDown className={cn("mt-0.5 h-3.5 w-3.5 shrink-0 transition", open === i && "rotate-180")} />
            </button>
            {open === i && (
              <div className="space-y-2 border-t border-border/60 px-3 py-2 text-xs">
                {q.original_question && (
                  <p className="text-muted-foreground">
                    <span className="font-medium">Simplified from:</span> {q.original_question}
                  </p>
                )}
                <ul className="space-y-0.5">
                  {q.options.map((o, j) => (
                    <li key={j} className={o === q.correct_answer ? "font-semibold text-success" : "text-muted-foreground"}>
                      {String.fromCharCode(65 + j)}. {o} {o === q.correct_answer && "✓"}
                    </li>
                  ))}
                </ul>
                {q.object_lesson && (
                  <p className="rounded-md bg-sky-500/10 px-2 py-1.5 text-sky-100">
                    <span className="font-semibold text-sky-300">Object lesson: </span>
                    {q.object_lesson}
                  </p>
                )}
                {q.support_hint && (
                  <p className="flex gap-1.5 rounded-md bg-amber-500/10 px-2 py-1.5 text-amber-100">
                    <Lightbulb className="mt-0.5 h-3 w-3 shrink-0 text-amber-300" />
                    <span><span className="font-semibold text-amber-300">Hint: </span>{q.support_hint}</span>
                  </p>
                )}
                {q.has_worked_example && <p className="text-muted-foreground">Starts with the topic's worked example.</p>}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
