// Live Arena load test: N simulated phones + one teacher projector screen,
// driven against the real public API and Supabase Realtime.
//
//   venv/bin/python scripts/arena_loadtest_setup.py setup /tmp/arena.json
//   API_PID=$(systemctl show -p MainPID --value kuasaprestij) \
//     node scripts/arena_loadtest.mjs 20 /tmp/arena.json /tmp/arena-results.json
//   venv/bin/python scripts/arena_loadtest_setup.py teardown /tmp/arena.json
//
// Each player does what the student app does: Quick Join -> sign in -> realtime
// round/presence channels -> /classroom_live/now every 5s -> answer questions /
// report Dino Run scores at most once a second. The teacher does what
// LiveQuizPanel does: polls the round every 1s and the scoreboard every 2s.
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire("/root/frontend/learn-play-shine-96/package.json");
const { createClient } = require("@supabase/supabase-js");

const env = Object.fromEntries(
  fs.readFileSync("/root/frontend/learn-play-shine-96/.env", "utf8").split("\n")
    .map((l) => l.match(/^(\w+)="?([^"]*)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]),
);
const API = process.env.API_URL || env.VITE_API_BASE_URL;  // API_URL=http://127.0.0.1:8011 to test a local build
const SB_URL = env.VITE_SUPABASE_URL;
const SB_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;

const N = Number(process.argv[2] || 20);
const cfg = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
const OUT = process.argv[4];
const CID = cfg.classroom_id;
const ARENA = randomUUID();
const GAME_SECONDS = 60;

const now = () => performance.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);

// ── metrics ──────────────────────────────────────────────────────────────
const http = {};            // endpoint -> [{ms, status, phase}]
const lat = {};             // metric -> [ms]
const counts = {};          // counter -> n
const realtimeIssues = [];  // {player, channel, status|message}
let phase = "setup";
const push = (k, v) => (lat[k] ??= []).push(v);
const inc = (k, n = 1) => (counts[k] = (counts[k] ?? 0) + n);

async function call(name, path, { method = "GET", body, token } = {}) {
  const t0 = now();
  let status = 0, json = null;
  try {
    const res = await fetch(API + path, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    status = res.status;
    json = await res.json().catch(() => null);
  } catch (e) {
    status = e.name === "TimeoutError" ? "timeout" : "neterr";
  }
  (http[name] ??= []).push({ ms: now() - t0, status, phase });
  return { status, json };
}

function newClient() {
  return createClient(SB_URL, SB_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function watch(p, ch, label) {
  ch.on("system", {}, (msg) => {
    if (msg?.status && msg.status !== "ok") realtimeIssues.push({ player: p.name, channel: label, message: msg.message ?? msg });
  });
  return (st, err) => {
    if (st === "SUBSCRIBED") p.subscribed.add(label);
    else if (st !== "CLOSED") realtimeIssues.push({ player: p.name, channel: label, status: st, err: err?.message });
  };
}

// API process CPU (only meaningful because the load generator runs on the same box)
const cpu = [];
const API_PID = process.env.API_PID;
let lastTicks = null;
const cpuTimer = API_PID && setInterval(() => {
  try {
    const f = fs.readFileSync(`/proc/${API_PID}/stat`, "utf8").split(") ")[1].split(" ");
    const ticks = Number(f[11]) + Number(f[12]);
    if (lastTicks !== null) cpu.push({ phase, pct: ticks - lastTicks });   // 100 ticks/s
    lastTicks = ticks;
  } catch { /* process gone */ }
}, 1000);

// ── round bookkeeping (shared across players: one process, one clock) ───
let startPressedAt = 0, endPressedAt = 0;
const sentAt = new Map();      // `${sid}:${student}:${score|answer}` -> time the player tapped/sent
const seenByTeacher = new Set();

// ── players ──────────────────────────────────────────────────────────────
const players = [];

async function joinPlayer(i) {
  const p = { i, name: `ZZ Bot ${String(i + 1).padStart(2, "0")}`, subscribed: new Set(), timers: [], leaving: false };
  await call("GET /quick_join/{code}", `/quick_join/${cfg.invite_code}`);
  const j = await call("POST /quick_join", "/quick_join", { method: "POST", body: { code: cfg.invite_code, name: p.name } });
  if (j.status !== 200) { inc("join failed"); return null; }

  p.sb = newClient();
  const t0 = now();
  // Same 429 retry as src/routes/join.tsx.
  let { data, error } = await p.sb.auth.signInWithPassword({ email: j.json.email, password: j.json.password });
  for (let attempt = 1; attempt <= 6 && error?.status === 429; attempt++) {
    inc("sign-in 429 (retried)");
    await new Promise((r) => setTimeout(r, 1000 * attempt + Math.random() * 1000));
    ({ data, error } = await p.sb.auth.signInWithPassword({ email: j.json.email, password: j.json.password }));
  }
  push("supabase sign-in", now() - t0);
  if (error) { inc(`sign-in failed: ${error.status ?? ""} ${error.message}`); return null; }
  p.id = data.user.id;
  p.token = data.session.access_token;
  p.sb.realtime.setAuth(p.token);

  const live = p.sb.channel(`student-live-${p.id}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "classroom_live_sessions" },
      ({ new: s }) => { if (s.classroom_id === CID && s.status === "active") openRound(p, s); });
  live.subscribe(watch(p, live, "student-live"));

  const pres = p.sb.channel(`arena-presence-${CID}`, { config: { presence: { key: p.id } } });
  pres.on("presence", { event: "sync" }, () => { p.lobby = Object.keys(pres.presenceState()).length; });
  const presStatus = watch(p, pres, "presence");
  pres.subscribe((st, err) => {
    presStatus(st, err);
    if (st === "SUBSCRIBED") void pres.track({ name: p.name, joined_at: Date.now() });
  });

  p.timers.push(setInterval(() => void call("GET /classroom_live/now", "/classroom_live/now", { token: p.token }), 5000));
  return p;
}

function openRound(p, s) {
  push(`round start -> phone sees it (${s.kind})`, now() - startPressedAt);
  const sid = s.id;
  const r = { sid, kind: s.kind, ended: false, chans: [] };
  p.round = r;

  const sessCh = p.sb.channel(`live-sess-${sid}-${p.i}`)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "classroom_live_sessions", filter: `id=eq.${sid}` },
      ({ new: row }) => { if (row.status === "complete" && !r.ended) closeRound(p, r); });
  sessCh.subscribe(watch(p, sessCh, "live-sess"));
  r.chans.push(sessCh);

  void call("GET /classroom_live/arena/{id}/scoreboard", `/classroom_live/arena/${ARENA}/scoreboard`, { token: p.token });

  if (s.kind === "game") {
    const gameCh = p.sb.channel(`live-game-${sid}-${p.i}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "classroom_game_scores", filter: `live_session_id=eq.${sid}` },
        ({ new: row }) => {
          if (!row?.student_id) return;
          inc("game score events received");
          const t = sentAt.get(`${sid}:${row.student_id}:${row.score}`);
          if (t) push("game score sent -> other phones see it", now() - t);
        });
    gameCh.subscribe(watch(p, gameCh, "live-game"));
    r.chans.push(gameCh);
    const t0 = now();
    void p.sb.from("classroom_game_scores").select("student_id,student_name,score").eq("live_session_id", sid)
      .order("score", { ascending: false }).then(() => push("phone loads game leaderboard (Supabase direct)", now() - t0));
    playDino(p, r);
  } else {
    const lbCh = p.sb.channel(`live-lb-${sid}-${p.i}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "classroom_live_answers", filter: `live_session_id=eq.${sid}` },
        ({ new: row }) => {
          inc("answer events received");
          const t = sentAt.get(`${sid}:${row.student_id}:answer`);
          if (t) push("answer tapped -> other phones see it", now() - t);
        });
    lbCh.subscribe(watch(p, lbCh, "live-lb"));
    r.chans.push(lbCh);
    const delay = currentBurst ? rand(3000, 3300) : rand(1500, 8000);
    setTimeout(async () => {
      if (r.ended) return;
      sentAt.set(`${sid}:${p.id}:answer`, now());
      const res = await call("POST /classroom_live/answer", "/classroom_live/answer", {
        method: "POST", token: p.token,
        body: { live_session_id: sid, student_id: p.id, student_name: p.name, answer: "ABCD"[Math.floor(Math.random() * 4)] },
      });
      if (res.status === 200) inc("answers accepted");
    }, delay);
  }
}

function playDino(p, r) {
  // One obstacle cleared every 1–2s; ~8% chance per obstacle of crashing (2s restart).
  let run = 0, best = 0, sent = 0;
  const step = () => {
    if (r.ended) return;
    if (Math.random() < 0.08) { run = 0; r.loop = setTimeout(step, 2000); return; }
    run += 1;
    best = Math.max(best, run);
    r.loop = setTimeout(step, rand(1000, 2000));
  };
  r.loop = setTimeout(step, rand(1000, 2000));
  const flush = () => {
    if (best <= sent) return;
    sent = best;
    sentAt.set(`${r.sid}:${p.id}:${best}`, now());
    inc("game scores sent");
    void call("POST /classroom_live/game_score", "/classroom_live/game_score", {
      method: "POST", token: p.token, body: { live_session_id: r.sid, student_id: p.id, student_name: p.name, score: best },
    });
  };
  r.flush = setInterval(flush, 1000);
  r.finalFlush = flush;
}

function closeRound(p, r, missed = false) {
  r.ended = true;
  if (!missed) push(`round end -> phone sees it (${r.kind})`, now() - endPressedAt);
  clearTimeout(r.loop);
  clearInterval(r.flush);
  r.finalFlush?.();
  if (r.kind !== "game") void call("GET /classroom_live/reveal/{id}", `/classroom_live/reveal/${r.sid}`, { token: p.token });
  void call("GET /classroom_live/arena/{id}/scoreboard", `/classroom_live/arena/${ARENA}/scoreboard`, { token: p.token });
  setTimeout(() => r.chans.forEach((c) => void p.sb.removeChannel(c)), 4000);
}

// ── teacher projector ────────────────────────────────────────────────────
let currentBurst = false;
const teacher = { name: "teacher", subscribed: new Set(), leaving: false };

async function teacherPollRound(sid) {
  const res = await call("GET /classroom_live/round/{id} (teacher 1s)", `/classroom_live/round/${sid}`, { token: teacher.token });
  const rows = res.json?.scores ?? res.json?.answers ?? [];
  for (const row of rows) {
    const key = `${sid}:${row.student_id}:${row.score ?? "answer"}`;
    if (seenByTeacher.has(key)) continue;
    seenByTeacher.add(key);
    const t = sentAt.get(key);
    if (t) push(row.score != null ? "game score sent -> projector shows it" : "answer tapped -> projector shows it", now() - t);
  }
  return rows.length;
}

async function runRound(kind) {
  phase = kind;
  startPressedAt = now();
  const res = kind === "game"
    ? await call("POST /classroom_live/start_game", "/classroom_live/start_game", {
        method: "POST", token: teacher.token, body: { classroom_id: CID, teacher_id: cfg.teacher_id, arena_id: ARENA, game: "dino", duration_s: GAME_SECONDS } })
    : await call("POST /classroom_live/start", "/classroom_live/start", {
        method: "POST", token: teacher.token, body: {
          classroom_id: CID, teacher_id: cfg.teacher_id, arena_id: ARENA, duration_s: 20,
          question: "Load test: 7 x 8 = ?", options: { A: "54", B: "56", C: "58", D: "64" }, correct_answer: "B",
        } });
  if (res.status !== 200) { console.log(`round start failed: ${res.status}`); return; }
  const sid = res.json.id;
  const limit = (kind === "game" ? GAME_SECONDS : 20) * 1000;
  const until = now() + limit;
  while (now() < until) {
    const n = await teacherPollRound(sid);
    if (kind !== "game" && n >= players.length) break;   // everyone answered
    await sleep(1000);
  }
  endPressedAt = now();
  await call("POST /classroom_live/end/{id}", `/classroom_live/end/${sid}`, { method: "POST", token: teacher.token });
  await sleep(2500);
  await teacherPollRound(sid);       // LiveQuizPanel's one extra read after the end
  await sleep(3500);
  for (const p of players) {
    if (p.round?.sid !== sid) inc(`${kind}: phones that never saw the round start`);
    else if (!p.round.ended) { inc(`${kind}: phones that never saw the round end`); closeRound(p, p.round, true); }
  }
}

// ── run ──────────────────────────────────────────────────────────────────
const t0 = Date.now();
console.log(`API ${API} · ${N} players · classroom ${CID}`);

teacher.sb = newClient();
const ts = await teacher.sb.auth.signInWithPassword({ email: cfg.teacher_email, password: cfg.teacher_password });
if (ts.error) throw ts.error;
teacher.token = ts.data.session.access_token;
teacher.sb.realtime.setAuth(ts.data.session.access_token);
const hostCh = teacher.sb.channel(`arena-presence-${CID}`, { config: { presence: { key: `host-${cfg.teacher_id}` } } });
hostCh.on("presence", { event: "sync" }, () => { teacher.lobby = Object.keys(hostCh.presenceState()).length - 1; });
const hostStatus = watch(teacher, hostCh, "presence");
hostCh.subscribe((st, err) => { hostStatus(st, err); if (st === "SUBSCRIBED") void hostCh.track({ name: "ZZ Load Test", host: true }); });
await call("POST /classroom_live/pin", "/classroom_live/pin", { method: "POST", token: teacher.token, body: { classroom_id: CID, teacher_id: cfg.teacher_id } });
const boardTimer = setInterval(() => void call("GET /classroom_live/arena/{id}/scoreboard (teacher 2s)", `/classroom_live/arena/${ARENA}/scoreboard`, { token: teacher.token }), 2000);

phase = "join";
console.log("joining (everyone scans the QR at once)…");
const joinStart = now();
const joined = (await Promise.all(Array.from({ length: N }, (_, i) => joinPlayer(i)))).filter(Boolean);
players.push(...joined);
const joinMs = now() - joinStart;

// wait for realtime subscriptions + lobby
const subDeadline = now() + 30_000;
while (now() < subDeadline && !(players.every((p) => p.subscribed.has("student-live") && p.subscribed.has("presence")) && teacher.lobby >= players.length)) await sleep(250);
const lobbyMs = now() - joinStart;
console.log(`${players.length}/${N} joined in ${(joinMs / 1000).toFixed(1)}s; teacher lobby shows ${teacher.lobby ?? 0} after ${(lobbyMs / 1000).toFixed(1)}s`);
await sleep(3000);

console.log("round 1: question, answers spread over 1.5–8s");
currentBurst = false;
await runRound("question");
console.log("round 2: question, everyone answers at the same moment");
currentBurst = true;
await runRound("question-burst");
console.log(`round 3: Dino Run, ${GAME_SECONDS}s`);
await runRound("game");

// ── teardown ─────────────────────────────────────────────────────────────
phase = "done";
clearInterval(boardTimer);
for (const p of players) { p.leaving = true; p.timers.forEach(clearInterval); }
teacher.leaving = true;
await Promise.all([...players, teacher].map((p) => p.sb.removeAllChannels().catch(() => {})));
if (cpuTimer) clearInterval(cpuTimer);

// ── report ───────────────────────────────────────────────────────────────
const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const f = (ms) => (ms == null ? "-" : ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`);
const lines = [];
const out = (s = "") => { lines.push(s); console.log(s); };

out(`\n=== Live Arena load test: ${players.length}/${N} players, ${((Date.now() - t0) / 1000).toFixed(0)}s ===`);
out(`join: ${players.length}/${N} in ${f(joinMs)}; teacher lobby shows ${teacher.lobby ?? 0} after ${f(lobbyMs)}`);
out(`\n-- API requests (${API}) --`);
out("endpoint".padEnd(52) + "n".padStart(5) + "  errors" + "     p50" + "     p95" + "     max");
for (const [k, v] of Object.entries(http)) {
  const ms = v.map((x) => x.ms);
  const errs = v.filter((x) => x.status !== 200);
  const errDesc = errs.length ? ` ${[...new Set(errs.map((e) => e.status))].join("/")}` : "";
  out(k.padEnd(52) + String(v.length).padStart(5) + String(errs.length + errDesc).padStart(8) + f(pct(ms, 0.5)).padStart(8) + f(pct(ms, 0.95)).padStart(8) + f(Math.max(...ms)).padStart(8));
}
out("\n-- What people see --");
out("metric".padEnd(52) + "n".padStart(5) + "     p50" + "     p95" + "     max");
for (const [k, v] of Object.entries(lat)) out(k.padEnd(52) + String(v.length).padStart(5) + f(pct(v, 0.5)).padStart(8) + f(pct(v, 0.95)).padStart(8) + f(Math.max(...v)).padStart(8));
out("\n-- Counters --");
for (const [k, v] of Object.entries(counts)) out(`${k}: ${v}`);
const sentScores = counts["game scores sent"] ?? 0;
out(`expected game score events (sent x ${players.length} phones): ${sentScores * players.length}`);
out(`\n-- Realtime issues: ${realtimeIssues.length} --`);
for (const x of realtimeIssues.slice(0, 15)) out(JSON.stringify(x));
if (cpu.length) {
  out("\n-- API process CPU (% of one core) --");
  for (const ph of [...new Set(cpu.map((c) => c.phase))]) {
    const v = cpu.filter((c) => c.phase === ph).map((c) => c.pct);
    out(`${ph.padEnd(16)} avg ${Math.round(v.reduce((a, b) => a + b, 0) / v.length)}%  max ${Math.max(...v)}%`);
  }
}
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ N, joined: players.length, http, lat, counts, realtimeIssues, cpu, report: lines }, null, 1));
process.exit(0);
