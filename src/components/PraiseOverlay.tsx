import { useEffect } from "react";
import confetti from "canvas-confetti";

const PRAISES = [
  "Awesome! 🌟",
  "Brilliant! 🔥",
  "Nailed it! 💥",
  "Superstar! ⭐",
  "Keep going! 🚀",
  "Perfect! 🎯",
];

interface Props {
  show: boolean;
  pointsAwarded: number;
  onFire: boolean;
  mastered?: boolean;
}

export function PraiseOverlay({ show, pointsAwarded, onFire, mastered }: Props) {
  useEffect(() => {
    if (show && (onFire || mastered)) {
      confetti({
        particleCount: mastered ? 220 : 120,
        spread: mastered ? 120 : 90,
        origin: { y: 0.6 },
        colors: mastered
          ? ["#facc15", "#fde047", "#f59e0b", "#fbbf24", "#fff7ad"]
          : ["#f43f5e", "#3b82f6", "#facc15", "#22c55e", "#a855f7"],
      });
    }
  }, [show, onFire, mastered]);

  if (!show) return null;
  const praise = PRAISES[Math.floor(Math.random() * PRAISES.length)];

  return (
    <div className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center">
      <div className="animate-[praisePop_1.5s_ease-out_forwards] flex flex-col items-center gap-2 text-center">
        <div
          className="font-display text-5xl font-extrabold text-white drop-shadow-[0_4px_20px_rgba(168,85,247,0.7)]"
          style={{ WebkitTextStroke: "1px rgba(0,0,0,0.4)" }}
        >
          {onFire ? "🔥 On Fire!" : praise}
        </div>
        {pointsAwarded > 0 && (
          <div className="animate-[pointsRise_1.5s_ease-out_forwards] text-3xl font-extrabold text-yellow-300 drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
            +{pointsAwarded} pts
          </div>
        )}
        {mastered && (
          <div className="mt-1 text-2xl font-extrabold tracking-wide text-yellow-300 drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
            🏆 Topic Mastered!
          </div>
        )}
      </div>
      <style>{`
        @keyframes praisePop {
          0% { opacity: 0; transform: scale(0.6); }
          20% { opacity: 1; transform: scale(1.1); }
          40% { transform: scale(1); }
          80% { opacity: 1; }
          100% { opacity: 0; transform: scale(1); }
        }
        @keyframes pointsRise {
          0% { opacity: 0; transform: translateY(20px); }
          25% { opacity: 1; transform: translateY(0); }
          80% { opacity: 1; transform: translateY(-30px); }
          100% { opacity: 0; transform: translateY(-60px); }
        }
      `}</style>
    </div>
  );
}
