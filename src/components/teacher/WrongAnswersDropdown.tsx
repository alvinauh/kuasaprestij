import { useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchStudentWrongAnswers, type StudentWrongAnswer } from "@/services/api";

const LETTERS = ["A", "B", "C", "D", "E"];

/** Options as a list. Stored either as ["…"] or {A: "…"}. */
function optionList(o: StudentWrongAnswer["options_json"]): string[] {
  if (Array.isArray(o)) return o.map((x) => String(x ?? ""));
  if (o && typeof o === "object") return LETTERS.map((l) => o[l]).filter((x): x is string => !!x);
  return [];
}

/** Index of the option an answer refers to: a bare letter ("B"), a lettered
 *  option ("B) …") or the option text itself. -1 if none matches. */
function optionIndex(options: string[], answer: string | null): number {
  const a = (answer ?? "").trim();
  if (!a) return -1;
  const letter = a.match(/^\(?([A-Ea-e])[).:]?$/);
  if (letter) return LETTERS.indexOf(letter[1].toUpperCase());
  const low = a.toLowerCase();
  const exact = options.findIndex((o) => o.trim().toLowerCase() === low);
  if (exact >= 0) return exact;
  return options.findIndex((o) => {
    const t = o.trim().toLowerCase();
    return t.length > 0 && (t.startsWith(low) || low.startsWith(t));
  });
}

function WrongAnswerItem({ q }: { q: StudentWrongAnswer }) {
  const options = optionList(q.options_json);
  const picked = optionIndex(options, q.student_answer);
  const correct = optionIndex(options, q.correct_answer);
  const date = new Date(q.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short" });

  return (
    <li className="rounded-lg border border-border/60 bg-card p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
        <span className="font-semibold text-foreground/80">{q.topic || "Unknown topic"}</span>
        {q.subject && <span>· {q.subject}</span>}
        {q.error_category && (
          <span className="rounded-full bg-destructive/15 px-1.5 py-0.5 font-semibold text-destructive">{q.error_category}</span>
        )}
        <span className="ml-auto">{date}</span>
      </div>

      {q.question_text ? (
        <p className="text-xs text-foreground leading-relaxed whitespace-pre-line">{q.question_text}</p>
      ) : (
        <p className="text-xs text-muted-foreground italic">
          Question text wasn't recorded for this answer (logged before questions were saved).
        </p>
      )}

      {options.length > 0 ? (
        <ul className="space-y-1">
          {options.map((opt, i) => (
            <li
              key={i}
              className={cn(
                "flex items-start gap-2 rounded-md border px-2 py-1 text-xs",
                i === correct
                  ? "border-success/40 bg-success/10 text-foreground"
                  : i === picked
                    ? "border-destructive/40 bg-destructive/10 text-foreground"
                    : "border-border/50 text-muted-foreground",
              )}
            >
              <span className="font-bold shrink-0">{LETTERS[i]}</span>
              <span className="flex-1">{opt.replace(/^\(?[A-Ea-e][).:]\s*/, "")}</span>
              {i === picked && <span className="shrink-0 text-[10px] font-semibold text-destructive">Their answer</span>}
              {i === correct && <span className="shrink-0 text-[10px] font-semibold text-success">Correct</span>}
            </li>
          ))}
        </ul>
      ) : null}

      {/* Written answers, or MCQ answers that don't match a stored option. */}
      {(options.length === 0 || picked < 0) && q.student_answer && (
        <p className="text-xs">
          <span className="font-semibold text-destructive">Their answer: </span>
          <span className="text-foreground/90 whitespace-pre-line">{q.student_answer}</span>
        </p>
      )}
      {(options.length === 0 || correct < 0) && q.correct_answer && (
        <p className="text-xs">
          <span className="font-semibold text-success">Correct answer: </span>
          <span className="text-foreground/90 whitespace-pre-line">{q.correct_answer}</span>
        </p>
      )}

      {(q.feedback_text || q.root_cause) && (
        <p className="text-xs text-muted-foreground leading-relaxed border-t border-border/40 pt-2">
          <span className="font-semibold text-foreground/80">Why it was wrong: </span>
          {q.feedback_text || q.root_cause}
        </p>
      )}
    </li>
  );
}

/** "Questions they got wrong" for one student. Loads on first open. */
export function WrongAnswersDropdown({ studentId, displayName }: { studentId: string; displayName: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<StudentWrongAnswer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (!next || items || loading) return;
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchStudentWrongAnswers(studentId));
    } catch {
      setError("Couldn't load the questions. Close and open again to retry.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-destructive/20 bg-destructive/5">
      <button
        onClick={() => void toggle()}
        className="w-full flex items-center justify-between gap-2 p-3 text-left"
        aria-expanded={open}
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-destructive">
          ❌ Questions {displayName} got wrong{items ? ` (${items.length})` : ""}
        </span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="px-3 pb-3">
          {loading && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading questions…
            </p>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
          {items && items.length === 0 && (
            <p className="text-xs text-muted-foreground italic">No wrong answers recorded yet.</p>
          )}
          {items && items.length > 0 && (
            <ul className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
              {items.map((q) => <WrongAnswerItem key={q.id} q={q} />)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
