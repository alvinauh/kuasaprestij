// BlockBlastGame — quiz-driven Block Blast
// Layout: question (top) | 8×8 grid (middle) | MCQ options (bottom)
//
// Correct answer  → next queued piece is auto-placed at the best position.
//                   Complete rows/cols explode off the board for points.
// Wrong answer    → piece is lost (−1 life). 3 wrongs in a row triggers a
//                   "blast" that randomly fills 5–7 cells on the board.
// Streak ≥ 5      → power blast: next correct answer ALSO clears the entire
//                   row the piece lands in (bonus wipe).
// Bad topic       → blast fires immediately after the correct placement
//   (masteryScore < 0.3 passed in from parent).

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { GameChallenge } from "./CatchStarsGame";
import {
  startSession,
  submitAnswer,
  fetchSessionChallenge,
  type QuestionType,
} from "@/services/api";
import { buildChallengeFrom } from "@/lib/challenge";

type Letter = "A" | "B" | "C" | "D";
const LETTERS: Letter[] = ["A", "B", "C", "D"];

// ── Grid ─────────────────────────────────────────────────────────────────────
const COLS = 8;
const ROWS = 8;
const WIN_SCORE = 120;
const LIVES = 3;
const BUFFER_TARGET = 4;

// ── Piece library ─────────────────────────────────────────────────────────────
// Each piece is [rows][cols] of 0/1.
const PIECES: { shape: number[][]; color: string }[] = [
  { shape: [[1, 1, 1, 1]], color: "#6366f1" },           // I horiz
  { shape: [[1], [1], [1], [1]], color: "#6366f1" },     // I vert
  { shape: [[1, 1], [1, 1]], color: "#f59e0b" },         // O
  { shape: [[1, 1, 1], [0, 0, 1]], color: "#10b981" },   // L
  { shape: [[1, 1, 1], [1, 0, 0]], color: "#ef4444" },   // J
  { shape: [[0, 1], [1, 1], [1, 0]], color: "#8b5cf6" }, // S
  { shape: [[1, 0], [1, 1], [0, 1]], color: "#ec4899" }, // Z
  { shape: [[0, 1, 0], [1, 1, 1]], color: "#06b6d4" },   // T
  { shape: [[1, 1], [1, 0]], color: "#f97316" },         // small-L
  { shape: [[1, 1, 0], [0, 1, 1]], color: "#84cc16" },   // small-S
  { shape: [[1, 1]], color: "#a78bfa" },                 // domino H
  { shape: [[1], [1]], color: "#a78bfa" },               // domino V
  { shape: [[1, 1, 1]], color: "#34d399" },              // line-3 H
  { shape: [[1], [1], [1]], color: "#34d399" },          // line-3 V
  { shape: [[1]], color: "#fb923c" },                    // single
];

// ── Board helpers ─────────────────────────────────────────────────────────────
type Cell = { color: string | null; flash: boolean };

const emptyBoard = (): Cell[][] =>
  Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => ({ color: null, flash: false }))
  );

const randPiece = () => Math.floor(Math.random() * PIECES.length);

function canPlace(
  board: Cell[][],
  shape: number[][],
  row: number,
  col: number
): boolean {
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const br = row + r, bc = col + c;
      if (br < 0 || br >= ROWS || bc < 0 || bc >= COLS) return false;
      if (board[br][bc].color !== null) return false;
    }
  return true;
}

// Best placement = maximise line-clears, then prefer bottom + centre.
function bestPlacement(
  board: Cell[][],
  shape: number[][]
): [number, number] | null {
  let best: [number, number] | null = null;
  let bestScore = -Infinity;
  const pR = shape.length, pC = shape[0].length;
  for (let r = 0; r <= ROWS - pR; r++) {
    for (let c = 0; c <= COLS - pC; c++) {
      if (!canPlace(board, shape, r, c)) continue;
      const sim = board.map(row => row.map(cell => ({ ...cell })));
      for (let pr = 0; pr < pR; pr++)
        for (let pc = 0; pc < pC; pc++)
          if (shape[pr][pc]) sim[r + pr][c + pc].color = "#fff";
      let clears = 0;
      for (let tr = 0; tr < ROWS; tr++)
        if (sim[tr].every(c => c.color)) clears++;
      for (let tc = 0; tc < COLS; tc++)
        if (sim.every(row => row[tc].color)) clears++;
      const score = clears * 200 + r * 3 - Math.abs(c - COLS / 2);
      if (score > bestScore) { bestScore = score; best = [r, c]; }
    }
  }
  return best;
}

function applyPiece(
  board: Cell[][],
  shape: number[][],
  row: number,
  col: number,
  color: string
): Cell[][] {
  const nb = board.map(r => r.map(c => ({ ...c })));
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      if (shape[r][c]) nb[row + r][col + c] = { color, flash: false };
  return nb;
}

function findClears(board: Cell[][]): { rows: number[]; cols: number[] } {
  const rows: number[] = [], cols: number[] = [];
  for (let r = 0; r < ROWS; r++)
    if (board[r].every(c => c.color !== null)) rows.push(r);
  for (let c = 0; c < COLS; c++)
    if (board.every(r => r[c].color !== null)) cols.push(c);
  return { rows, cols };
}

function flashCells(board: Cell[][], rows: number[], cols: number[]): Cell[][] {
  const nb = board.map(r => r.map(c => ({ ...c })));
  for (const r of rows) nb[r].forEach(c => (c.flash = true));
  for (const c of cols) nb.forEach(r => (r[c].flash = true));
  return nb;
}

function eraseLines(board: Cell[][], rows: number[], cols: number[]): Cell[][] {
  const nb = board.map(r => r.map(c => ({ ...c, flash: false })));
  for (const r of rows)
    nb[r] = Array.from({ length: COLS }, () => ({ color: null, flash: false }));
  for (const c of cols)
    nb.forEach(r => (r[c] = { color: null, flash: false }));
  return nb;
}

function blastCells(board: Cell[][]): Cell[][] {
  const nb = board.map(r => r.map(c => ({ ...c })));
  const BLAST_COLOR = "#334155";
  let added = 0;
  let attempts = 0;
  const count = 5 + Math.floor(Math.random() * 3);
  while (added < count && attempts < 80) {
    const r = Math.floor(Math.random() * ROWS);
    const c = Math.floor(Math.random() * COLS);
    if (!nb[r][c].color) { nb[r][c] = { color: BLAST_COLOR, flash: false }; added++; }
    attempts++;
  }
  return nb;
}

function clearPowerRow(board: Cell[][], targetRow: number): Cell[][] {
  const nb = board.map(r => r.map(c => ({ ...c })));
  nb[Math.min(targetRow, ROWS - 1)] = Array.from(
    { length: COLS },
    () => ({ color: null, flash: false })
  );
  return nb;
}

function scoreFor(clears: number): number {
  return clears === 0 ? 5 : clears === 1 ? 15 : clears === 2 ? 35 : clears === 3 ? 65 : 100;
}

function hasMove(board: Cell[][], pieceIdxs: number[]): boolean {
  return pieceIdxs.some(idx => {
    const { shape } = PIECES[idx];
    for (let r = 0; r <= ROWS - shape.length; r++)
      for (let c = 0; c <= COLS - shape[0].length; c++)
        if (canPlace(board, shape, r, c)) return true;
    return false;
  });
}

// ── Component props ───────────────────────────────────────────────────────────
// Standalone mode: fetches its own question queue (like PlayModeGame).
// Challenge mode:  wraps a single pre-fetched challenge (like CatchStarsGame).
export interface BlockBlastStandaloneProps {
  mode: "standalone";
  studentId: string;
  topic: string;
  subject: string;
  apiLang: string;
  lang: string;
  formLevel: number;
  questionType: QuestionType;
  streak?: number;
  masteryScore?: number;
  onResult: (r: {
    correct: boolean;
    points: number;
    mastery?: number | null;
  }) => void;
  onExit: () => void;
}

export interface BlockBlastChallengeProps {
  mode?: "challenge";
  challenge: GameChallenge;
  streak?: number;
  masteryScore?: number;
  lang?: string;
  onGameEnd: (won: boolean) => void;
}

type Props = BlockBlastStandaloneProps | BlockBlastChallengeProps;

function isStandalone(p: Props): p is BlockBlastStandaloneProps {
  return (p as BlockBlastStandaloneProps).mode === "standalone";
}

// ── Component ─────────────────────────────────────────────────────────────────
export function BlockBlastGame(props: Props) {
  const lang = isStandalone(props) ? props.lang : (props.lang ?? "en");
  const streak = props.streak ?? 0;
  const masteryScore = props.masteryScore;

  // ── Board state ───────────────────────────────────────────────────────────
  const [board, setBoard] = useState<Cell[][]>(emptyBoard);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(LIVES);
  const [pieceQueue, setPieceQueue] = useState<number[]>(() => [
    randPiece(), randPiece(), randPiece(),
  ]);
  const [wrongStreak, setWrongStreak] = useState(0);
  const [powerBlastArmed, setPowerBlastArmed] = useState(false);
  const [blastArmed, setBlastArmed] = useState(false);
  const [blastMsg, setBlastMsg] = useState<string | null>(null);

  // ── Question state ────────────────────────────────────────────────────────
  const [currentChallenge, setCurrentChallenge] = useState<GameChallenge | null>(
    !isStandalone(props) ? props.challenge : null
  );
  const [selected, setSelected] = useState<Letter | null>(null);
  const [verdict, setVerdict] = useState<"correct" | "wrong" | null>(null);
  const [phase, setPhase] = useState<
    "loading" | "question" | "animating" | "gameover" | "won"
  >(isStandalone(props) ? "loading" : "question");

  // For standalone: question buffer
  const queueRef = useRef<GameChallenge[]>([]);
  const prefetchingRef = useRef(false);
  const boardRef = useRef(board);
  boardRef.current = board;
  const scoreRef = useRef(score);
  scoreRef.current = score;
  const livesRef = useRef(lives);
  livesRef.current = lives;
  const pieceQueueRef = useRef(pieceQueue);
  pieceQueueRef.current = pieceQueue;

  // ── Blast trigger watcher ─────────────────────────────────────────────────
  useEffect(() => {
    if (masteryScore !== undefined && masteryScore < 0.3) setBlastArmed(true);
  }, [masteryScore]);

  useEffect(() => {
    if (streak >= 5) setPowerBlastArmed(true);
  }, [streak]);

  // ── Standalone: question fetching ─────────────────────────────────────────
  const refill = useCallback(async () => {
    if (!isStandalone(props)) return;
    if (prefetchingRef.current) return;
    prefetchingRef.current = true;
    const { studentId, topic, subject, apiLang, questionType, formLevel } = props;
    try {
      while (queueRef.current.length < BUFFER_TARGET) {
        const s = await startSession(
          studentId, topic, "KSSM", apiLang, subject,
          undefined, true, questionType, formLevel
        );
        if (!s.session_id || !s.question?.trim()) continue;
        const correctRaw = await fetchSessionChallenge(s.session_id);
        const ch = buildChallengeFrom(s.question, s.options, correctRaw, "mcq", {
          sessionId: s.session_id,
          explanation: s.illustrative_notes || undefined,
          topic: s.topic ?? topic,
          subject: s.subject ?? subject,
        });
        if (ch) queueRef.current.push(ch);
      }
    } catch { /* leave queue as-is */ } finally {
      prefetchingRef.current = false;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const advanceQuestion = useCallback(() => {
    if (!isStandalone(props)) return;
    if (queueRef.current.length < BUFFER_TARGET) void refill();
    const next = queueRef.current.shift();
    if (!next) {
      setTimeout(advanceQuestion, 600); // wait for buffer
      return;
    }
    setCurrentChallenge(next);
    setSelected(null);
    setVerdict(null);
    setPhase("question");
  }, [refill]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isStandalone(props)) return;
    void (async () => {
      await refill();
      advanceQuestion();
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Show blast message briefly ────────────────────────────────────────────
  const showBlast = (msg: string) => {
    setBlastMsg(msg);
    setTimeout(() => setBlastMsg(null), 1600);
  };

  // ── Submit standalone answer to backend ───────────────────────────────────
  const submitToBackend = (challenge: GameChallenge, letter: Letter) => {
    if (!isStandalone(props)) return;
    const { studentId, topic, subject, apiLang, onResult } = props;
    const answerText = challenge.options[letter] ?? letter;
    void submitAnswer(
      studentId, challenge.topic ?? topic, "", answerText,
      {}, undefined, apiLang, challenge.subject ?? subject, challenge.sessionId,
    ).then(res => {
      onResult({
        correct: res.is_correct ?? res.correct ?? (letter === challenge.correctLetter),
        points: res.points_awarded ?? 0,
        mastery: res.mastery_score ?? null,
      });
    }).catch(() => {
      onResult({
        correct: letter === challenge.correctLetter,
        points: 0,
        mastery: null,
      });
    });
  };

  // ── Core answer handler ───────────────────────────────────────────────────
  const handleAnswer = useCallback((letter: Letter) => {
    if (phase !== "question" || verdict !== null || !currentChallenge) return;
    setSelected(letter);
    const correct = letter === currentChallenge.correctLetter;
    setVerdict(correct ? "correct" : "wrong");
    setPhase("animating");

    if (isStandalone(props)) submitToBackend(currentChallenge, letter);

    if (correct) {
      setWrongStreak(0);
      const { shape, color } = PIECES[pieceQueueRef.current[0]];
      const pos = bestPlacement(boardRef.current, shape);

      if (!pos) {
        // Board full — game over
        setPhase("gameover");
        if (!isStandalone(props)) props.onGameEnd(false);
        return;
      }

      const [pr, pc] = pos;
      let newBoard = applyPiece(boardRef.current, shape, pr, pc, color);

      // Power blast: clear the bottom-most row the piece occupied
      if (powerBlastArmed) {
        const bottomRow = pr + shape.length - 1;
        newBoard = clearPowerRow(newBoard, bottomRow);
        setPowerBlastArmed(false);
        showBlast(lang === "ms" ? "💥 Kuasa Letup!" : "💥 Power Blast!");
      }

      // Bad topic blast: fire after placing
      if (blastArmed) {
        newBoard = blastCells(newBoard);
        setBlastArmed(false);
        showBlast(lang === "ms" ? "💣 Letupan! Papan berdenyut!" : "💣 Blast! Board shaking!");
      }

      const { rows, cols } = findClears(newBoard);

      if (rows.length + cols.length > 0) {
        // Flash then clear
        setBoard(flashCells(newBoard, rows, cols));
        setTimeout(() => {
          const cleared = eraseLines(newBoard, rows, cols);
          const pts = scoreFor(rows.length + cols.length);
          setBoard(cleared);
          const newScore = scoreRef.current + pts;
          setScore(newScore);

          const newPieces = [
            ...pieceQueueRef.current.slice(1), randPiece(),
          ];
          setPieceQueue(newPieces);

          if (newScore >= WIN_SCORE) {
            setPhase("won");
            if (!isStandalone(props)) props.onGameEnd(true);
          } else if (!hasMove(cleared, newPieces)) {
            setPhase("gameover");
            if (!isStandalone(props)) props.onGameEnd(false);
          } else {
            if (isStandalone(props)) advanceQuestion();
            else {
              // Challenge mode: replay the same question
              setSelected(null);
              setVerdict(null);
              setPhase("question");
            }
          }
        }, 380);
      } else {
        setBoard(newBoard);
        const pts = scoreFor(0);
        const newScore = scoreRef.current + pts;
        setScore(newScore);

        const newPieces = [
          ...pieceQueueRef.current.slice(1), randPiece(),
        ];
        setPieceQueue(newPieces);

        if (newScore >= WIN_SCORE) {
          setPhase("won");
          if (!isStandalone(props)) props.onGameEnd(true);
        } else if (!hasMove(newBoard, newPieces)) {
          setPhase("gameover");
          if (!isStandalone(props)) props.onGameEnd(false);
        } else {
          if (isStandalone(props)) advanceQuestion();
          else {
            setSelected(null);
            setVerdict(null);
            setPhase("question");
          }
        }
      }
    } else {
      // Wrong answer
      const newWrong = wrongStreak + 1;
      setWrongStreak(newWrong);
      const newLives = livesRef.current - 1;
      setLives(newLives);

      // 3 consecutive wrong → blast fires
      if (newWrong >= 3) {
        setBoard(blastCells(boardRef.current));
        setWrongStreak(0);
        showBlast(lang === "ms" ? "💣 3 salah — Letupan!" : "💣 3 wrong — Blast!");
      }

      // Cycle to next piece (lost on wrong answer)
      const newPieces = [...pieceQueueRef.current.slice(1), randPiece()];
      setPieceQueue(newPieces);

      setTimeout(() => {
        if (newLives <= 0) {
          setPhase("gameover");
          if (!isStandalone(props)) props.onGameEnd(false);
        } else {
          if (isStandalone(props)) advanceQuestion();
          else {
            setSelected(null);
            setVerdict(null);
            setPhase("question");
          }
        }
      }, 700);
    }
  }, [
    phase, verdict, currentChallenge, powerBlastArmed, blastArmed,
    wrongStreak, lang, advanceQuestion,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Restart (standalone only) ─────────────────────────────────────────────
  const restart = () => {
    setBoard(emptyBoard());
    setScore(0);
    setLives(LIVES);
    setPieceQueue([randPiece(), randPiece(), randPiece()]);
    setWrongStreak(0);
    setPowerBlastArmed(false);
    setBlastArmed(false);
    if (isStandalone(props)) {
      void refill().then(advanceQuestion);
    } else {
      setCurrentChallenge(props.challenge);
      setSelected(null);
      setVerdict(null);
      setPhase("question");
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const t = (ms: string, en: string) => lang === "ms" ? ms : en;
  const pieceCurrent = PIECES[pieceQueue[0]];

  const TINT: Record<Letter, string> = {
    A: "border-rose-400/60 bg-rose-500/10 text-rose-100",
    B: "border-sky-400/60 bg-sky-500/10 text-sky-100",
    C: "border-amber-400/60 bg-amber-500/10 text-amber-100",
    D: "border-emerald-400/60 bg-emerald-500/10 text-emerald-100",
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#0c0c20] text-white select-none">

      {/* ── TOP: question + HUD ────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-white/10 bg-[#14142e] px-4 pt-3 pb-2 space-y-2">
        {/* HUD row */}
        <div className="flex items-center justify-between text-xs font-bold">
          <span className="tracking-wide text-slate-400">
            {Array.from({ length: LIVES }, (_, i) => (
              <span key={i} className={i < lives ? "text-rose-400" : "text-slate-700"}>♥</span>
            ))}
          </span>

          <span className="font-mono text-violet-300 tabular-nums">
            {score} <span className="text-slate-500 font-normal">/ {WIN_SCORE}</span>
          </span>

          {streak >= 3 && (
            <span className="text-amber-300">🔥 ×{streak}</span>
          )}
        </div>

        {/* Blast indicators */}
        {(blastArmed || powerBlastArmed) && (
          <div className="flex gap-2 text-[11px] font-semibold">
            {blastArmed && (
              <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-red-300 border border-red-400/40">
                💣 {t("Letupan Sedia", "Blast Ready")}
              </span>
            )}
            {powerBlastArmed && (
              <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-violet-300 border border-violet-400/40">
                ⚡ {t("Kuasa Sedia", "Power Ready")}
              </span>
            )}
          </div>
        )}

        {/* Question */}
        {currentChallenge ? (
          <p className="text-sm font-semibold leading-snug line-clamp-3">
            {currentChallenge.question}
          </p>
        ) : (
          <p className="text-sm text-slate-500 animate-pulse">
            {t("Memuatkan soalan…", "Loading question…")}
          </p>
        )}
      </div>

      {/* ── MIDDLE: block grid ─────────────────────────────────────────────── */}
      <div className="relative flex flex-1 flex-col items-center justify-center gap-3 py-2">

        {/* Blast overlay message */}
        {blastMsg && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <div className="rounded-2xl bg-black/80 px-5 py-3 text-lg font-black text-amber-300 animate-bounce shadow-2xl">
              {blastMsg}
            </div>
          </div>
        )}

        {/* 8×8 grid */}
        <div
          className="grid gap-[2px] rounded-xl border border-white/10 bg-[#07071a] p-2 shadow-[0_0_40px_rgba(99,102,241,0.15)]"
          style={{
            gridTemplateColumns: `repeat(${COLS}, 1fr)`,
            width: "min(264px, 82vw)",
            aspectRatio: "1 / 1",
          }}
        >
          {board.map((row, ri) =>
            row.map((cell, ci) => (
              <div
                key={`${ri}-${ci}`}
                className="rounded-[3px] transition-all duration-200"
                style={{
                  backgroundColor: cell.flash
                    ? "#ffffff"
                    : cell.color ?? "#1a1a38",
                  boxShadow: cell.color && !cell.flash
                    ? `inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(0,0,0,0.35)`
                    : cell.flash
                    ? "0 0 10px #fff, 0 0 20px rgba(255,255,255,0.8)"
                    : `inset 0 1px 0 rgba(255,255,255,0.03)`,
                  transform: cell.flash ? "scale(1.08)" : "scale(1)",
                }}
              />
            ))
          )}
        </div>

        {/* Next pieces preview */}
        <div className="flex items-center gap-3">
          <span className="text-[10px] uppercase tracking-widest text-slate-600">
            {t("Seterusnya", "Next")}
          </span>
          {pieceQueue.slice(0, 3).map((pIdx, i) => {
            const p = PIECES[pIdx];
            return (
              <div
                key={i}
                className={cn(
                  "rounded-lg border p-1.5 transition-all",
                  i === 0
                    ? "border-violet-400/50 bg-violet-500/10 scale-110"
                    : "border-white/10 bg-white/[0.03] opacity-40 scale-90"
                )}
              >
                <div
                  className="grid gap-[2px]"
                  style={{ gridTemplateColumns: `repeat(${p.shape[0].length}, 8px)` }}
                >
                  {p.shape.map((row, ri) =>
                    row.map((filled, ci) => (
                      <div
                        key={`${ri}-${ci}`}
                        className="rounded-[2px]"
                        style={{
                          width: 8,
                          height: 8,
                          backgroundColor: filled ? p.color : "transparent",
                          boxShadow: filled
                            ? `inset 0 1px 0 rgba(255,255,255,0.25)`
                            : undefined,
                        }}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Phase overlays */}
        {(phase === "gameover" || phase === "won") && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/85 backdrop-blur-sm text-center px-6">
            {phase === "won" ? (
              <>
                <p className="text-3xl font-black text-emerald-400">
                  🎉 {t("Menang!", "You Win!")}
                </p>
                <p className="text-sm text-white/60">
                  {t("Skor", "Score")}: <span className="font-bold text-white">{score}</span>
                </p>
              </>
            ) : (
              <>
                <p className="text-3xl font-black text-rose-400">
                  💀 {t("Papan Penuh!", "Board Full!")}
                </p>
                <p className="text-sm text-white/60">
                  {t("Skor", "Score")}: <span className="font-bold text-white">{score}</span>
                </p>
              </>
            )}
            {isStandalone(props) ? (
              <div className="flex gap-2 mt-2">
                <button
                  onClick={restart}
                  className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-400 active:scale-95"
                >
                  {t("Main Lagi", "Play Again")}
                </button>
                <button
                  onClick={props.onExit}
                  className="rounded-full bg-white/10 px-5 py-2 text-sm font-bold text-white/70 hover:bg-white/20 active:scale-95"
                >
                  {t("Keluar", "Exit")}
                </button>
              </div>
            ) : null}
          </div>
        )}

        {phase === "loading" && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <p className="text-sm text-slate-400 animate-pulse">
              {t("Memuatkan…", "Loading…")}
            </p>
          </div>
        )}
      </div>

      {/* ── BOTTOM: MCQ options ─────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-white/10 bg-[#14142e] px-3 py-2.5 flex flex-col gap-1.5">
        {currentChallenge
          ? LETTERS.map((letter) => {
              const text = currentChallenge.options[letter];
              if (!text) return null;
              const isPicked = selected === letter;
              const isCorrect = isPicked && verdict === "correct";
              const isWrong = isPicked && verdict === "wrong";
              const disabled = verdict !== null || phase !== "question";
              return (
                <button
                  key={letter}
                  disabled={disabled}
                  onClick={() => handleAnswer(letter)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-[13px] font-medium transition-all active:scale-[0.98]",
                    TINT[letter],
                    !disabled && "hover:scale-[1.01] hover:brightness-110",
                    isCorrect && "!border-emerald-400 !bg-emerald-500/25 !text-emerald-100",
                    isWrong && "!border-rose-400 !bg-rose-500/25 !text-rose-100",
                    disabled && !isPicked && "opacity-30",
                  )}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/20 bg-black/30 text-[11px] font-bold">
                    {letter}
                  </span>
                  <span className="flex-1 leading-tight line-clamp-2">{text}</span>
                  {isCorrect && <span className="text-emerald-300 text-base">✓</span>}
                  {isWrong && <span className="text-rose-300 text-base">✗</span>}
                </button>
              );
            })
          : (
            <p className="text-center text-xs text-slate-600 py-4 animate-pulse">
              {t("Memuatkan pilihan…", "Loading options…")}
            </p>
          )}
      </div>
    </div>
  );
}
