import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { DinoRunnerGame } from "@/components/games/DinoRunnerGame";
import { FlappyAnswerGame } from "@/components/games/FlappyAnswerGame";
import { CatchStarsGame } from "@/components/games/CatchStarsGame";

type GameChoice = "dino" | "flappy" | "catch";

// Remember the last selection across remounts (round bumps while still loading)
// so the same game auto-resumes instead of always forcing a re-pick.
let _lastChoice: GameChoice | null = null;

const GAMES: { kind: GameChoice; emoji: string; en: string; ms: string }[] = [
  { kind: "dino",   emoji: "🦕", en: "Dino Run",    ms: "Lari Dino" },
  { kind: "flappy", emoji: "🐦", en: "Flappy Bird",  ms: "Burung Flappy" },
  { kind: "catch",  emoji: "⭐", en: "Catch Stars",  ms: "Tangkap Bintang" },
];

/**
 * A play-while-you-wait screen with a game picker (Dino / Flappy / Catch).
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
  // Start with last remembered choice so dying → replay doesn't force a re-pick.
  const [game, setGame] = useState<GameChoice | null>(_lastChoice);
  // Internal round counter for standalone (no onRoundEnd) auto-restart.
  const [round, setRound] = useState(0);

  const handleEnd = useCallback(() => {
    if (onRoundEnd) {
      onRoundEnd();
    } else {
      setRound((r) => r + 1);
    }
  }, [onRoundEnd]);

  const pick = (g: GameChoice) => {
    _lastChoice = g;
    setGame(g);
  };

  const switchGame = () => {
    _lastChoice = null;
    setGame(null);
  };

  // ── Game picker ────────────────────────────────────────────────────────────
  if (!game) {
    return (
      <div className="flex w-full flex-col items-center gap-4 px-4 py-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-xs">
            {caption ?? (lang === "ms" ? "Menjana soalan anda…" : "Generating your question…")}
          </span>
        </div>

        <div className="text-center">
          <p className="text-lg font-bold text-foreground">
            {lang === "ms" ? "Pilih permainan 🎮" : "Pick a game 🎮"}
          </p>
          <p className="text-xs text-muted-foreground">
            {lang === "ms"
              ? "Main sementara soalan anda dihasilkan"
              : "Play while your question is generated"}
          </p>
        </div>

        <div className="flex w-full max-w-[360px] gap-3">
          {GAMES.map((g) => (
            <button
              key={g.kind}
              onClick={() => pick(g.kind)}
              className="flex flex-1 flex-col items-center gap-2 rounded-2xl border border-white/20 bg-white/5 py-5 text-white transition hover:bg-white/15 active:scale-95"
            >
              <span className="text-3xl">{g.emoji}</span>
              <span className="text-[11px] font-semibold">
                {lang === "ms" ? g.ms : g.en}
              </span>
            </button>
          ))}
        </div>

        <p className="text-[10px] text-muted-foreground">
          {footer ??
            (lang === "ms"
              ? "Soalan muncul apabila siap"
              : "Your question appears when ready")}
        </p>
      </div>
    );
  }

  // ── Active game ────────────────────────────────────────────────────────────
  return (
    <div className="flex w-full flex-col items-center gap-2 py-2">
      <div className="flex w-full max-w-[360px] items-center justify-between px-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" />
          {caption ?? (lang === "ms" ? "Menjana soalan…" : "Generating question…")}
        </span>
        <button
          onClick={switchGame}
          className="text-muted-foreground/60 underline-offset-2 hover:text-muted-foreground hover:underline"
        >
          {lang === "ms" ? "Tukar permainan" : "Switch game"}
        </button>
      </div>

      {game === "dino" && <DinoRunnerGame key={round} onGameEnd={handleEnd} />}
      {game === "flappy" && (
        <FlappyAnswerGame key={round} challenge={null} onGameEnd={handleEnd} />
      )}
      {game === "catch" && (
        <CatchStarsGame key={round} challenge={null} onGameEnd={handleEnd} />
      )}
    </div>
  );
}

/**
 * Gate logic for "play a game while waiting":
 *  - `pending` true → after `thresholdMs` (default 2s) of continuous waiting,
 *    upgrade from a spinner to the game picker. Fast waits (<2s) never show a game.
 *  - When `pending` flips false WHILE the game is showing, keep it running
 *    ("holding") until the student finishes the current round, then release.
 *  - While `pending` is still true, each finished round replays automatically.
 *
 * Returns { active, showGame, round, onGameEnd }:
 *  - active:   the gate is holding the screen (render spinner or game, not content)
 *  - showGame: within the active window, whether to show the game vs the spinner
 *  - round:    bump this into the LoadingGame's React key to force a fresh mount
 *  - onGameEnd: pass to LoadingGame; drives replay-or-release
 */
export function useWaitGame(pending: boolean, thresholdMs = 2000) {
  const [showGame, setShowGame] = useState(false);
  const [holding, setHolding] = useState(false);
  const [round, setRound] = useState(0);
  const pendingRef = useRef(pending);
  const showGameRef = useRef(false);
  pendingRef.current = pending;
  showGameRef.current = showGame;

  useEffect(() => {
    if (pending) {
      // A fresh wait began: reset, then arm the threshold timer.
      setShowGame(false);
      setHolding(false);
      setRound((r) => r + 1);
      const id = window.setTimeout(() => {
        if (pendingRef.current) setShowGame(true);
      }, thresholdMs);
      return () => window.clearTimeout(id);
    }
    // Wait ended. If the game was already up, hold it until the round ends;
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
      setShowGame(false); // content ready and round over → release
      setHolding(false);
    }
  }, []);

  return { active: pending || holding, showGame, round, onGameEnd };
}
