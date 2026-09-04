import { useEffect, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { LoadingGame, useWaitGame } from "@/components/LoadingGame";

/**
 * Full-screen overlay shown while an essay is being marked. Essay marking is a
 * live LLM generation that takes ~10-15s (and can run to minutes), so instead
 * of a bare spinner:
 *   - first 6s: a countdown of the time remaining before the request aborts
 *   - past 6s: a play-while-you-wait arcade game
 * Once marking finishes, the game keeps running until the student loses the
 * current round (via useWaitGame's hold-until-loss), then the overlay clears
 * and the graded feedback underneath is revealed. Fast marks (<6s) never show
 * the game — just the countdown.
 *
 * Self-driving: it manages its own countdown/gate while `active` is true and
 * resets when it flips false. Callers render it with `active={submitting && isEssay}`.
 */
export function EssayMarkingCountdown({
  active,
  lang,
  totalSeconds = 540,
}: {
  active: boolean;
  lang: string;
  totalSeconds?: number;
}) {
  const [left, setLeft] = useState(totalSeconds);
  const gate = useWaitGame(active);
  const isMs = lang === "ms";

  useEffect(() => {
    if (!active) {
      setLeft(totalSeconds);
      return;
    }
    setLeft(totalSeconds);
    const id = setInterval(() => setLeft((s) => (s <= 0 ? 0 : s - 1)), 1000);
    return () => clearInterval(id);
  }, [active, totalSeconds]);

  // gate.active stays true after marking finishes until the student loses.
  if (!gate.active) return null;

  // Past the 6s threshold → a game. Held until they lose, then the result shows.
  if (gate.showGame) {
    return (
      <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
        <LoadingGame
          key={gate.round}
          lang={lang}
          onRoundEnd={gate.onGameEnd}
          caption={isMs ? "Menanda esei anda…" : "Marking your essay…"}
          footer={
            isMs
              ? "Permainan tamat apabila anda kalah — kemudian keputusan muncul"
              : "The game ends when you lose — then your result appears"
          }
        />
      </div>
    );
  }

  // First 6s → the countdown / spinner.
  const alert = left <= 30;
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, "0");

  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-black/85 p-6 text-center backdrop-blur-sm">
      {alert ? (
        <AlertTriangle className="h-10 w-10 animate-pulse text-amber-400" />
      ) : (
        <Loader2 className="h-10 w-10 animate-spin text-fuchsia-300" />
      )}
      <p className="text-lg font-bold text-white">
        {isMs ? "Menanda esei anda…" : "Marking your essay…"}
      </p>
      <p
        className={`font-mono text-3xl font-black tabular-nums ${
          alert ? "text-amber-400" : "text-fuchsia-200"
        }`}
      >
        {mm}:{ss}
      </p>
      <p className="max-w-xs text-sm text-white/70">
        {alert
          ? isMs
            ? "Hampir tamat masa. Jangan risau — jawapan anda selamat. Anda boleh cuba hantar semula."
            : "Almost timed out. Don't worry — your answer is safe. You can re-submit if needed."
          : isMs
            ? "Esei ditanda oleh AI. Sebentar lagi anda boleh main sementara menunggu."
            : "Your essay is being graded. In a moment you can play a game while you wait."}
      </p>
    </div>
  );
}
