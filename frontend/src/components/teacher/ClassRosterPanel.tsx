import { useMemo, useState } from "react";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RosterStatus, RosterStudent } from "@/services/api";

// Every student in the selected class, so the teacher sees the whole class and not
// only the students with recurring errors (those also get a diagnostic card below).
const STATUS: Record<RosterStatus, { label: string; hint: string; pill: string; dot: string }> = {
  needs_help: {
    label: "Needs help",
    hint: "Same mistake on the same topic at least twice",
    pill: "bg-destructive/15 text-destructive",
    dot: "bg-destructive",
  },
  some_mistakes: {
    label: "Some mistakes",
    hint: "Under 70% correct",
    pill: "bg-warning/15 text-warning",
    dot: "bg-warning",
  },
  doing_fine: {
    label: "Doing fine",
    hint: "70% or more correct",
    pill: "bg-success/15 text-success",
    dot: "bg-success",
  },
  not_started: {
    label: "Not started",
    hint: "No answers yet",
    pill: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/50",
  },
};
const ORDER: RosterStatus[] = ["needs_help", "some_mistakes", "doing_fine", "not_started"];

function lastActive(iso: string | null): string {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
}

interface Props {
  roster: RosterStudent[];
  className?: string;
  onShowDiagnostic?: (studentId: string) => void;
}

export function ClassRosterPanel({ roster, className: cls, onShowDiagnostic }: Props) {
  const [filter, setFilter] = useState<RosterStatus | "all">("all");
  const counts = useMemo(() => {
    const c: Record<RosterStatus, number> = { needs_help: 0, some_mistakes: 0, doing_fine: 0, not_started: 0 };
    for (const s of roster) c[s.status] += 1;
    return c;
  }, [roster]);
  const shown = useMemo(
    () =>
      roster
        .filter((s) => filter === "all" || s.status === filter)
        .sort(
          (a, b) =>
            ORDER.indexOf(a.status) - ORDER.indexOf(b.status) ||
            (a.accuracy ?? 101) - (b.accuracy ?? 101) ||
            (a.student_name ?? "").localeCompare(b.student_name ?? ""),
        ),
    [roster, filter],
  );

  return (
    <section className={cn("rounded-2xl border border-border bg-card p-4 shadow-card sm:p-6", cls)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold">Class Roster</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Every student in this class and how they're doing</p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" /> {roster.length} student{roster.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => setFilter("all")}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition",
            filter === "all" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          All {roster.length}
        </button>
        {ORDER.map((st) => (
          <button
            key={st}
            onClick={() => setFilter(filter === st ? "all" : st)}
            title={STATUS[st].hint}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition",
              filter === st ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <span className={cn("h-2 w-2 rounded-full", STATUS[st].dot)} />
            {STATUS[st].label} {counts[st]}
          </button>
        ))}
      </div>

      {roster.length === 0 ? (
        <p className="text-sm text-muted-foreground">No students in this class yet.</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">No students in this group.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {shown.map((s) => {
            const tail = s.student_id.replace(/-/g, "").slice(-4).toUpperCase();
            return (
              <li key={s.student_id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.student_name || `Student #${tail}`}</p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {s.answered > 0 ? `${s.correct}/${s.answered} correct · ${s.accuracy}%` : "No answers yet"}
                    {s.last_active ? ` · ${lastActive(s.last_active)}` : ""}
                  </p>
                </div>
                {s.status === "needs_help" && onShowDiagnostic ? (
                  <button
                    onClick={() => onShowDiagnostic(s.student_id)}
                    title="Show this student's diagnostic card"
                    className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold hover:underline", STATUS[s.status].pill)}
                  >
                    {STATUS[s.status].label} →
                  </button>
                ) : (
                  <span title={STATUS[s.status].hint} className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold", STATUS[s.status].pill)}>
                    {STATUS[s.status].label}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
