import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Live topic-mastery bar for the question feed HUD.
 *  Updates in place after every answer and after a game-win recovery —
 *  no full session refetch. Flashes green + "+N%" when mastery rises. */
export function MasteryBar({ mastery, lang }: { mastery: number | null; lang: string }) {
  const pct = Math.max(0, Math.min(1, mastery ?? 0));
  const [gain, setGain] = useState<number | null>(null);
  // Fires a one-shot ring pulse the moment the topic crosses into mastered.
  const [justMastered, setJustMastered] = useState(false);
  const prev = useRef<number | null>(mastery);

  useEffect(() => {
    if (mastery == null) return;
    const before = prev.current;
    const cleanups: Array<() => void> = [];
    if (before != null && mastery > before + 0.0001) {
      setGain(Math.round((mastery - before) * 100));
      const g = setTimeout(() => setGain(null), 1800);
      cleanups.push(() => clearTimeout(g));
      // Only celebrate the *transition* over 0.9, not every gain while mastered.
      if (before < 0.9 && mastery >= 0.9) {
        setJustMastered(true);
        const m = setTimeout(() => setJustMastered(false), 900);
        cleanups.push(() => clearTimeout(m));
      }
    }
    prev.current = mastery;
    return () => cleanups.forEach((fn) => fn());
  }, [mastery]);

  const mastered = pct >= 0.9;
  const label = lang === "ms" ? "Penguasaan" : "Mastery";

  return (
    <div className="flex items-center gap-2" aria-label={`${label} ${Math.round(pct * 100)}%`}>
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <div
        className={cn(
          "relative h-2.5 flex-1 overflow-hidden rounded-full bg-accent/60",
          justMastered && "animate-mastered-burst",
        )}
      >
        <div
          className={cn(
            "relative h-full overflow-hidden rounded-full transition-[width] duration-700 ease-out",
            mastered ? "bg-gradient-to-r from-amber-400 to-emerald-400" : "bg-gradient-to-r from-sky-400 to-indigo-500",
          )}
          style={{ width: `${Math.round(pct * 100)}%` }}
        >
          {/* Continuous highlight sweep — only while there's a bar to sweep. */}
          {pct > 0.02 && (
            <span className="animate-mastery-sheen absolute inset-y-0 -left-1/3 w-1/3 skew-x-[-20deg] bg-gradient-to-r from-transparent via-white/50 to-transparent" />
          )}
        </div>
      </div>
      <span
        className={cn(
          "min-w-9 text-right text-xs font-bold tabular-nums transition-colors",
          gain != null ? "animate-mastery-pop text-neon-green" : "text-foreground",
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
