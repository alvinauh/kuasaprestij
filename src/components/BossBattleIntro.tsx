import { useEffect } from "react";

interface Props {
  show: boolean;
  masteryPct: number;
  onDone: () => void;
  durationMs?: number;
}

export function BossBattleIntro({ show, masteryPct, onDone, durationMs = 2000 }: Props) {
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(onDone, durationMs);
    return () => clearTimeout(t);
  }, [show, onDone, durationMs]);

  if (!show) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[95] flex items-center justify-center bg-gradient-to-br from-[#3b0000] to-[#2d0a6e]/95 animate-[bossFade_0.3s_ease-out]">
      <div className="flex flex-col items-center gap-4 px-6 text-center">
        <div className="text-3xl font-black tracking-widest text-yellow-400 drop-shadow-[0_4px_16px_rgba(250,204,21,0.6)] sm:text-5xl">
          ⚔️ BOSS BATTLE ⚔️
        </div>
        <div className="text-lg font-semibold text-white sm:text-2xl">
          You're at {Math.round(masteryPct)}% mastery!
        </div>
        <div className="text-base text-white/90 sm:text-lg">
          One more push to MASTER this topic!
        </div>
        <div className="relative mt-2 h-1 w-full max-w-md overflow-hidden rounded-full bg-white/10">
          <div className="absolute inset-y-0 left-0 w-full bg-yellow-400 animate-[bossSlide_0.6s_ease-in-out]" />
        </div>
      </div>
      <style>{`
        @keyframes bossFade {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes bossSlide {
          0% { transform: translateX(-110%); }
          100% { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
