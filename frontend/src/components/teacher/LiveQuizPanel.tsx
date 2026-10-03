import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Brain,
  Eye,
  EyeOff,
  Gamepad2,
  Loader2,
  Radio,
  RotateCcw,
  StopCircle,
  Timer,
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
  startSession,
  type ArenaScoreboard,
  type LiveAnswer,
  type LiveGameScore,
  type LiveSession,
  fetchSessionChallenge,
  openArenaPin,
  type SessionResponse,
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

  // Round setup
  const [topic, setTopic] = useState("");
  const [lang, setLang] = useState<"ms" | "en">("ms");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [draft, setDraft] = useState<SessionResponse | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [draftKey, setDraftKey] = useState<string | null>(null);
  const [gameSeconds, setGameSeconds] = useState(60);
  const [starting, setStarting] = useState(false);

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

  const generate = async () => {
    if (!topic.trim()) return;
    setGenerating(true);
    setGenError(null);
    setShowKey(false);
    try {
      const sess = await startSession(
        teacherId,
        topic.trim(),
        "KSSM",
        lang === "ms" ? "Bahasa Melayu" : "English",
        classroomSubject && classroomSubject !== "All" ? classroomSubject : "Additional Mathematics",
        undefined,
        false,
        "mcq",
        4,
      );
      if (!sess.question || !sess.options?.A || !sess.session_id) throw new Error("incomplete");
      setDraft(sess);
      setDraftKey(null);
      // The key never comes with the question; fetch it separately for "Peek answer".
      void fetchSessionChallenge(sess.session_id).then(setDraftKey);
    } catch {
      setGenError("Couldn't get a question for that topic — try again or pick another topic.");
    } finally {
      setGenerating(false);
    }
  };

  const broadcastQuestion = async () => {
    if (!draft) return;
    setStarting(true);
    try {
      const live = await startLiveSession({
        classroom_id: classroomId,
        teacher_id: teacherId,
        source_session_id: draft.session_id,
        question_type: "mcq",
        subject: draft.subject ?? classroomSubject ?? undefined,
        topic: draft.topic ?? topic,
        object_lesson: draft.object_lesson ?? undefined,
        arena_id: arenaId,
        duration_s: QUESTION_SECONDS,
      });
      setDraft(null);
      beginRound(live);
    } catch {
      setGenError("Couldn't broadcast — check the connection and try again.");
    } finally {
      setStarting(false);
    }
  };

  const startGame = async () => {
    setStarting(true);
    try {
      const live = await startLiveGame({
        classroom_id: classroomId,
        teacher_id: teacherId,
        arena_id: arenaId,
        game: "dino",
        duration_s: gameSeconds,
      });
      beginRound(live);
    } catch {
      setGenError("Couldn't start the game round — try again.");
    } finally {
      setStarting(false);
    }
  };

  const newMatch = () => {
    if (round && !roundEnded) return;
    if (!window.confirm("Start a new match? Both leaderboards reset to zero.")) return;
    setArenaId(newArenaId());
    setBoard(null);
    setRound(null);
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
            disabled={roundLive}
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
          {!round || roundEnded ? (
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

              <div className="grid gap-4 md:grid-cols-2">
                {/* Question round */}
                <div className="space-y-3 rounded-2xl border border-violet-400/30 bg-violet-500/[0.06] p-4">
                  <p className="flex items-center gap-2 font-bold text-violet-200">
                    <Brain className="h-5 w-5" /> {round ? "Next question" : "Question round"}
                  </p>
                  <div className="flex gap-2">
                    <input
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") void generate(); }}
                      placeholder="Topic, e.g. Fungsi Kuadratik"
                      className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm placeholder-white/30 focus:border-violet-400/60 focus:outline-none"
                    />
                    <select
                      value={lang}
                      onChange={(e) => setLang(e.target.value as "ms" | "en")}
                      className="rounded-xl border border-white/15 bg-[#1a0f3a] px-2 text-sm"
                    >
                      <option value="ms">BM</option>
                      <option value="en">EN</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => void generate()}
                    disabled={!topic.trim() || generating}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-2.5 text-sm font-bold hover:bg-violet-500 disabled:opacity-40"
                  >
                    {generating ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</> : draft ? "Generate another" : "Generate question"}
                  </button>
                  {draft && (
                    <div className="space-y-2 rounded-xl bg-black/20 p-3">
                      {draft.stimulus && draft.stimulus !== "None" && (
                        <p className="whitespace-pre-line text-xs text-white/60">{draft.stimulus}</p>
                      )}
                      <p className="text-sm font-semibold leading-snug">{draft.question}</p>
                      <div className="grid grid-cols-1 gap-1">
                        {LETTERS.map((l) => (
                          <p
                            key={l}
                            className={`rounded-lg px-2 py-1 text-xs ${showKey && draftKey && draft.options?.[l] === draftKey ? "bg-green-500/25 text-green-100" : "bg-white/5 text-white/80"}`}
                          >
                            <b>{l}.</b> {draft.options?.[l]}
                          </p>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShowKey((v) => !v)}
                          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-white/50 hover:bg-white/10"
                          title="The answer is hidden by default because this screen is usually projected"
                        >
                          {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          {showKey ? "Hide answer" : "Peek answer"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void broadcastQuestion()}
                          disabled={starting}
                          className="ml-auto flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-bold disabled:opacity-40"
                        >
                          {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}
                          Broadcast ({QUESTION_SECONDS}s)
                        </button>
                      </div>
                    </div>
                  )}
                  {genError && <p className="text-xs text-red-300">{genError}</p>}
                </div>

                {/* Game round */}
                <div className="space-y-3 rounded-2xl border border-amber-400/30 bg-amber-500/[0.06] p-4">
                  <p className="flex items-center gap-2 font-bold text-amber-200">
                    <Gamepad2 className="h-5 w-5" /> Game battle
                  </p>
                  <p className="text-sm text-white/60">
                    🦕 <b>Dino Run</b>: everyone plays at once. Best run in the time limit wins. Tap to jump.
                  </p>
                  <div className="flex gap-2">
                    {[30, 60, 90].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setGameSeconds(s)}
                        className={`flex-1 rounded-lg border py-1.5 text-sm ${gameSeconds === s ? "border-amber-400 bg-amber-500/20 font-bold" : "border-white/15 text-white/60"}`}
                      >
                        {s}s
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => void startGame()}
                    disabled={starting}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-2.5 text-sm font-bold disabled:opacity-40"
                  >
                    {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gamepad2 className="h-4 w-4" />}
                    Start Dino Run battle
                  </button>
                </div>
              </div>
            </>
          ) : (
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
