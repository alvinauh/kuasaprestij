import { useMemo, useRef, useState } from "react";
import { Sfx } from "@/lib/gameKit";
import { shuffled, type WritingChallenge } from "./writing";

interface Props {
  onGameEnd: (won: boolean) => void;
  challenge: WritingChallenge;
}

interface Tok {
  id: number;
  text: string;
}

const LIVES = 3;

/**
 * Sentence Builder — a writing-native reinforcement game. The correct sentence is
 * scrambled into word tiles; the student taps them into order and checks. Wrong
 * order costs a life (with the correct prefix highlighted green). Tests syntax,
 * word order and cohesion — the mechanics an MCQ reaction game can't touch.
 */
export function SentenceBuilderGame({ onGameEnd, challenge }: Props) {
  const tokens = challenge.tokens?.length
    ? challenge.tokens
    : challenge.sentence.split(/\s+/).filter(Boolean);

  const sfx = useRef<Sfx | null>(null);
  const getSfx = () => (sfx.current ??= new Sfx());

  // Stable ids so repeated words are distinguishable.
  const initialBank = useMemo<Tok[]>(() => {
    const toks = tokens.map((text, id) => ({ id, text }));
    return shuffled(toks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [bank, setBank] = useState<Tok[]>(initialBank);
  const [placed, setPlaced] = useState<Tok[]>([]);
  const [lives, setLives] = useState(LIVES);
  const [status, setStatus] = useState<"playing" | "won" | "lost">("playing");
  const [shake, setShake] = useState(false);
  // Index up to which the current placement matches the answer (green prefix).
  const [correctPrefix, setCorrectPrefix] = useState(-1);

  const done = status !== "playing";

  const pickFromBank = (t: Tok) => {
    if (done) return;
    getSfx().blip();
    setBank((b) => b.filter((x) => x.id !== t.id));
    setPlaced((p) => [...p, t]);
    setCorrectPrefix(-1);
  };

  const returnToBank = (t: Tok) => {
    if (done) return;
    getSfx().blip();
    setPlaced((p) => p.filter((x) => x.id !== t.id));
    setBank((b) => [...b, t]);
    setCorrectPrefix(-1);
  };

  const check = () => {
    if (done || placed.length !== tokens.length) return;
    const ok = placed.every((t, i) => t.text === tokens[i]);
    if (ok) {
      getSfx().win();
      setStatus("won");
      setTimeout(() => onGameEnd(true), 1400);
      return;
    }
    // Wrong: find the correct prefix length, dock a life.
    let pref = 0;
    while (pref < placed.length && placed[pref].text === tokens[pref]) pref++;
    setCorrectPrefix(pref);
    getSfx().buzz();
    setShake(true);
    setTimeout(() => setShake(false), 420);
    const next = lives - 1;
    setLives(next);
    if (next <= 0) {
      getSfx().lose();
      setStatus("lost");
      setTimeout(() => onGameEnd(false), 1800);
    }
  };

  const reset = () => {
    if (done) return;
    getSfx().blip();
    setBank(shuffled([...bank, ...placed]));
    setPlaced([]);
    setCorrectPrefix(-1);
  };

  return (
    <div className="flex w-full max-w-[360px] flex-col items-center gap-3">
      <div className="w-full rounded-xl bg-white/10 px-3 py-2 text-center text-sm font-semibold text-white ring-1 ring-white/15">
        Rebuild the sentence ✍️
        <div className="mt-0.5 text-[12px] font-normal text-white/70">
          Tap the words in the correct order, then Check.
        </div>
      </div>

      <div className="flex w-full items-center justify-between text-sm font-bold text-white">
        <span className="text-emerald-300">{placed.length}/{tokens.length} placed</span>
        <span className="text-rose-300">
          {"❤".repeat(Math.max(0, lives))}
          {"·".repeat(Math.max(0, LIVES - lives))}
        </span>
      </div>

      {/* Build area */}
      <div
        className={`min-h-[92px] w-full rounded-2xl border-2 border-dashed border-white/25 bg-slate-900/60 p-2.5 ${
          shake ? "animate-shake-x" : ""
        }`}
      >
        <div className="flex flex-wrap gap-1.5">
          {placed.length === 0 && (
            <span className="px-1 py-2 text-sm text-white/40">Your sentence appears here…</span>
          )}
          {placed.map((t, i) => {
            const isGreen = status === "won" || (correctPrefix >= 0 && i < correctPrefix);
            const isRed = correctPrefix >= 0 && i === correctPrefix;
            return (
              <button
                key={t.id}
                onClick={() => returnToBank(t)}
                disabled={done}
                className={`rounded-lg px-2.5 py-1.5 text-sm font-bold shadow transition active:scale-95 ${
                  isGreen
                    ? "bg-emerald-500 text-white"
                    : isRed
                    ? "bg-rose-500 text-white"
                    : "bg-indigo-500 text-white hover:bg-indigo-400"
                }`}
              >
                {t.text}
              </button>
            );
          })}
        </div>
      </div>

      {/* Word bank */}
      <div className="flex min-h-[52px] w-full flex-wrap gap-1.5 rounded-2xl bg-white/5 p-2.5">
        {bank.map((t) => (
          <button
            key={t.id}
            onClick={() => pickFromBank(t)}
            disabled={done}
            className="rounded-lg bg-amber-300 px-2.5 py-1.5 text-sm font-bold text-amber-950 shadow transition hover:bg-amber-200 active:scale-95"
          >
            {t.text}
          </button>
        ))}
      </div>

      {status === "won" ? (
        <div className="w-full rounded-2xl bg-green-500 px-4 py-3 text-center text-lg font-extrabold text-white shadow-xl">
          Perfect sentence! 🎉
        </div>
      ) : status === "lost" ? (
        <div className="w-full rounded-2xl bg-yellow-400 px-4 py-3 text-center text-yellow-950 shadow-xl">
          <div className="font-extrabold">The correct sentence was:</div>
          <div className="mt-1 text-sm font-medium">{challenge.sentence || tokens.join(" ")}</div>
        </div>
      ) : (
        <div className="flex w-full gap-2">
          <button
            onClick={reset}
            className="rounded-xl bg-white/10 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-white/20 active:scale-95"
          >
            ↺ Reset
          </button>
          <button
            onClick={check}
            disabled={placed.length !== tokens.length}
            className="flex-1 rounded-xl bg-gradient-to-r from-fuchsia-600 to-indigo-600 px-3 py-2.5 text-sm font-bold text-white shadow-xl transition hover:opacity-90 active:scale-95 disabled:opacity-40"
          >
            Check ✓
          </button>
        </div>
      )}
    </div>
  );
}
