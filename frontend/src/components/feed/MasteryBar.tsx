import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Live topic-mastery bar for the question feed HUD.
 *  Updates in place after every answer and after a game-win recovery —
 *  no full session refetch. Flashes green + "+N%" when mastery rises. */
export function MasteryBar({ mastery, lang }: { mastery: number | null; lang: string }) {
  const pct = Math.max(0, Math.min(1, mastery ?? 0));
  const [gain, setGain] = useState<number | null>(null);
  const prev = useRef<number | null>(mastery);

  useEffect(() => {
    if (mastery == null) return;
    const before = prev.current;
    if (before != null && mastery > before + 0.0001) {
      setGain(Math.round((mastery - before) * 100));
      const t = setTimeout(() => setGain(null), 1800);
      prev.current = mastery;
      return () => clearTimeout(t);
    }
    prev.current = mastery;
  }, [mastery]);

  const mastered = pct >= 0.9;
  const label = lang === "ms" ? "Penguasaan" : "Mastery";

  return (
    <div className="flex items-center gap-2" aria-label={`${label} ${Math.round(pct * 100)}%`}>
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-accent/60">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-700 ease-out",
            mastered ? "bg-gradient-to-r from-amber-400 to-emerald-400" : "bg-gradient-to-r from-sky-400 to-indigo-500",
          )}
          style={{ width: `${Math.round(pct * 100)}%` }}
        />
      </div>
      <span
        className={cn(
          "min-w-9 text-right text-xs font-bold tabular-nums transition-colors",
          gain != null ? "text-neon-green" : "text-foreground",
        )}
      >
        {Math.round(pct * 100)}%
      </span>
      {gain != null && (
        <span className="animate-slide-up-in text-[10px] font-bold uppercase tracking-wider text-neon-green">
          +{gain}%
        </span>
      )}
    </div>
  );
}
