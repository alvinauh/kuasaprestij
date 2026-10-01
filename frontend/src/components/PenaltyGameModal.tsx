import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CatchStarsGame, type GameChallenge } from "./games/CatchStarsGame";
import { DinoRunnerGame } from "./games/DinoRunnerGame";
import { FlappyBirdGame } from "./games/FlappyBirdGame";
import { FlappyAnswerGame } from "./games/FlappyAnswerGame";
import { BlockBlastGame } from "./games/BlockBlastGame";
import { GameTutorial } from "./games/GameTutorial";
import { recordPenaltyGameResult } from "@/services/api";

interface Props {
  open: boolean;
  studentId: string;
  sessionId?: string;
  /** Receives whether the student won plus the credited mastery_score (challenge wins),
   *  so callers can update a live mastery bar and decide whether to advance. */
  onComplete: (won: boolean, masteryScore?: number | null) => void;
  /** When provided, the game replays this question so the student must actively
   *  catch the correct answer — assessment-integrated reinforcement. */
  challenge?: GameChallenge | null;
  /** Topic/subject of the replayed question — a win credits partial mastery recovery. */
  topic?: string;
  subject?: string;
  /** When true, only non-timed games (catch_stars, dino_runner) are offered. */
  noTimedGames?: boolean;
}

const GAME_TYPES = ["catch_stars", "dino_runner", "flappy_bird"] as const;
const CALM_GAME_TYPES = ["catch_stars", "dino_runner"] as const;

type Phase = "tutorial" | "playing" | "won" | "lost";

export function PenaltyGameModal({ open, studentId, sessionId, onComplete, challenge, topic, subject, noTimedGames = false }: Props) {
  // With a challenge we run the Kaplay assessment flagship (Answer Flappy).
  const availableGames = noTimedGames ? CALM_GAME_TYPES : GAME_TYPES;
  const gameIdxRef = useRef<number>(challenge ? 0 : Math.floor(Math.random() * availableGames.length));
  const startedAtRef = useRef<number>(0);
  const pendingMasteryRef = useRef<number | null>(null);
  const [phase, setPhase] = useState<Phase>("tutorial");

  useEffect(() => {
    if (open) {
      startedAtRef.current = performance.now();
      gameIdxRef.current = challenge ? 0 : Math.floor(Math.random() * availableGames.length);
      setPhase("tutorial");
    }
  }, [open, challenge, availableGames.length]);

  if (!open) return null;

  const activeGame = challenge ? "flappy_bird" : availableGames[gameIdxRef.current];
  // Both flappy variants share the "steer with your thumb" control; the others
  // (catch-stars, dino) are simpler and don't need the drag tutorial.
  const isSteerGame = !!challenge || (!noTimedGames && gameIdxRef.current === 2);

  const startPlaying = () => {
    startedAtRef.current = performance.now();
    setPhase("playing");
  };

  const handleEnd = async (won: boolean) => {
    setPhase(won ? "won" : "lost");
    const durationMs = Math.round(performance.now() - startedAtRef.current);
    const res = await recordPenaltyGameResult({
      studentId,
      sessionId,
      gameType: activeGame,
      result: won ? "win" : "loss",
      durationMs,
      // Only assessment-integrated challenges carry a topic → mastery recovery.
      topic: challenge ? topic : undefined,
      subject: challenge ? subject : undefined,
    });
    if (res?.points_awarded && res.points_awarded > 0) {
      toast.success(`+${res.points_awarded} Leaderboard Points!`, {
        style: { background: "#facc15", color: "#422006", fontWeight: 700 },
      });
    }
    if (res?.mastery_delta && res.mastery_delta > 0) {
      toast.success(`Mastery recovered +${Math.round(res.mastery_delta * 100)}%`, {
        style: { background: "#22c55e", color: "#052e16", fontWeight: 700 },
      });
    }
    pendingMasteryRef.current = res?.mastery_score ?? null;
    // On a win, celebrate briefly then return to learning. On a loss, wait for
    // the student to head back and answer the question correctly first.
    if (won) {
      setTimeout(() => onComplete(true, pendingMasteryRef.current), 1500);
    }
  };

  const handleBackToQuestion = () => onComplete(false, pendingMasteryRef.current);

  const renderGame = () => {
    if (challenge) {
      // Assessment-integrated: rotate between BlockBlast (flagship) and Flappy.
      return gameIdxRef.current % 2 === 0
        ? (
          <div className="w-full max-w-sm" style={{ height: "min(560px, 88vh)" }}>
            <BlockBlastGame challenge={challenge} onGameEnd={handleEnd} />
          </div>
        )
        : <FlappyAnswerGame onGameEnd={handleEnd} challenge={challenge} />;
    }
    const game = availableGames[gameIdxRef.current];
    if (game === "catch_stars") return <CatchStarsGame onGameEnd={handleEnd} />;
    if (game === "dino_runner") return <DinoRunnerGame onGameEnd={handleEnd} />;
    return <FlappyBirdGame onGameEnd={handleEnd} />;
  };

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/85 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="flex w-full max-w-md flex-col items-center gap-4 py-6">
        <div className="w-full rounded-2xl bg-gradient-to-r from-fuchsia-600 to-indigo-600 px-4 py-3 text-center text-base font-bold text-white shadow-2xl">
          {challenge
            ? "Let's lock it in — steer through the correct answer! 🎯"
            : "Oops! Time for a mini-challenge before we continue…"}
        </div>

        {phase === "tutorial" ? (
          <GameTutorial steerGame={isSteerGame} onStart={startPlaying} />
        ) : phase === "playing" ? (
          renderGame()
        ) : phase === "won" ? (
          <div className="w-full rounded-2xl bg-green-500 px-4 py-4 text-center text-lg font-bold text-white shadow-xl">
            Great effort! Back to learning 🎉
          </div>
        ) : (
          <div className="flex w-full flex-col items-center gap-3">
            <div className="w-full rounded-2xl bg-yellow-400 px-4 py-5 text-center text-yellow-950 shadow-xl">
              <div className="text-lg font-extrabold">Almost there! 💪</div>
              <p className="mt-1 text-sm font-medium">
                Let's master this first. Head back and answer the question correctly —
                then you've earned another round.
              </p>
            </div>
            <button
              onClick={handleBackToQuestion}
              className="w-full rounded-2xl bg-gradient-to-r from-fuchsia-600 to-indigo-600 px-4 py-3 text-base font-bold text-white shadow-xl transition hover:opacity-90 active:scale-95"
            >
              ← Back to the question
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
