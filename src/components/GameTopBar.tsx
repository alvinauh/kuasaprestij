import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  streak: number;
  score: number;
  questionNumber: number;
  pointsAwarded: number;
}

export function GameTopBar({ streak, score, questionNumber, pointsAwarded }: Props) {
  const [pop, setPop] = useState(0);
  useEffect(() => {
    if (pointsAwarded > 0) setPop((p) => p + 1);
  }, [pointsAwarded]);

  return (
    <div className="relative flex items-center justify-between gap-3 rounded-2xl bg-black/40 px-4 py-2 text-white shadow-lg ring-1 ring-white/10 backdrop-blur">
      <div
        className={cn(
          "flex items-center gap-1.5 text-base font-bold transition-opacity",
          streak <= 0 && "opacity-0",
        )}
      >
        <span className="text-xl">🔥</span>
        <span>{streak}</span>
      </div>
      <div className="relative flex-1 text-center">
        <div className="font-display text-lg font-extrabold tabular-nums tracking-tight">
          {score.toLocaleString()} pts
        </div>
        {pop > 0 && pointsAwarded > 0 && (
          <div
            key={pop}
            className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 animate-[scorePop_1s_ease-out_forwards] text-sm font-extrabold text-yellow-300"
          >
            +{pointsAwarded}
          </div>
        )}
      </div>
      <div className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-bold uppercase tracking-wider">
        Q {questionNumber}
      </div>
      <style>{`
        @keyframes scorePop {
          0% { opacity: 0; transform: translate(-50%, 0); }
          15% { opacity: 1; transform: translate(-50%, -8px); }
          100% { opacity: 0; transform: translate(-50%, -32px); }
        }
      `}</style>
    </div>
  );
}
