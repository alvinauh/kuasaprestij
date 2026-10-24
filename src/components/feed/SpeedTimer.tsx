import { cn } from "@/lib/utils";
import { QUESTION_SECONDS } from "@/lib/gameProgress";

/** Presentational countdown ring. secondsLeft is owned by the parent slide. */
export function SpeedTimer({ secondsLeft, total = QUESTION_SECONDS }: { secondsLeft: number; total?: number }) {
  const frac = Math.max(0, Math.min(1, secondsLeft / total));
  const R = 16;
  const C = 2 * Math.PI * R;
  const dash = C * frac;
  const urgent = secondsLeft <= 5;
  const stroke = urgent ? "oklch(0.65 0.26 20)" : secondsLeft <= 10 ? "oklch(0.82 0.18 85)" : "oklch(0.78 0.24 145)";
  return (
    <div className={cn("relative h-11 w-11 shrink-0", urgent && secondsLeft > 0 && "animate-pulse")}>
      <svg viewBox="0 0 40 40" className="h-full w-full -rotate-90">
        <circle cx="20" cy="20" r={R} fill="none" stroke="oklch(0.30 0.06 280)" strokeWidth="4" />
        <circle
          cx="20" cy="20" r={R} fill="none" stroke={stroke} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={`${dash} ${C}`}
          style={{ transition: "stroke-dasharray 0.9s linear, stroke 0.3s" }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold tabular-nums text-foreground">
        {Math.max(0, Math.ceil(secondsLeft))}
      </span>
    </div>
  );
}
