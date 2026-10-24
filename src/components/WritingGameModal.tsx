import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { SentenceBuilderGame } from "./games/SentenceBuilderGame";
import { ConnectorCatchGame } from "./games/ConnectorCatchGame";
import { fetchWritingChallenge, recordPenaltyGameResult } from "@/services/api";
import type { WritingChallenge, WritingGameType } from "./games/writing";

interface Props {
  open: boolean;
  studentId: string;
  sessionId?: string;
  /** Composition topic/subject/language — a win credits partial mastery recovery. */
  topic?: string;
  subject?: string;
  language?: string;
  /** Optional preloaded challenge (e.g. from /gametest). If absent, fetched on open. */
  challenge?: WritingChallenge | null;
  onComplete: (won: boolean, masteryScore?: number | null) => void;
}

type Phase = "loading" | "intro" | "playing" | "won" | "lost";

/** Writing-native penalty game for compositions (BM karangan / 华文 作文 / English writing).
 *  Essays have no correct-letter, so we reinforce writing mechanics instead of running the
 *  MCQ reaction games. */
export function WritingGameModal({
  open,
  studentId,
  sessionId,
  topic,
  subject,
  language,
  challenge: preloaded,
  onComplete,
}: Props) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [challenge, setChallenge] = useState<WritingChallenge | null>(preloaded ?? null);
  const gameRef = useRef<WritingGameType>("sentence_builder");
  const startedAtRef = useRef(0);
  const pendingMasteryRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    gameRef.current = Math.random() < 0.5 ? "sentence_builder" : "connector_catch";
    startedAtRef.current = performance.now();
    pendingMasteryRef.current = null;

    if (preloaded) {
      setChallenge(preloaded);
      setPhase("intro");
      return;
    }
    let cancelled = false;
    setPhase("loading");
    (async () => {
      const c = await fetchWritingChallenge({
        subject: subject ?? "Bahasa Inggeris",
        topic: topic ?? "Continuous Writing",
        language,
      });
      if (cancelled) return;
      if (!c) {
        // Generation failed — don't block the student; just continue.
        onComplete(false, null);
        return;
      }
      setChallenge(c);
      setPhase("intro");
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preloaded]);

  if (!open) return null;

  const activeGame = gameRef.current;

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
      topic: topic,
      subject: subject,
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
    if (won) {
      setTimeout(() => onComplete(true, pendingMasteryRef.current), 1500);
    }
  };

  const isBuilder = activeGame === "sentence_builder";

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/85 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="flex w-full max-w-md flex-col items-center gap-4 py-6">
        <div className="w-full rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3 text-center text-base font-bold text-white shadow-2xl">
          {isBuilder
            ? "Let's sharpen your writing — rebuild the sentence! ✍️"
            : "Let's sharpen your writing — catch the right connector! 🔗"}
        </div>

        {phase === "loading" ? (
          <div className="w-full rounded-2xl bg-white/10 px-4 py-8 text-center text-sm font-semibold text-white">
            Preparing your writing challenge…
          </div>
        ) : phase === "intro" && challenge ? (
          <div className="flex w-full flex-col items-center gap-3">
            <div className="w-full rounded-2xl bg-white/10 px-4 py-4 text-center text-sm text-white ring-1 ring-white/15">
              {isBuilder ? (
                <>
                  <div className="text-base font-extrabold">Sentence Builder</div>
                  <p className="mt-1 text-white/80">Tap the scrambled words into the correct order, then Check.</p>
                </>
              ) : (
                <>
                  <div className="text-base font-extrabold">Connector Catch</div>
                  <p className="mt-1 text-white/80">Drag the basket to catch the connector that fits the sentence. Dodge the wrong ones!</p>
                </>
              )}
            </div>
            <button
              onClick={startPlaying}
              className="w-full rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3 text-base font-bold text-white shadow-xl transition hover:opacity-90 active:scale-95"
            >
              Start ▶
            </button>
          </div>
        ) : phase === "playing" && challenge ? (
          isBuilder ? (
            <SentenceBuilderGame onGameEnd={handleEnd} challenge={challenge} />
          ) : (
            <ConnectorCatchGame onGameEnd={handleEnd} challenge={challenge} />
          )
        ) : phase === "won" ? (
          <div className="w-full rounded-2xl bg-green-500 px-4 py-4 text-center text-lg font-bold text-white shadow-xl">
            Great writing! Back to learning 🎉
          </div>
        ) : (
          <div className="flex w-full flex-col items-center gap-3">
            <div className="w-full rounded-2xl bg-yellow-400 px-4 py-5 text-center text-yellow-950 shadow-xl">
              <div className="text-lg font-extrabold">Almost there! 💪</div>
              <p className="mt-1 text-sm font-medium">
                Head back and keep working on your writing — you've earned another round.
              </p>
            </div>
            <button
              onClick={() => onComplete(false, pendingMasteryRef.current)}
              className="w-full rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3 text-base font-bold text-white shadow-xl transition hover:opacity-90 active:scale-95"
            >
              ← Back to the question
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
