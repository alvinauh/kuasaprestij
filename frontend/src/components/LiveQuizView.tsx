import { useCallback, useEffect, useRef, useState } from "react";
import { Brain, Gamepad2, Loader2, Timer, Trophy, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DinoRunnerGame } from "@/components/games/DinoRunnerGame";
import {
  getArenaScoreboard,
  getLiveReveal,
  submitLiveAnswer,
  submitLiveGameScore,
  type ArenaScoreboard,
  type LiveAnswer,
  type LiveGameScore,
  type LiveSession,
} from "@/services/api";

type Letter = "A" | "B" | "C" | "D";
const LETTERS: Letter[] = ["A", "B", "C", "D"];
const LETTER_STYLE: Record<Letter, string> = {
  A: "border-red-400/60 bg-red-500/10 text-red-100",
  B: "border-blue-400/60 bg-blue-500/10 text-blue-100",
  C: "border-amber-400/60 bg-amber-500/10 text-amber-100",
  D: "border-emerald-400/60 bg-emerald-500/10 text-emerald-100",
};

interface Props {
  session: LiveSession;
  studentId: string;
  studentName?: string;
  onClose: () => void;
}

/**
 * Seconds left in a timed round. Uses the server's started_at, but falls back to
 * "full duration from when this device saw the round" when the device clock is
 * implausibly far off — phones at a venue are not all NTP-synced.
 */
export function useRoundCountdown(session: LiveSession, ended: boolean) {
  const duration = session.duration_s ?? 0;
  const deadlineRef = useRef<{ id: string; at: number } | null>(null);
  if (duration > 0 && deadlineRef.current?.id !== session.id) {
    const serverDeadline = new Date(session.started_at).getTime() + duration * 1000;
    const left = serverDeadline - Date.now();
    const plausible = left > -5000 && left < duration * 1000 + 5000;
    deadlineRef.current = { id: session.id, at: plausible ? serverDeadline : Date.now() + duration * 1000 };
  }
  const calc = () => (deadlineRef.current ? Math.max(0, Math.ceil((deadlineRef.current.at - Date.now()) / 1000)) : 0);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (ended || !duration) return;
    const t = window.setInterval(() => setTick((n) => n + 1), 250);
    return () => window.clearInterval(t);
  }, [ended, duration, session.id]);
  return duration ? (ended ? 0 : calc()) : null;
}

function rankBadge(i: number) {
  return i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
}

/** Two independent standings: question points and game points. */
function ArenaStandings({ board, studentId }: { board: ArenaScoreboard; studentId: string }) {
  const Section = ({
    title,
    icon,
    rows,
    unit,
  }: {
    title: string;
    icon: React.ReactNode;
    rows: { student_id: string; name: string; points: number }[];
    unit: string;
  }) => {
    const myIdx = rows.findIndex((r) => r.student_id === studentId);
    const top = rows.slice(0, 5);
    return (
      <div className="flex-1 rounded-2xl border border-white/10 bg-white/5 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/50">
          {icon} {title}
        </div>
        {rows.length === 0 ? (
          <p className="py-3 text-center text-xs text-white/30">No rounds yet</p>
        ) : (
          <div className="space-y-1">
            {top.map((r, i) => (
              <div
                key={r.student_id}
                className={`flex items-center gap-2 rounded-lg px-2 py-1 text-sm ${r.student_id === studentId ? "bg-amber-500/15 ring-1 ring-amber-400/40" : ""}`}
              >
                <span className="w-6 text-center text-xs">{rankBadge(i)}</span>
                <span className="flex-1 truncate">{r.name}</span>
                <span className="font-bold tabular-nums text-amber-300">{r.points}</span>
              </div>
            ))}
            {myIdx >= 5 && (
              <div className="flex items-center gap-2 rounded-lg bg-amber-500/15 px-2 py-1 text-sm ring-1 ring-amber-400/40">
                <span className="w-6 text-center text-xs">#{myIdx + 1}</span>
                <span className="flex-1 truncate">You</span>
                <span className="font-bold tabular-nums text-amber-300">{rows[myIdx].points}</span>
              </div>
            )}
          </div>
        )}
        <p className="mt-1 text-right text-[10px] text-white/30">{unit}</p>
      </div>
    );
  };
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Section title="Question points" icon={<Brain className="h-3.5 w-3.5" />} rows={board.questions} unit="correct + speed" />
      <Section title="Game points" icon={<Gamepad2 className="h-3.5 w-3.5" />} rows={board.games} unit="best run per round" />
    </div>
  );
}

// ── Question round ───────────────────────────────────────────────────────────

function QuestionRound({
  session,
  studentId,
  studentName,
  ended,
}: {
  session: LiveSession;
  studentId: string;
  studentName?: string;
  ended: boolean;
}) {
  const [selected, setSelected] = useState<Letter | null>(null);
  const [result, setResult] = useState<{ is_correct: boolean; points?: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<LiveAnswer[]>([]);
  const [correct, setCorrect] = useState<string | null>(null);
  const left = useRoundCountdown(session, ended);
  const locked = ended || left === 0;

  useEffect(() => {
    const ch = supabase
      .channel(`live-lb-${session.id}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        { event: "INSERT", schema: "public", table: "classroom_live_answers", filter: `live_session_id=eq.${session.id}` },
        (payload: { new: LiveAnswer }) => {
          const ans = payload.new;
          setAnswers((prev) => (prev.some((a) => a.student_id === ans.student_id) ? prev : [...prev, ans]));
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [session.id]);

  // Reveal the answer once the teacher closes the round.
  useEffect(() => {
    if (!ended) return;
    void getLiveReveal(session.id).then(setCorrect);
  }, [ended, session.id]);

  const submit = async (letter: Letter) => {
    if (selected || submitting || locked) return;
    setSelected(letter);
    setSubmitting(true);
    setError(null);
    try {
      const res = await submitLiveAnswer({
        live_session_id: session.id,
        student_id: studentId,
        student_name: studentName,
        answer: letter,
      });
      setResult(res);
    } catch {
      setSelected(null);
      setError("Couldn't send your answer — tap again.");
    } finally {
      setSubmitting(false);
    }
  };

  const opts = session.options as { A: string; B: string; C: string; D: string } | null;
  const ranked = [...answers]
    .filter((a) => a.is_correct)
    .sort((a, b) => new Date(a.answered_at).getTime() - new Date(b.answered_at).getTime());
  const myRank = ranked.findIndex((a) => a.student_id === studentId) + 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-white/60">
        <span className="truncate">{[session.subject, session.topic].filter(Boolean).join(" · ")}</span>
        {left !== null && (
          <span className={`flex shrink-0 items-center gap-1 font-bold tabular-nums ${left <= 5 && !locked ? "text-red-400" : "text-white"}`}>
            <Timer className="h-3.5 w-3.5" /> {left}s
          </span>
        )}
      </div>

      {session.object_lesson && (
        <div className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-200/80 ring-1 ring-amber-400/20">
          <span className="mr-1 font-semibold text-amber-300">🌏</span>
          {session.object_lesson.replace(/\*\*/g, "")}
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <p className="whitespace-pre-line text-base font-semibold leading-relaxed">{session.question}</p>
      </div>

      {opts && (
        <div className="grid grid-cols-1 gap-2.5">
          {LETTERS.map((letter) => {
            const isMine = selected === letter;
            const isKey = correct === letter;
            return (
              <button
                key={letter}
                type="button"
                disabled={!!selected || submitting || locked}
                onClick={() => void submit(letter)}
                className={[
                  "flex items-start gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-medium transition active:scale-[0.98]",
                  isKey
                    ? "border-green-400 bg-green-500/25 text-green-100"
                    : isMine
                    ? result?.is_correct
                      ? "border-green-400 bg-green-500/20 text-green-100"
                      : result
                      ? "border-red-400 bg-red-500/20 text-red-100"
                      : LETTER_STYLE[letter]
                    : selected || locked
                    ? "opacity-50 " + LETTER_STYLE[letter]
                    : LETTER_STYLE[letter] + " hover:opacity-90",
                ].join(" ")}
              >
                <span className="mt-0.5 shrink-0 text-xs font-black">{letter}</span>
                <span>{opts[letter]}</span>
                {isMine && submitting && <Loader2 className="ml-auto h-4 w-4 shrink-0 animate-spin" />}
              </button>
            );
          })}
        </div>
      )}

      {error && <p className="text-center text-sm text-red-300">{error}</p>}

      {result ? (
        <div className={`rounded-2xl p-4 text-center text-lg font-bold ${result.is_correct ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"}`}>
          {result.is_correct ? `✓ Correct! +${result.points ?? 0} pts` : "✗ Not this time"}
          {result.is_correct && myRank > 0 && myRank <= 3 && (
            <div className="mt-1 text-sm font-medium text-white/70">
              {myRank === 1 ? "🥇 Fastest in class!" : myRank === 2 ? "🥈 2nd fastest" : "🥉 3rd fastest"}
            </div>
          )}
        </div>
      ) : (
        locked && (
          <div className="rounded-2xl bg-white/5 p-4 text-center text-sm text-white/50">
            {ended ? "Round over." : "Time's up!"}
          </div>
        )
      )}

      <p className="text-center text-xs text-white/40">
        {answers.length} {answers.length === 1 ? "player has" : "players have"} answered
      </p>
    </div>
  );
}

// ── Game round ───────────────────────────────────────────────────────────────

function GameRound({
  session,
  studentId,
  studentName,
  ended,
}: {
  session: LiveSession;
  studentId: string;
  studentName?: string;
  ended: boolean;
}) {
  const left = useRoundCountdown(session, ended);
  const over = ended || left === 0;
  const [run, setRun] = useState(0);
  const [crashed, setCrashed] = useState(false);
  const [best, setBest] = useState(0);
  const [lastRun, setLastRun] = useState(0);
  const [scores, setScores] = useState<LiveGameScore[]>([]);
  const bestRef = useRef(0);
  const sentRef = useRef(0);
  const runScoreRef = useRef(0);

  const flush = useCallback(() => {
    if (bestRef.current <= sentRef.current) return;
    sentRef.current = bestRef.current;
    void submitLiveGameScore({
      live_session_id: session.id,
      student_id: studentId,
      student_name: studentName,
      score: bestRef.current,
    }).catch(() => { sentRef.current = 0; });
  }, [session.id, studentId, studentName]);

  // Send the best score at most once a second while playing, and once at the end.
  useEffect(() => {
    if (over) { flush(); return; }
    const t = window.setInterval(flush, 1000);
    return () => window.clearInterval(t);
  }, [over, flush]);

  // Live round leaderboard
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const load = () =>
      db
        .from("classroom_game_scores")
        .select("student_id,student_name,score")
        .eq("live_session_id", session.id)
        .order("score", { ascending: false })
        .then(({ data }: { data: LiveGameScore[] | null }) => setScores(data ?? []));
    void load();
    const ch = supabase
      .channel(`live-game-${session.id}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "classroom_game_scores", filter: `live_session_id=eq.${session.id}` },
        (payload: { new: LiveGameScore }) => {
          const row = payload.new;
          if (!row?.student_id) return;
          setScores((prev) =>
            [...prev.filter((s) => s.student_id !== row.student_id), row].sort((a, b) => b.score - a.score),
          );
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [session.id]);

  const onScore = (s: number) => {
    runScoreRef.current = s;
    if (s > bestRef.current) {
      bestRef.current = s;
      setBest(s);
    }
  };

  const onEnd = () => {
    setLastRun(runScoreRef.current);
    runScoreRef.current = 0;
    setCrashed(true);
  };

  const retry = () => {
    setCrashed(false);
    setRun((r) => r + 1);
  };

  const myRank = scores.findIndex((s) => s.student_id === studentId) + 1;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold">🦕 {session.question} Battle</p>
          <p className="text-xs text-white/50">Clear as many cacti as you can. Your best run counts.</p>
        </div>
        {left !== null && (
          <span className={`flex shrink-0 items-center gap-1 text-lg font-black tabular-nums ${left <= 10 && !over ? "text-red-400" : "text-white"}`}>
            <Timer className="h-4 w-4" /> {left}s
          </span>
        )}
      </div>

      <div className="flex items-center justify-center gap-4 rounded-xl bg-white/5 py-2 text-sm">
        <span>Best: <b className="text-amber-300 tabular-nums">{best}</b></span>
        {myRank > 0 && <span>Rank: <b className="tabular-nums">{rankBadge(myRank - 1)}</b></span>}
      </div>

      <div className="relative flex justify-center">
        {!over && !crashed && (
          <DinoRunnerGame key={run} goal={Infinity} onScoreUpdate={onScore} onGameEnd={onEnd} />
        )}
        {(over || crashed) && (
          <div className="flex h-[230px] w-full max-w-[360px] flex-col items-center justify-center gap-3 rounded-2xl border border-white/20 bg-white/5">
            {over ? (
              <>
                <p className="text-2xl font-black">⏱️ Time's up!</p>
                <p className="text-sm text-white/70">Your best run: <b className="text-amber-300">{best}</b></p>
              </>
            ) : (
              <>
                <p className="text-xl font-black">💥 Crashed at {lastRun}</p>
                <button
                  type="button"
                  onClick={retry}
                  autoFocus
                  className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-2.5 font-bold text-white active:scale-95"
                >
                  Run again ▶
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {scores.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-white/40">
            <Trophy className="h-3.5 w-3.5" /> This round
          </div>
          {scores.slice(0, 5).map((s, i) => (
            <div
              key={s.student_id}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm ${s.student_id === studentId ? "bg-amber-500/15 ring-1 ring-amber-400/40" : "bg-white/5"}`}
            >
              <span className="w-6 text-center text-xs">{rankBadge(i)}</span>
              <span className="flex-1 truncate">{s.student_name ?? "Student"}</span>
              <span className="font-bold tabular-nums text-amber-300">{s.score}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Shell ────────────────────────────────────────────────────────────────────

export function LiveQuizView({ session, studentId, studentName, onClose }: Props) {
  const [sessionEnded, setSessionEnded] = useState(session.status === "complete");
  const [board, setBoard] = useState<ArenaScoreboard | null>(null);
  const isGame = session.kind === "game";

  useEffect(() => {
    if (session.status === "complete") setSessionEnded(true);
  }, [session.status]);

  // Detect when the teacher ends the round
  useEffect(() => {
    const ch = supabase
      .channel(`live-sess-${session.id}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        { event: "UPDATE", schema: "public", table: "classroom_live_sessions", filter: `id=eq.${session.id}` },
        (payload: { new: LiveSession }) => {
          if (payload.new.status === "complete") setSessionEnded(true);
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [session.id]);

  // Arena standings: on open and again after the round closes (scores settle).
  useEffect(() => {
    if (!session.arena_id) return;
    const arenaId = session.arena_id;
    const load = () => void getArenaScoreboard(arenaId).then(setBoard).catch(() => {});
    load();
    if (!sessionEnded) return;
    const t = window.setTimeout(load, 1500);
    return () => window.clearTimeout(t);
  }, [session.arena_id, sessionEnded]);

  const me = board
    ? {
        q: board.questions.find((r) => r.student_id === studentId)?.points ?? 0,
        g: board.games.find((r) => r.student_id === studentId)?.points ?? 0,
      }
    : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[#0f0825] text-white">
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${sessionEnded ? "bg-white/30" : "animate-pulse bg-red-400"}`} />
          <span className="text-xs font-semibold uppercase tracking-wider text-white/60">
            {sessionEnded ? "Round over" : isGame ? "Live game battle" : "Live question"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {me && (
            <div className="flex items-center gap-2 text-xs font-semibold tabular-nums">
              <span className="flex items-center gap-1 rounded-full bg-violet-500/20 px-2 py-0.5 text-violet-200">
                <Brain className="h-3 w-3" /> {me.q}
              </span>
              <span className="flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-amber-200">
                <Gamepad2 className="h-3 w-3" /> {me.g}
              </span>
            </div>
          )}
          <button onClick={onClose} className="rounded-lg p-1 text-white/40 hover:text-white" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-lg flex-1 space-y-4 p-4">
        {isGame ? (
          <GameRound session={session} studentId={studentId} studentName={studentName} ended={sessionEnded} />
        ) : (
          <QuestionRound session={session} studentId={studentId} studentName={studentName} ended={sessionEnded} />
        )}

        {sessionEnded && (
          <>
            {board && <ArenaStandings board={board} studentId={studentId} />}
            <div className="flex items-center justify-center gap-2 rounded-2xl bg-white/5 p-3 text-center text-sm text-white/50">
              <Loader2 className="h-4 w-4 animate-spin" /> Stay here — the next round appears automatically
            </div>
          </>
        )}
      </div>
    </div>
  );
}
