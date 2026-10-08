import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { FlaggedStudent } from "@/services/api";

export function FlaggedStudentCard({ student }: { student: FlaggedStudent }) {
  const [expanded, setExpanded] = useState(false);

  const shortId = (student.student_id || "").slice(0, 8).toUpperCase();

  return (
    <div className="rounded-xl border border-warning/30 bg-card overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-3 text-left hover:bg-accent/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-warning/20 flex items-center justify-center text-warning text-xs font-bold">
            {shortId.slice(0, 2)}
          </div>
          <div>
            <div className="text-sm font-medium text-foreground">
              {student.student_name ?? `Student ${shortId}`}
            </div>
            <div className="text-xs text-muted-foreground">
              {student.topic} · {student.error_category}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="bg-destructive/15 text-destructive text-xs font-semibold px-2 py-0.5 rounded-full">
            {student.wrong_count}× wrong
          </span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="p-3 border-t border-warning/20 space-y-3">
          {student.root_cause && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Why they're stuck
              </div>
              <p className="text-sm text-foreground/80">{student.root_cause}</p>
            </div>
          )}

          {student.intervention_script && (
            <div className="bg-primary/10 rounded-lg p-3 border border-primary/20">
              <div className="text-xs font-semibold text-primary-glow uppercase tracking-wide mb-1">
                💬 What to say to this student
              </div>
              <p className="text-sm text-foreground/90 italic">
                "{student.intervention_script}"
              </p>
            </div>
          )}

          {student.suggested_activity && (
            <div className="bg-success/10 rounded-lg p-3 border border-success/20">
              <div className="text-xs font-semibold text-success uppercase tracking-wide mb-1">
                ✏️ 5-minute activity
              </div>
              <p className="text-sm text-foreground/90">
                {student.suggested_activity}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
