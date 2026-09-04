import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { DinoRunnerGame } from "@/components/games/DinoRunnerGame";

/**
 * A play-while-you-wait screen. Renders the offline Dino Runner arcade game.
 *
 * - Standalone (no onRoundEnd): auto-restarts each round so it loops forever
 *   (used for the swipe-feed's trailing loader slide).
 * - Controlled (onRoundEnd given): renders a single round and reports when it
 *   ends; the caller decides whether to replay or reveal the ready content.
 *   Used with useWaitGame so a finished game gives way to the loaded question.
 *
 * IMPORTANT: DinoRunnerGame attaches a window-level keydown handler that
 * preventDefaults Space. Only mount this while it is actually the visible
 * screen, or it would swallow the spacebar in a focused essay textarea.
 */
export function LoadingGame({
  lang,
  footer,
  caption,
  onRoundEnd,
}: {
  lang: string;
  footer?: string;
  caption?: string;
  onRoundEnd?: () => void;
}) {
  const [round, setRound] = useState(0);
  const handleEnd = () => (onRoundEnd ? onRoundEnd() : setRound((r) => r + 1));

  return (
    <div className="flex w-full flex-col items-center justify-center gap-4 px-4 py-6">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs">
          {caption ?? (lang === "ms" ? "Menjana soalan anda…" : "Generating your question…")}
        </span>
      </div>

      <div className="text-center">
        <p className="text-lg font-bold text-foreground">
          {lang === "ms" ? "Main sementara menunggu 🎮" : "Play while you wait 🎮"}
        </p>
        <p className="text-xs text-muted-foreground">
          {lang === "ms" ? "Elak kaktus — lompat!" : "Dodge the cacti — jump!"}
        </p>
      </div>

      <DinoRunnerGame key={round} onGameEnd={handleEnd} />

      <p className="text-[10px] text-muted-foreground">
        {footer ??
          (lang === "ms"
            ? "Permainan tamat apabila anda kalah — kemudian soalan anda muncul"
            : "The game ends when you lose — then your question appears")}
      </p>
    </div>
  );
}

/**
 * Gate logic for "play a game while waiting":
 *  - `pending` true → after `thresholdMs` (default 6s) of continuous waiting,
 *    upgrade from a spinner to the game. Fast waits (<6s) never show the game.
 *  - When `pending` flips false WHILE the game is showing, keep it running
 *    ("holding") until the student loses the current round, then release.
 *  - While `pending` is still true, each finished round replays automatically.
 *
 * Returns { active, showGame, round, onGameEnd }:
 *  - active:  the gate is holding the screen (render spinner or game, not content)
 *  - showGame: within the active window, whether to show the game vs the spinner
 *  - round:   bump this into the game's React key to force a fresh round
 *  - onGameEnd: pass to the game; drives replay-or-release
 */
export function useWaitGame(pending: boolean, thresholdMs = 6000) {
  const [showGame, setShowGame] = useState(false);
  const [holding, setHolding] = useState(false);
  const [round, setRound] = useState(0);
  const pendingRef = useRef(pending);
  const showGameRef = useRef(false);
  pendingRef.current = pending;
  showGameRef.current = showGame;

  useEffect(() => {
    if (pending) {
      // A fresh wait began: reset, then arm the 6s upgrade-to-game timer.
      setShowGame(false);
      setHolding(false);
      setRound((r) => r + 1);
      const id = window.setTimeout(() => {
        if (pendingRef.current) setShowGame(true);
      }, thresholdMs);
      return () => window.clearTimeout(id);
    }
    // Wait ended. If the game was already up, hold it until the student loses;
    // otherwise release immediately (fast load — only a spinner was shown).
    if (showGameRef.current) {
      setHolding(true);
    } else {
      setShowGame(false);
      setHolding(false);
    }
  }, [pending, thresholdMs]);

  const onGameEnd = useCallback(() => {
    if (pendingRef.current) {
      setRound((r) => r + 1); // still loading → replay
    } else {
      setShowGame(false); // content is ready and they lost → release
      setHolding(false);
    }
  }, []);

  return { active: pending || holding, showGame, round, onGameEnd };
}
