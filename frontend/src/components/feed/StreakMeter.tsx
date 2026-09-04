import { useEffect, useRef, useState } from "react";
import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

/** Live combo counter — escalating glow/intensity as the streak climbs. */
export function StreakMeter({ streak, best = 0 }: { streak: number; best?: number }) {
  const [flare, setFlare] = useState(false);
  const prev = useRef(streak);
  useEffect(() => {
    if (streak > prev.current) {
      setFlare(true);
      const t = setTimeout(() => setFlare(false), 500);
      prev.current = streak;
      return () => clearTimeout(t);
    }
    prev.current = streak;
  }, [streak]);

  const hot = streak >= 5;
  const blazing = streak >= 10;
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition-colors",
        blazing
          ? "border-red-400/70 bg-red-500/15 text-red-300"
          : hot
            ? "border-amber-400/60 bg-amber-500/15 text-amber-300"
            : "border-border bg-card/70 text-muted-foreground",
      )}
    >
      <Flame className={cn("h-4 w-4", flare && "animate-streak-flare", (hot || blazing) && "fill-current")} />
      <span className="text-sm font-bold tabular-nums">{streak}</span>
      {blazing && <span className="text-[10px] font-bold uppercase tracking-wider">Blazing</span>}
      {best > 0 && (
        <span className="ml-0.5 border-l border-current/20 pl-1.5 text-[10px] font-semibold text-muted-foreground/80">
          {streak > 0 && streak >= best ? "PB!" : `PB ${best}`}
        </span>
      )}
    </div>
  );
}
