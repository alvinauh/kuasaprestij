import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CatchStarsGame, type GameChallenge } from "@/components/games/CatchStarsGame";
import { DinoRunnerGame } from "@/components/games/DinoRunnerGame";
import { FlappyBirdGame } from "@/components/games/FlappyBirdGame";
import { FlappyAnswerGame } from "@/components/games/FlappyAnswerGame";
import { SentenceBuilderGame } from "@/components/games/SentenceBuilderGame";
import { ConnectorCatchGame } from "@/components/games/ConnectorCatchGame";
import type { WritingChallenge } from "@/components/games/writing";

export const Route = createFileRoute("/gametest")({
  component: GameTest,
});

const SAMPLE_CHALLENGE: GameChallenge = {
  question: "What is the SI unit of electric current?",
  options: { A: "Volt", B: "Ampere", C: "Ohm", D: "Watt" },
  correctLetter: "B",
};

const SAMPLE_WRITING: WritingChallenge = {
  sentence: "Reading widely helps students write with confidence and clarity.",
  tokens: ["Reading", "widely", "helps", "students", "write", "with", "confidence", "and", "clarity."],
  connector: {
    before: "She practised writing every day,",
    after: "her essays improved dramatically.",
    answer: "so",
    distractors: ["but", "although", "because"],
  },
};

type Which = "kaplay" | "flappy" | "dino" | "stars" | "quiz" | "builder" | "connector";

function GameTest() {
  const [log, setLog] = useState<string[]>([]);
  const [which, setWhich] = useState<Which>("kaplay");
  const [nonce, setNonce] = useState(0);
  const onEnd = (won: boolean) => {
    setLog((l) => [`t=${performance.now().toFixed(0)} onGameEnd(${won})`, ...l]);
  };
  const replay = () => setNonce((n) => n + 1);

  const renderGame = () => {
    const key = `${which}-${nonce}`;
    if (which === "kaplay")
      return <FlappyAnswerGame key={key} onGameEnd={onEnd} challenge={SAMPLE_CHALLENGE} />;
    if (which === "flappy") return <FlappyBirdGame key={key} onGameEnd={onEnd} />;
    if (which === "dino") return <DinoRunnerGame key={key} onGameEnd={onEnd} />;
    if (which === "quiz")
      return <CatchStarsGame key={key} onGameEnd={onEnd} challenge={SAMPLE_CHALLENGE} />;
    if (which === "builder")
      return <SentenceBuilderGame key={key} onGameEnd={onEnd} challenge={SAMPLE_WRITING} />;
    if (which === "connector")
      return <ConnectorCatchGame key={key} onGameEnd={onEnd} challenge={SAMPLE_WRITING} />;
    return <CatchStarsGame key={key} onGameEnd={onEnd} />;
  };

  return (
    <div style={{ padding: 16, color: "#fff", background: "#111", minHeight: "100vh" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {(["kaplay", "quiz", "stars", "flappy", "dino", "builder", "connector"] as const).map((w) => (
          <button
            key={w}
            data-testid={`pick-${w}`}
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              fontWeight: 700,
              background: which === w ? "#6366f1" : "#333",
              color: "#fff",
            }}
            onClick={() => {
              setWhich(w);
              setNonce((n) => n + 1);
              setLog([]);
            }}
          >
            {w === "kaplay"
              ? "answer-flappy (kaplay)"
              : w === "quiz"
              ? "catch-the-answer"
              : w === "builder"
              ? "sentence-builder ✍️"
              : w === "connector"
              ? "connector-catch 🔗"
              : w}
          </button>
        ))}
        <button
          data-testid="replay"
          onClick={replay}
          style={{
            padding: "6px 12px",
            borderRadius: 8,
            fontWeight: 700,
            background: "#22c55e",
            color: "#052e16",
            marginLeft: "auto",
          }}
        >
          🔄 Replay
        </button>
      </div>
      {renderGame()}
      <pre data-testid="log" style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>
        {log.join("\n")}
      </pre>
    </div>
  );
}
