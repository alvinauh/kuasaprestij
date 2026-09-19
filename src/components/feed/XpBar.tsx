import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { xpProgress } from "@/lib/gameProgress";

/** XP + level progress. Pings + flashes on level-up. */
export function XpBar({ xp }: { xp: number }) {
  const { level, pct } = xpProgress(xp);
  const [leveledUp, setLeveledUp] = useState(false);
  const prevLevel = useRef(level);
  useEffect(() => {
    if (level > prevLevel.current) {
      setLeveledUp(true);
      const t = setTimeout(() => setLeveledUp(false), 1800);
      prevLevel.current = level;
      return () => clearTimeout(t);
    }
    prevLevel.current = level;
  }, [level]);

  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "flex h-7 min-w-7 items-center justify-center rounded-full border border-primary/50 bg-primary/15 px-1.5 text-xs font-bold text-primary-glow transition-transform",
          leveledUp && "animate-streak-flare",
        )}
        aria-label={`Level ${level}`}
      >
        L{level}
      </span>
      <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-accent/60">
        <div
          className="h-full rounded-full bg-gradient-primary transition-[width] duration-500 ease-out"
          style={{ width: `${Math.round(pct * 100)}%` }}
        />
      </div>
      {leveledUp && (
        <span className="animate-slide-up-in text-[10px] font-bold uppercase tracking-wider text-neon-green">
          Level up!
        </span>
      )}
    </div>
  );
}
