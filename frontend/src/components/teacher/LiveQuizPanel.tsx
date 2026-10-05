import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Brain,
  Gamepad2,
  Loader2,
  Pause,
  Play,
  Radio,
  RotateCcw,
  SkipForward,
  StopCircle,
  Timer,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { arenaPresenceChannel, readArenaPresence, type ArenaPresenceMeta } from "@/hooks/useLiveSession";
import { useRoundCountdown } from "@/components/LiveQuizView";
import {
  endLiveSession,
  getArenaScoreboard,
  getLiveRound,
  startLiveGame,
  startLiveSession,
  prepareLiveMatch,
  fetchSubjects,
  type ArenaScoreboard,
  type LiveAnswer,
  type LiveGameScore,
  type LiveSession,
  type SubjectWithTopics,
  openArenaPin,
} from "@/services/api";

interface Props {
  classroomId: string;
  classroomName: string;
  classroomSubject: string | null;
  inviteCode?: string;
  teacherId: string;
  onClose: () => void;
}

type Letter = "A" | "B" | "C" | "D";
const LETTERS: Letter[] = ["A", "B", "C", "D"];
const LETTER_BG: Record<Letter, string> = {
  A: "bg-red-500",
  B: "bg-blue-500",
  C: "bg-amber-500",
  D: "bg-emerald-500",
};
const QUESTION_SECONDS = 20;
/** Pause on the results screen before the next round starts by itself. */
const BETWEEN_ROUNDS_MS = 8000;
const QUESTION_COUNTS = [3, 5, 8, 10];
const GAME_SECONDS = [30, 60, 90];
/** Live games the arena can run (backend LIVE_GAMES). */
const LIVE_GAMES = [{ id: "dino", label: "🦕 Dino Run", blurb: "Everyone plays at once — best run wins. Tap to jump." }] as const;

type MatchStep = { kind: "question"; index: number } | { kind: "game" };
interface Match {
  arenaId: string;
  quizId: string | null;
  subject: string;
  topic: string;
  game: string | null;
  gameSeconds: number;
  steps: MatchStep[];
}

/** Best guess at the classroom's subject in the KSSM subject list. */
function matchesClassSubject(subject: string, classSubject: string | null) {
  if (!classSubject) return false;
  const a = subject.toLowerCase();
  const b = classSubject.toLowerCase();
  const alias: Record<string, string> = { english: "bahasa inggeris", malay: "bahasa melayu", "bahasa malaysia": "bahasa melayu" };
  return a === b || a === (alias[b] ?? "") || (b.length > 3 && a.includes(b));
}

function stepLabel(step: MatchStep | undefined, total: number) {
  if (!step) return "";
  return step.kind === "game" ? "Game battle" : `Question ${step.index + 1} of ${total}`;
}

function newArenaId() {
  return crypto.randomUUID();
}

function loadArenaId(classroomId: string) {
  try {
    const saved = localStorage.getItem(`kp_arena_${classroomId}`);
    if (saved) return saved;
  } catch { /* storage blocked */ }
  return newArenaId();
}

function rankBadge(i: number) {
  return i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`;
}

/**
 * Live Arena — the teacher's projector screen for a classroom competition.
 * Players join by QR (Quick Join), then the teacher alternates question rounds
 * (points for correct + speed) and game battles (best Dino Run per round).
 * The two scores are kept and ranked separately.
 */
export function LiveQuizPanel({ classroomId, classroomName, classroomSubject, inviteCode, teacherId, onClose }: Props) {
  const [arenaId, setArenaId] = useState(() => loadArenaId(classroomId));
  const [lobby, setLobby] = useState<{ id: string; name: string }[]>([]);
  const [board, setBoard] = useState<ArenaScoreboard | null>(null);

  // Match setup — everything is chosen up front, then one button runs the match.
  const [subjects, setSubjects] = useState<SubjectWithTopics[]>([]);
  const [form, setForm] = useState(4);
  const [subjectLabel, setSubjectLabel] = useState("");
  const [topic, setTopic] = useState("");
  const [lang, setLang] = useState<"ms" | "en">("ms");
  const [questionCount, setQuestionCount] = useState(5);
  const [game, setGame] = useState<string>("dino");
  const [gameSeconds, setGameSeconds] = useState(60);

  // Match run
  const [phase, setPhase] = useState<"setup" | "preparing" | "running" | "done">("setup");
  const [match, setMatch] = useState<Match | null>(null);
  const [stepIdx, setStepIdx] = useState(-1);
  const [paused, setPaused] = useState(false);
  const [nextAt, setNextAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [starting, setStarting] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);

  // Current round
  const [round, setRound] = useState<LiveSession | null>(null);
  const [roundEnded, setRoundEnded] = useState(false);
  const [answers, setAnswers] = useState<LiveAnswer[]>([]);
  const [scores, setScores] = useState<LiveGameScore[]>([]);
  const [correct, setCorrect] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const endingRef = useRef(false);

  useEffect(() => {
    try { localStorage.setItem(`kp_arena_${classroomId}`, arenaId); } catch { /* storage blocked */ }
  }, [classroomId, arenaId]);

  useEffect(() => {
    let cancelled = false;
    void fetchSubjects(form)
      .then((list) => {
        if (cancelled) return;
        setSubjects(list);
        const pick = list.find((x) => matchesClassSubject(x.subject, classroomSubject)) ?? list[0];
        setSubjectLabel(pick?.display_label ?? "");
        setTopic(pick?.topics?.[0] ?? "");
      })
      .catch(() => setSubjects([]));
    return () => { cancelled = true; };
  }, [form, classroomSubject]);
  const subject = subjects.find((x) => x.display_label === subjectLabel) ?? null;

  // Short-lived 6-digit game PIN; the permanent invite code is only a fallback
  // if the PIN can't be issued.
  const [pin, setPin] = useState<string | null>(null);
  useEffect(() => {
    void openArenaPin(classroomId, teacherId).then((r) => setPin(r.pin)).catch(() => setPin(null));
  }, [classroomId, teacherId]);
  const joinCode = pin ?? inviteCode ?? "";

  const joinUrl = useMemo(
    () => (typeof window !== "undefined" && joinCode ? `${window.location.origin}/join?code=${joinCode}` : ""),
    [joinCode],
  );

  // Lobby: who is connected right now (students announce presence from the student app)
  useEffect(() => {
    // Join as the host too, so students' "Live now" can show the arena is open.
    const ch = supabase.channel(arenaPresenceChannel(classroomId), { config: { presence: { key: `host-${teacherId}` } } });
    ch.on("presence", { event: "sync" }, () => {
      setLobby(readArenaPresence(ch.presenceState() as Record<string, ArenaPresenceMeta[]>).players);
    }).subscribe((status) => {
      if (status === "SUBSCRIBED") void ch.track({ host: true, name: classroomName });
    });
    return () => { void supabase.removeChannel(ch); };
  }, [classroomId, teacherId, classroomName]);

  // Arena standings — refreshed every 2s while the screen is open
  const refreshBoard = useCallback(() => {
    void getArenaScoreboard(arenaId).then(setBoard).catch(() => {});
  }, [arenaId]);
  useEffect(() => {
    refreshBoard();
    const t = window.setInterval(refreshBoard, 2000);
    return () => window.clearInterval(t);
  }, [refreshBoard]);

  // Current round details — polled every second while it runs
  useEffect(() => {
    if (!round) return;
    let stop = false;
    const load = () =>
      getLiveRound(round.id)
        .then((r) => {
          if (stop) return;
          if (r.answers) setAnswers(r.answers);
          if (r.scores) setScores(r.scores);
        })
        .catch(() => {});
    void load();
    if (roundEnded) {
      // One more read shortly after the end so last-second scores land.
      const t = window.setTimeout(load, 2500);
      return () => { stop = true; window.clearTimeout(t); };
    }
    const t = window.setInterval(load, 1000);
    return () => { stop = true; window.clearInterval(t); };
  }, [round, roundEnded]);

  const finishRound = useCallback(async () => {
    if (!round || endingRef.current || roundEnded) return;
    endingRef.current = true;
    setEnding(true);
    try {
      const res = await endLiveSession(round.id);
      if (round.kind !== "game") {
        setAnswers(res.leaderboard);
        setCorrect(res.correct_answer ?? null);
      }
      setRoundEnded(true);
      refreshBoard();
    } finally {
      endingRef.current = false;
      setEnding(false);
    }
  }, [round, roundEnded, refreshBoard]);

  const left = useRoundCountdown(round ?? ({ started_at: new Date().toISOString(), duration_s: 0 } as LiveSession), roundEnded);

  // Auto-close a round when its timer runs out (games get a short grace for last scores),
  // or when every connected player has answered the question. Depend on booleans,
  // not the ticking `left`, so the pending timeout isn't reset 4× a second.
  const timeUp = !!round && !roundEnded && left === 0;
  const allAnswered =
    !!round && !roundEnded && round.kind !== "game" && lobby.length > 0 && answers.length >= lobby.length;
  useEffect(() => {
    if (!timeUp && !allAnswered) return;
    const t = window.setTimeout(() => void finishRound(), timeUp && round?.kind === "game" ? 2000 : allAnswered ? 1200 : 300);
    return () => window.clearTimeout(t);
  }, [timeUp, allAnswered, round?.kind, finishRound]);

  const beginRound = (sess: LiveSession) => {
    setRound(sess);
    setRoundEnded(false);
    setAnswers([]);
    setScores([]);
    setCorrect(null);
  };

  const runStep = useCallback(async (m: Match, i: number) => {
    const step = m.steps[i];
    if (!step) return;
    setStarting(true);
    setMatchError(null);
    setNextAt(null);
    try {
      const live =
        step.kind === "question"
          ? await startLiveSession({
              classroom_id: classroomId,
              teacher_id: teacherId,
              quiz_id: m.quizId ?? undefined,
              question_index: step.index,
              question_type: "mcq",
              subject: m.subject,
              topic: m.topic,
              arena_id: m.arenaId,
              duration_s: QUESTION_SECONDS,
            })
          : await startLiveGame({
              classroom_id: classroomId,
              teacher_id: teacherId,
              arena_id: m.arenaId,
              game: m.game ?? "dino",
              duration_s: m.gameSeconds,
            });
      setStepIdx(i);
      beginRound(live);
    } catch {
      setMatchError("Couldn't start the next round — press Next to retry.");
      setPaused(true);
    } finally {
      setStarting(false);
    }
  }, [classroomId, teacherId]);

  const startMatch = async () => {
    if (!subject || (questionCount > 0 && !topic)) return;
    setMatchError(null);
    setPhase("preparing");
    // Every match starts both leaderboards from zero.
    const freshArena = newArenaId();
    setArenaId(freshArena);
    setBoard(null);
    setRound(null);
    try {
      let quizId: string | null = null;
      let count = 0;
      if (questionCount > 0) {
        const prepared = await prepareLiveMatch({
          classroom_id: classroomId,
          subject: subject.subject,
          topic,
          form_level: form,
          language: lang === "ms" ? "Bahasa Melayu" : "English",
          count: questionCount,
        });
        quizId = prepared.quiz_id;
        count = prepared.count;
      }
      const steps: MatchStep[] = Array.from({ length: count }, (_, index) => ({ kind: "question" as const, index }));
      if (game !== "none") steps.push({ kind: "game" });
      if (steps.length === 0) throw new Error("Nothing to play — pick some questions or a game.");
      const m: Match = { arenaId: freshArena, quizId, subject: subject.subject, topic, game: game === "none" ? null : game, gameSeconds, steps };
      setMatch(m);
      setPaused(false);
      setPhase("running");
      await runStep(m, 0);
    } catch (e) {
      setMatchError(e instanceof Error ? e.message : "Couldn't prepare the match — try again.");
      setPhase("setup");
    }
  };

  // Between rounds: show the results, then start the next round by itself.
  useEffect(() => {
    if (phase !== "running" || !match || !roundEnded || paused || starting) return;
    const next = stepIdx + 1;
    if (next >= match.steps.length) {
      setPhase("done");
      setNextAt(null);
      return;
    }
    setNextAt(Date.now() + BETWEEN_ROUNDS_MS);
    const t = window.setTimeout(() => void runStep(match, next), BETWEEN_ROUNDS_MS);
    return () => window.clearTimeout(t);
  }, [phase, match, roundEnded, paused, starting, stepIdx, runStep]);

  useEffect(() => {
    if (!nextAt) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [nextAt]);

  const nextNow = () => {
    if (!match || (round && !roundEnded)) return;
    const next = stepIdx + 1;
    if (next >= match.steps.length) { setPhase("done"); return; }
    setPaused(false);
    void runStep(match, next);
  };

  const endMatch = async () => {
    if (round && !roundEnded) await finishRound();
    setNextAt(null);
    setPhase("done");
  };

  const questionTotal = match?.steps.filter((x) => x.kind === "question").length ?? 0;
  const currentStep = match?.steps[stepIdx];
  const upcomingStep = match?.steps[stepIdx + 1];
  const secondsToNext = nextAt ? Math.max(0, Math.ceil((nextAt - now) / 1000)) : null;

  const newMatch = () => {
    if (round && !roundEnded) return;
    if (!window.confirm("Start a new match? Both leaderboards reset to zero.")) return;
    setArenaId(newArenaId());
    setBoard(null);
    setRound(null);
    setMatch(null);
    setStepIdx(-1);
    setNextAt(null);
    setPhase("setup");
  };

  const close = async () => {
    if (round && !roundEnded) await finishRound();
    onClose();
  };

  const roundLive = !!round && !roundEnded;
  const opts = (round?.options ?? null) as Record<Letter, string> | null;
  const counts = LETTERS.map((l) => answers.filter((a) => a.answer === l).length);
  const maxCount = Math.max(1, ...counts);
  const fastest = answers
    .filter((a) => a.is_correct)
    .sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
    .slice(0, 3);

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[#0f0825] text-white">
      {/* Header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 px-5 py-3">
        <div className="flex items-center gap-2">
          <Radio className="h-5 w-5 text-red-400" />
          <span className="text-lg font-bold">Live Arena</span>
          <span className="text-white/50">· {classroomName}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={newMatch}
            disabled={roundLive || phase === "preparing"}
            className="flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/70 hover:bg-white/10 disabled:opacity-30"
          >
            <RotateCcw className="h-4 w-4" /> New match
          </button>
          <button onClick={() => void close()} className="rounded-lg p-1.5 text-white/50 hover:text-white" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="grid flex-1 gap-4 p-4 lg:grid-cols-[300px_1fr_340px]">
        {/* ── Join + lobby ── */}
        <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/50">Scan to join</p>
          {joinUrl ? (
            <div className="flex justify-center rounded-xl bg-white p-3">
              <QRCodeSVG value={joinUrl} size={220} level="M" />
            </div>
          ) : (
            <p className="text-sm text-white/40">This classroom has no invite code.</p>
          )}
          {joinCode && (
            <div className="text-center">
              <p className="text-xs text-white/50">
                Go to <span className="font-semibold text-white/80">{joinUrl.replace(/^https?:\/\//, "").replace(/\?.*$/, "")}</span>
                {pin ? " and enter the game PIN" : " and enter the class code"}
              </p>
              <p className="mt-1 font-mono text-4xl font-black tracking-[0.15em] text-amber-300">
                {pin ? `${pin.slice(0, 3)} ${pin.slice(3)}` : joinCode}
              </p>
            </div>
          )}
          <div className="border-t border-white/10 pt-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/50">
              <Users className="h-3.5 w-3.5" /> In the lobby ({lobby.length})
            </p>
            {lobby.length === 0 ? (
              <p className="text-sm text-white/30">Waiting for players…</p>
            ) : (
              <div className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto">
                {lobby.map((p) => (
                  <span key={p.id} className="rounded-full bg-violet-500/20 px-2.5 py-1 text-xs font-medium text-violet-100">
                    {p.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── Round stage ── */}
        <section className="min-w-0 space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          {match && phase !== "setup" && (
            <MatchProgress steps={match.steps} stepIdx={stepIdx} roundLive={roundLive} topic={match.topic} />
          )}

          {phase === "setup" && (
            <MatchSetup
              subjects={subjects}
              form={form}
              setForm={setForm}
              subjectLabel={subjectLabel}
              setSubjectLabel={(label) => {
                setSubjectLabel(label);
                setTopic(subjects.find((x) => x.display_label === label)?.topics?.[0] ?? "");
              }}
              topics={subject?.topics ?? []}
              topic={topic}
              setTopic={setTopic}
              lang={lang}
              setLang={setLang}
              questionCount={questionCount}
              setQuestionCount={setQuestionCount}
              game={game}
              setGame={setGame}
              gameSeconds={gameSeconds}
              setGameSeconds={setGameSeconds}
              players={lobby.length}
              error={matchError}
              onStart={() => void startMatch()}
            />
          )}

          {phase === "preparing" && (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Loader2 className="h-10 w-10 animate-spin text-violet-300" />
              <p className="text-2xl font-black">Preparing {questionCount} questions…</p>
              <p className="text-white/60">{subject?.subject} · {topic} · usually 15–40 seconds</p>
              <p className="text-sm text-white/40">Students can keep joining with the PIN while you wait.</p>
            </div>
          )}

          {(phase === "running" || phase === "done") && round && !roundEnded && (
            <LiveRoundStage
              round={round}
              left={left}
              answers={answers}
              scores={scores}
              lobbySize={lobby.length}
              ending={ending}
              onEnd={() => void finishRound()}
            />
          )}

          {(phase === "running" || phase === "done") && (!round || roundEnded) && (
            <>
              {round && roundEnded && (
                <RoundResult
                  round={round}
                  opts={opts}
                  counts={counts}
                  maxCount={maxCount}
                  correct={correct}
                  fastest={fastest}
                  scores={scores}
                  answered={answers.length}
                />
              )}

              {phase === "running" ? (
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs uppercase tracking-wider text-white/40">Up next</p>
                    <p className="text-lg font-bold">
                      {starting ? "Starting…" : stepLabel(upcomingStep, questionTotal)}
                      {!starting && !paused && secondsToNext !== null && (
                        <span className="text-white/50"> · in {secondsToNext}s</span>
                      )}
                      {paused && <span className="text-amber-300"> · paused</span>}
                    </p>
                    {matchError && <p className="text-xs text-red-300">{matchError}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPaused((p) => !p)}
                    disabled={starting}
                    className="flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-40"
                  >
                    {paused ? <><Play className="h-4 w-4" /> Resume</> : <><Pause className="h-4 w-4" /> Pause</>}
                  </button>
                  <button
                    type="button"
                    onClick={nextNow}
                    disabled={starting}
                    className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-bold disabled:opacity-40"
                  >
                    {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <SkipForward className="h-4 w-4" />} Next now
                  </button>
                  <button
                    type="button"
                    onClick={() => void endMatch()}
                    className="rounded-xl px-3 py-2 text-sm text-white/50 hover:bg-white/10 hover:text-white"
                  >
                    End match
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-amber-400/30 bg-amber-500/[0.06] p-6 text-center">
                  <Trophy className="h-10 w-10 text-amber-300" />
                  <p className="text-2xl font-black">Match complete!</p>
                  <p className="text-white/60">
                    {[board?.questions?.[0] && `Quiz champion: ${board.questions[0].name}`, board?.games?.[0] && `Game champion: ${board.games[0].name}`]
                      .filter(Boolean)
                      .join(" · ") || "Final standings are on the right."}
                  </p>
                  <button
                    type="button"
                    onClick={() => { setPhase("setup"); setMatch(null); setStepIdx(-1); }}
                    className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-bold hover:bg-violet-500"
                  >
                    <RotateCcw className="h-4 w-4" /> Set up another match
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {/* ── Standings ── */}
        <section className="space-y-4">
          <Board
            title="Question points"
            subtitle={`${board?.question_rounds ?? 0} rounds · correct + speed`}
            icon={<Brain className="h-4 w-4" />}
            accent="text-violet-200"
            rows={(board?.questions ?? []).map((r) => ({ id: r.student_id, name: r.name, points: r.points, extra: `${r.correct}/${r.answered}` }))}
          />
          <Board
            title="Game points"
            subtitle={`${board?.game_rounds ?? 0} rounds · best run per round`}
            icon={<Gamepad2 className="h-4 w-4" />}
            accent="text-amber-200"
            rows={(board?.games ?? []).map((r) => ({ id: r.student_id, name: r.name, points: r.points }))}
          />
        </section>
      </div>
    </div>
  );
}

function MatchSetup(props: {
  subjects: SubjectWithTopics[];
  form: number;
  setForm: (f: number) => void;
  subjectLabel: string;
  setSubjectLabel: (l: string) => void;
  topics: string[];
  topic: string;
  setTopic: (t: string) => void;
  lang: "ms" | "en";
  setLang: (l: "ms" | "en") => void;
  questionCount: number;
  setQuestionCount: (n: number) => void;
  game: string;
  setGame: (g: string) => void;
  gameSeconds: number;
  setGameSeconds: (s: number) => void;
  players: number;
  error: string | null;
  onStart: () => void;
}) {
  const p = props;
  const selectCls = "w-full rounded-xl border border-white/15 bg-[#1a0f3a] px-3 py-2 text-sm focus:border-violet-400/60 focus:outline-none";
  const chip = (on: boolean) =>
    `flex-1 rounded-lg border py-1.5 text-sm ${on ? "border-amber-400 bg-amber-500/20 font-bold" : "border-white/15 text-white/60 hover:bg-white/5"}`;
  const questionsOn = p.questionCount > 0;
  const minutes = Math.ceil(
    (p.questionCount * (QUESTION_SECONDS + BETWEEN_ROUNDS_MS / 1000) + (p.game !== "none" ? p.gameSeconds + BETWEEN_ROUNDS_MS / 1000 : 0)) / 60,
  );
  const canStart = !!p.subjectLabel && (!questionsOn || !!p.topic) && (questionsOn || p.game !== "none");
  return (
    <div className="space-y-4">
      <p className="text-2xl font-black">Set up the match</p>

      <div className="space-y-3 rounded-2xl border border-violet-400/30 bg-violet-500/[0.06] p-4">
        <p className="flex items-center gap-2 font-bold text-violet-200"><Brain className="h-5 w-5" /> Questions</p>
        <div className="grid gap-2 sm:grid-cols-[90px_1fr_90px]">
          <label className="space-y-1 text-xs text-white/50">
            Form
            <select value={p.form} onChange={(e) => p.setForm(Number(e.target.value))} className={selectCls}>
              {[1, 2, 3, 4, 5].map((f) => <option key={f} value={f}>Form {f}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs text-white/50">
            Subject
            <select value={p.subjectLabel} onChange={(e) => p.setSubjectLabel(e.target.value)} className={selectCls}>
              {p.subjects.length === 0 && <option value="">Loading…</option>}
              {p.subjects.map((x) => <option key={x.display_label} value={x.display_label}>{x.subject}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs text-white/50">
            Language
            <select value={p.lang} onChange={(e) => p.setLang(e.target.value as "ms" | "en")} className={selectCls}>
              <option value="ms">BM</option>
              <option value="en">English</option>
            </select>
          </label>
        </div>
        <label className="block space-y-1 text-xs text-white/50">
          Topic
          <select value={p.topic} onChange={(e) => p.setTopic(e.target.value)} className={selectCls} disabled={p.topics.length === 0}>
            {p.topics.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <div className="space-y-1 text-xs text-white/50">
          Number of questions ({QUESTION_SECONDS}s each)
          <div className="flex gap-2">
            {[0, ...QUESTION_COUNTS].map((n) => (
              <button key={n} type="button" onClick={() => p.setQuestionCount(n)} className={chip(p.questionCount === n)}>
                {n === 0 ? "None" : n}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-amber-400/30 bg-amber-500/[0.06] p-4">
        <p className="flex items-center gap-2 font-bold text-amber-200"><Gamepad2 className="h-5 w-5" /> Game battle (after the questions)</p>
        <div className="flex gap-2">
          {LIVE_GAMES.map((g) => (
            <button key={g.id} type="button" onClick={() => p.setGame(g.id)} className={chip(p.game === g.id)}>{g.label}</button>
          ))}
          <button type="button" onClick={() => p.setGame("none")} className={chip(p.game === "none")}>No game</button>
        </div>
        {p.game !== "none" && (
          <>
            <p className="text-sm text-white/60">{LIVE_GAMES.find((g) => g.id === p.game)?.blurb}</p>
            <div className="flex gap-2">
              {GAME_SECONDS.map((sec) => (
                <button key={sec} type="button" onClick={() => p.setGameSeconds(sec)} className={chip(p.gameSeconds === sec)}>{sec}s</button>
              ))}
            </div>
          </>
        )}
      </div>

      {p.error && <p className="text-sm text-red-300">{p.error}</p>}
      <button
        type="button"
        onClick={p.onStart}
        disabled={!canStart}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 py-4 text-lg font-black shadow-lg disabled:opacity-40"
      >
        <Play className="h-5 w-5" /> Start match
      </button>
      <p className="text-center text-xs text-white/40">
        {[questionsOn && `${p.questionCount} questions`, p.game !== "none" && `${p.gameSeconds}s ${LIVE_GAMES.find((g) => g.id === p.game)?.label.replace(/^\S+\s/, "")}`]
          .filter(Boolean)
          .join(" → ")}
        {canStart && ` · about ${minutes} min · ${p.players} player${p.players === 1 ? "" : "s"} in the lobby`}
      </p>
    </div>
  );
}

function MatchProgress({ steps, stepIdx, roundLive, topic }: { steps: MatchStep[]; stepIdx: number; roundLive: boolean; topic: string }) {
  const total = steps.filter((x) => x.kind === "question").length;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-white/80">{stepIdx >= 0 ? stepLabel(steps[stepIdx], total) : "Starting…"}</span>
        <span className="truncate text-white/40">{topic}</span>
      </div>
      <div className="flex gap-1">
        {steps.map((st, i) => (
          <div
            key={i}
            className={`h-2 flex-1 rounded-full ${
              i < stepIdx || (i === stepIdx && !roundLive)
                ? st.kind === "game" ? "bg-amber-400" : "bg-violet-400"
                : i === stepIdx
                  ? "animate-pulse bg-white"
                  : "bg-white/10"
            }`}
            title={stepLabel(st, total)}
          />
        ))}
      </div>
    </div>
  );
}

function Board({
  title,
  subtitle,
  icon,
  accent,
  rows,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  accent: string;
  rows: { id: string; name: string; points: number; extra?: string }[];
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className={`flex items-center gap-2 font-bold ${accent}`}>{icon} {title}</p>
      <p className="mb-3 text-xs text-white/40">{subtitle}</p>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-white/30">No scores yet</p>
      ) : (
        <div className="space-y-1">
          {rows.slice(0, 10).map((r, i) => (
            <div key={r.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${i < 3 ? "bg-white/[0.06]" : ""}`}>
              <span className="w-7 text-center text-sm">{rankBadge(i)}</span>
              <span className="flex-1 truncate text-sm font-medium">{r.name}</span>
              {r.extra && <span className="text-xs text-white/40">{r.extra}</span>}
              <span className="w-14 text-right font-bold tabular-nums text-amber-300">{r.points}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LiveRoundStage({
  round,
  left,
  answers,
  scores,
  lobbySize,
  ending,
  onEnd,
}: {
  round: LiveSession;
  left: number | null;
  answers: LiveAnswer[];
  scores: LiveGameScore[];
  lobbySize: number;
  ending: boolean;
  onEnd: () => void;
}) {
  const isGame = round.kind === "game";
  const opts = round.options as Record<Letter, string> | null;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 rounded-full bg-red-500/15 px-3 py-1 text-sm font-semibold text-red-300">
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-400" />
          {isGame ? "Game battle live" : "Question live"}
        </span>
        <span className={`flex items-center gap-2 text-5xl font-black tabular-nums ${left !== null && left <= 5 ? "text-red-400" : ""}`}>
          <Timer className="h-8 w-8" /> {left ?? "–"}
        </span>
      </div>

      {isGame ? (
        <>
          <p className="text-3xl font-black">🦕 Dino Run battle</p>
          <p className="text-white/60">Jump the cacti — tap the screen. Best run counts.</p>
          <div className="space-y-1.5">
            {scores.length === 0 ? (
              <p className="py-8 text-center text-white/30">Waiting for the first jumps…</p>
            ) : (
              scores.slice(0, 10).map((s, i) => (
                <div key={s.student_id} className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-2">
                  <span className="w-8 text-center text-lg">{rankBadge(i)}</span>
                  <span className="flex-1 truncate text-lg font-semibold">{s.student_name ?? "Student"}</span>
                  <span className="text-2xl font-black tabular-nums text-amber-300">{s.score}</span>
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        <>
          <p className="whitespace-pre-line text-2xl font-bold leading-snug">{round.question}</p>
          {opts && (
            <div className="grid gap-3 sm:grid-cols-2">
              {LETTERS.map((l) => (
                <div key={l} className={`flex items-start gap-3 rounded-2xl ${LETTER_BG[l]} px-4 py-3 text-lg font-semibold`}>
                  <span className="font-black">{l}</span>
                  <span>{opts[l]}</span>
                </div>
              ))}
            </div>
          )}
          <div>
            <p className="mb-2 text-sm text-white/60">
              <b className="text-2xl text-white">{answers.length}</b>
              {lobbySize > 0 ? ` / ${lobbySize}` : ""} answered
            </p>
            <div className="flex flex-wrap gap-1.5">
              {answers.map((a) => (
                <span key={a.student_id} className="rounded-full bg-white/10 px-2.5 py-1 text-xs">
                  {a.student_name ?? "Student"}
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      <button
        type="button"
        onClick={onEnd}
        disabled={ending}
        className="flex items-center gap-2 rounded-xl bg-red-600/80 px-4 py-2 text-sm font-bold hover:bg-red-600 disabled:opacity-40"
      >
        {ending ? <Loader2 className="h-4 w-4 animate-spin" /> : <StopCircle className="h-4 w-4" />}
        End round now
      </button>
    </div>
  );
}

function RoundResult({
  round,
  opts,
  counts,
  maxCount,
  correct,
  fastest,
  scores,
  answered,
}: {
  round: LiveSession;
  opts: Record<Letter, string> | null;
  counts: number[];
  maxCount: number;
  correct: string | null;
  fastest: LiveAnswer[];
  scores: LiveGameScore[];
  answered: number;
}) {
  if (round.kind === "game") {
    return (
      <div className="rounded-2xl border border-amber-400/30 bg-amber-500/[0.06] p-4">
        <p className="mb-3 font-bold text-amber-200">🏁 Dino Run results</p>
        {scores.length === 0 ? (
          <p className="text-sm text-white/40">Nobody scored this round.</p>
        ) : (
          <div className="flex flex-wrap items-end justify-center gap-3">
            {scores.slice(0, 3).map((s, i) => (
              <div key={s.student_id} className={`flex flex-col items-center rounded-xl bg-white/5 px-4 py-3 ${i === 0 ? "order-2 scale-110" : i === 1 ? "order-1" : "order-3"}`}>
                <span className="text-3xl">{rankBadge(i)}</span>
                <span className="max-w-[9rem] truncate font-semibold">{s.student_name ?? "Student"}</span>
                <span className="text-xl font-black text-amber-300">{s.score}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-3 rounded-2xl border border-violet-400/30 bg-violet-500/[0.06] p-4">
      <p className="line-clamp-3 whitespace-pre-line font-semibold leading-snug">{round.question}</p>
      <div className="space-y-1.5">
        {LETTERS.map((l, i) => (
          <div key={l} className="flex items-center gap-2 text-sm">
            <span className={`grid h-6 w-6 place-items-center rounded font-black ${correct === l ? "bg-green-500" : "bg-white/10"}`}>{l}</span>
            <div className="h-6 flex-1 overflow-hidden rounded bg-white/5">
              <div
                className={`flex h-full items-center px-2 text-xs ${correct === l ? "bg-green-500/60" : "bg-white/15"}`}
                style={{ width: `${Math.max(4, (counts[i] / maxCount) * 100)}%` }}
              >
                {counts[i]}
              </div>
            </div>
            <span className={`hidden w-1/3 truncate text-xs sm:block ${correct === l ? "font-bold text-green-300" : "text-white/50"}`}>{opts?.[l]}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-white/50">
        {answered} answered · {counts[LETTERS.indexOf((correct ?? "A") as Letter)] ?? 0} correct
      </p>
      {fastest.length > 0 && (
        <p className="text-sm">
          ⚡ Fastest: {fastest.map((a, i) => `${rankBadge(i)} ${a.student_name ?? "Student"} (+${a.points ?? 0})`).join("   ")}
        </p>
      )}
    </div>
  );
}
