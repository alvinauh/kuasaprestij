import { useEffect, useRef, useState } from "react";
import { startSession, submitAnswer, fetchSessionChallenge, type QuestionType } from "@/services/api";
import { buildChallengeFrom } from "@/lib/challenge";
import type { GameChallenge } from "./CatchStarsGame";
import { acquireKaplay, parkKaplay } from "./kaplay";

const SCENE = "play-mode";
const CANVAS_CLASS =
  "w-full max-w-[360px] rounded-2xl border border-white/20 touch-none shadow-2xl";

/**
 * Play mode — the learn-through-play loop. A continuous Flappy run where each
 * obstacle IS a real question: fly through the gate with the correct answer to
 * advance, fly through a wrong one to lose a life AND get a one-line "why"
 * (the teaching moment). Every gate is submitted to /submit_answer, so playing
 * updates real mastery + event logs exactly like the button-MCQ feed.
 *
 * The question buffer is filled by reusing start_session (adaptive) — no backend
 * change. A later phase can swap in a /game_batch endpoint for one-shot fills.
 */

type Letter = "A" | "B" | "C" | "D";

const W = 360;
const H = 480;
const LIVES = 3;
const BUFFER_TARGET = 4; // keep this many questions queued ahead

const SPEED = 118;
const GRAVITY = 1500;
const FLAP = 430;
const PIPE_W = 74;
const BIRD_X = 82;
const GAP_H = 116;
const TOP_GAP_C = 132;
const BOT_GAP_C = 348;

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

interface Props {
  studentId: string;
  topic: string;
  subject: string;
  apiLang: string;
  lang: string;
  formLevel: number;
  questionType: QuestionType;
  /** Bubble each resolved question up to the feed HUD (score / streak / mastery). */
  onResult: (r: { correct: boolean; points: number; mastery?: number | null }) => void;
  onExit: () => void;
}

function isRateLimited(q: string | undefined): boolean {
  const s = q ?? "";
  return s.includes("API Rate Limit") || !s.trim();
}

export function PlayModeGame({
  studentId, topic, subject, apiLang, lang, formLevel, questionType, onResult, onExit,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const queueRef = useRef<GameChallenge[]>([]);
  const prefetchingRef = useRef(false);
  const resumeRef = useRef<(() => void) | null>(null);

  const [ready, setReady] = useState(false);
  const [lives, setLives] = useState(LIVES);
  const [answered, setAnswered] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [teach, setTeach] = useState<{ challenge: GameChallenge; chosen: Letter } | null>(null);
  const [over, setOver] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [runId, setRunId] = useState(0); // bump to restart the game loop from scratch

  const restart = () => {
    resumeRef.current = null;
    setLives(LIVES); setAnswered(0); setCorrect(0);
    setTeach(null); setOver(false); setBuffering(true);
    void refill();
    setRunId((n) => n + 1);
  };

  // ---- question buffer (reuses start_session + session_challenge) ----
  const refill = async () => {
    if (prefetchingRef.current) return;
    prefetchingRef.current = true;
    try {
      let guard = 0;
      while (queueRef.current.length < BUFFER_TARGET && guard < BUFFER_TARGET * 2) {
        guard++;
        const s = await startSession(studentId, topic, "KSSM", apiLang, subject, undefined, true, questionType, formLevel);
        if (isRateLimited(s.question) || !s.session_id) continue;
        const correctRaw = await fetchSessionChallenge(s.session_id);
        const ch = buildChallengeFrom(s.question, s.options, correctRaw, "mcq", {
          sessionId: s.session_id,
          explanation: s.illustrative_notes || undefined,
          topic: s.topic ?? topic,
          subject: s.subject ?? subject,
        });
        if (ch) {
          queueRef.current.push(ch);
          setBuffering(false);
        }
      }
    } catch {
      /* leave the queue as-is; the game loop retries when it needs one */
    } finally {
      prefetchingRef.current = false;
    }
  };

  // Submit a resolved gate as a real assessment attempt.
  const submitGate = (challenge: GameChallenge, chosen: Letter) => {
    const answerText = challenge.options[chosen] ?? chosen;
    void submitAnswer(
      studentId, challenge.topic ?? topic, "", answerText, {}, undefined,
      apiLang, challenge.subject ?? subject, challenge.sessionId,
    )
      .then((res) => {
        onResult({
          correct: res.is_correct ?? res.correct ?? (chosen === challenge.correctLetter),
          points: res.points_awarded ?? 0,
          mastery: res.mastery_score ?? null,
        });
      })
      .catch(() => {
        // Network failed — still credit the local outcome so the run feels responsive.
        onResult({ correct: chosen === challenge.correctLetter, points: 0, mastery: null });
      });
  };

  useEffect(() => {
    void refill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- game loop ----
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let cleanup = () => {};

    void (async () => {
      const { k, canvas } = await acquireKaplay();
      if (disposed) return;
      canvas.className = CANVAS_CLASS;
      container.appendChild(canvas);
      setReady(true);

      // Build inside a scene so parkKaplay() (on unmount) tears down objects,
      // timers, and input handlers without re-initialising Kaplay — which
      // would corrupt the shared font atlas and blank the answer text.
      k.scene(SCENE, () => {
      // soft pastel sky base (repainted per-scene since we share one engine)
      k.add([k.rect(W, H), k.pos(0, 0), k.color(186, 230, 253), k.z(-40)]);
      k.setGravity(0);

      let livesLeft = LIVES;
      let answeredCount = 0;
      let correctCount = 0;
      let gameOver = false;
      let started = false;
      let paused = false; // frozen during a teaching moment
      let invulnUntil = 0;
      let spawner: { cancel: () => void } | null = null;
      let current: GameChallenge | null = null; // question the live obstacle presents

      // ---- soft sky backdrop: sun, fluffy clouds, rolling hills ----
      // gentle top-to-horizon wash
      k.add([k.rect(W, H * 0.55), k.pos(0, 0), k.color(203, 238, 255), k.opacity(0.6), k.z(-30)]);
      // sun with a soft halo
      k.add([k.circle(46), k.pos(W - 58, 66), k.color(255, 241, 178), k.opacity(0.5), k.z(-24)]);
      k.add([k.circle(30), k.pos(W - 58, 66), k.color(255, 236, 150), k.z(-23)]);

      // a fluffy cloud = a few overlapping soft circles that drift + wrap
      const addCloud = (x: number, y: number, s: number, depth: number) => {
        const cloud = k.add([k.pos(x, y), k.z(-20), k.opacity(0.9)]);
        const puff = (dx: number, dy: number, r: number) =>
          cloud.add([k.circle(r), k.pos(dx, dy), k.color(255, 255, 255), k.opacity(0.95), k.anchor("center")]);
        puff(0, 0, 18 * s); puff(20 * s, 6 * s, 14 * s); puff(-20 * s, 6 * s, 13 * s); puff(4 * s, -8 * s, 13 * s);
        cloud.onUpdate(() => {
          if (paused) return;
          cloud.pos.x -= SPEED * depth * 0.35 * k.dt();
          if (cloud.pos.x < -60 * s) cloud.pos.x = W + 60 * s;
        });
      };
      addCloud(70, 70, 1, 0.5);
      addCloud(240, 120, 0.75, 0.35);
      addCloud(160, 40, 0.6, 0.28);

      // rolling hills along the bottom (two parallax bands)
      const addHill = (cx: number, r: number, color: [number, number, number], depth: number, y: number) => {
        const hill = k.add([k.circle(r), k.pos(cx, y), k.color(...color), k.anchor("center"), k.z(-15 + depth)]);
        hill.onUpdate(() => {
          if (paused) return;
          hill.pos.x -= SPEED * depth * 0.5 * k.dt();
          if (hill.pos.x < -r) hill.pos.x = W + r;
        });
      };
      addHill(60, 120, [167, 217, 130], 0.4, H + 40);
      addHill(260, 140, [167, 217, 130], 0.4, H + 50);
      addHill(160, 90, [134, 199, 106], 0.7, H + 30);
      // solid grass strip at the very bottom
      k.add([k.rect(W, 26), k.pos(0, H - 26), k.color(126, 194, 96), k.z(-12)]);

      // ---- cute mascot bird (compound: body + wing + eye + beak + cheek) ----
      const bird = k.add([
        k.circle(16), k.pos(BIRD_X, H / 2), k.color(255, 209, 71),
        k.outline(3, k.rgb(230, 160, 30)), k.area({ scale: 0.8 }),
        k.body({ jumpForce: FLAP }), k.anchor("center"), k.rotate(0), k.scale(1), k.opacity(1), k.z(10), "bird",
      ]);
      // belly highlight
      bird.add([k.circle(9), k.pos(-2, 4), k.color(255, 235, 170), k.anchor("center"), k.opacity(0.9)]);
      // rosy cheek
      bird.add([k.circle(4), k.pos(6, 4), k.color(255, 158, 158), k.anchor("center"), k.opacity(0.85)]);
      // eye white + pupil
      bird.add([k.circle(6), k.pos(6, -4), k.color(255, 255, 255), k.anchor("center"), k.outline(1.5, k.rgb(120, 90, 20))]);
      bird.add([k.circle(2.6), k.pos(7.5, -4), k.color(40, 30, 15), k.anchor("center")]);
      // beak (little orange triangle)
      bird.add([k.polygon([k.vec2(0, -4), k.vec2(11, 0), k.vec2(0, 4)]), k.pos(14, 0), k.color(255, 149, 60), k.outline(1.5, k.rgb(214, 110, 20))]);
      // flapping wing (rotates on each flap)
      const wing = bird.add([k.circle(7), k.pos(-6, 2), k.color(255, 190, 40), k.outline(1.5, k.rgb(230, 160, 30)), k.anchor("center"), k.rotate(0)]);

      let trailAcc = 0;
      let squash = 0; // decays each frame; drives the squash-stretch
      bird.onUpdate(() => {
        const vy = bird.vel?.y ?? 0;
        bird.angle = Math.max(-24, Math.min(60, vy * 0.05));
        // ease wing back to rest
        wing.angle += (0 - wing.angle) * Math.min(1, k.dt() * 12);
        // squash-stretch relaxes back to round
        squash += (0 - squash) * Math.min(1, k.dt() * 10);
        bird.scale = k.vec2(1 + squash, 1 - squash);
        // soft motion trail while flying
        if (started && !paused && !gameOver) {
          trailAcc += k.dt();
          if (trailAcc > 0.05) {
            trailAcc = 0;
            const puff = k.add([
              k.circle(7), k.pos(bird.pos.x - 10, bird.pos.y),
              k.color(255, 224, 130), k.opacity(0.5), k.anchor("center"), k.scale(1), k.z(9),
            ]);
            puff.onUpdate(() => {
              puff.opacity -= k.dt() * 1.6;
              puff.scale = k.vec2((puff.scale?.x ?? 1) * (1 - k.dt() * 1.2));
              if (puff.opacity <= 0) puff.destroy();
            });
          }
        }
      });

      const startHint = k.add([
        k.text("Tap / Space\nto start 🐤", { size: 20, align: "center" }),
        k.pos(W / 2, H * 0.36), k.color(60, 70, 90),
        k.outline(3, k.rgb(255, 255, 255)), k.opacity(0.95), k.anchor("center"), k.z(20),
      ]);

      const flap = () => {
        if (gameOver || paused) return;
        if (!started) {
          started = true;
          k.setGravity(GRAVITY);
          startHint.destroy();
          spawner = k.loop(2.6, trySpawn);
        }
        bird.jump(FLAP);
        wing.angle = -55; // snap wing up; onUpdate eases it back
        squash = 0.18;    // little stretch on the upbeat
      };
      k.onKeyPress("space", flap);
      k.onMousePress(flap);
      k.onTouchStart(flap);

      const finish = () => {
        if (gameOver) return;
        gameOver = true;
        spawner?.cancel();
        k.wait(0.5, () => { if (!disposed) setOver(true); });
      };

      const loseLife = () => {
        if (k.time() < invulnUntil || gameOver || paused) return;
        livesLeft -= 1;
        setLives(livesLeft);
        invulnUntil = k.time() + 1;
        k.shake(9);
        bird.pos.x = BIRD_X; bird.pos.y = H / 2;
        if (bird.vel) bird.vel.y = 0;
        let blinks = 6;
        const t = k.loop(0.12, () => {
          bird.opacity = bird.opacity === 1 ? 0.3 : 1;
          if (--blinks <= 0) { bird.opacity = 1; t.cancel(); }
        });
        if (livesLeft <= 0) finish();
      };

      // Freeze the world and show the "why" overlay, then resume on Continue.
      const teachThenResume = (challenge: GameChallenge, chosen: Letter) => {
        paused = true;
        k.setGravity(0);
        if (bird.vel) bird.vel.y = 0;
        setTeach({ challenge, chosen });
        resumeRef.current = () => {
          setTeach(null);
          resumeRef.current = null;
          if (gameOver || disposed) return;
          paused = false;
          k.setGravity(GRAVITY);
        };
      };

      // Confetti burst + "+1" pop when the player nails the correct gate.
      const celebrate = (x: number, y: number) => {
        const colors: [number, number, number][] = [
          [255, 205, 90], [134, 199, 106], [96, 165, 250], [244, 114, 182], [255, 255, 255],
        ];
        for (let i = 0; i < 16; i++) {
          const ang = (Math.PI * 2 * i) / 16 + Math.random();
          const spd = 120 + Math.random() * 140;
          let vx = Math.cos(ang) * spd;
          let vy = Math.sin(ang) * spd;
          const bit = k.add([
            k.rect(6, 6, { radius: 2 }), k.pos(x, y), k.color(...colors[i % colors.length]),
            k.anchor("center"), k.rotate(Math.random() * 360), k.opacity(1), k.z(15),
          ]);
          bit.onUpdate(() => {
            vy += 480 * k.dt();
            bit.pos.x += vx * k.dt();
            bit.pos.y += vy * k.dt();
            bit.angle += 300 * k.dt();
            bit.opacity -= k.dt() * 1.3;
            if (bit.opacity <= 0) bit.destroy();
          });
        }
        const pop = k.add([
          k.text("+1", { size: 26 }), k.pos(x, y - 10), k.color(46, 160, 67),
          k.outline(3, k.rgb(255, 255, 255)), k.anchor("center"), k.opacity(1), k.z(16),
        ]);
        pop.onUpdate(() => {
          pop.pos.y -= 40 * k.dt();
          pop.opacity -= k.dt() * 1.1;
          if (pop.opacity <= 0) pop.destroy();
        });
      };

      // ---- obstacle building (two gaps: correct + one distractor) ----
      const gapPill = (parent: ReturnType<typeof k.add>, cx: number, cy: number, letter: Letter, text: string) => {
        // soft drop shadow
        parent.add([
          k.rect(136, 36, { radius: 12 }), k.pos(cx, cy + 3), k.color(30, 41, 59),
          k.opacity(0.16), k.anchor("center"), k.z(5),
        ]);
        // cream card
        const card = parent.add([
          k.rect(136, 36, { radius: 12 }), k.pos(cx, cy), k.color(255, 251, 235),
          k.outline(2, k.rgb(245, 210, 130)), k.anchor("center"), k.z(6),
        ]);
        // letter badge (neutral amber — never reveals which gate is correct)
        card.add([k.circle(12), k.pos(-50, 0), k.color(255, 205, 90), k.outline(2, k.rgb(235, 170, 40)), k.anchor("center")]);
        card.add([k.text(letter, { size: 15 }), k.pos(-50, 0), k.color(90, 60, 10), k.anchor("center")]);
        // answer text
        card.add([
          k.text(truncate(text, 12), { size: 14, align: "left" }),
          k.color(30, 41, 59), k.anchor("left"), k.pos(-34, 0),
        ]);
      };
      const pipeSeg = (parent: ReturnType<typeof k.add>, y: number, h: number) => {
        if (h <= 0) return;
        // soft rounded body (collision lives here)
        parent.add([
          k.rect(PIPE_W, h, { radius: 12 }), k.pos(0, y), k.color(122, 199, 106),
          k.outline(3, k.rgb(95, 168, 82)), k.area(), k.anchor("topleft"), "pipe",
        ]);
        // glossy highlight stripe (decorative, no collision)
        parent.add([
          k.rect(10, Math.max(0, h - 16), { radius: 6 }), k.pos(10, y + 8),
          k.color(180, 226, 160), k.opacity(0.7), k.anchor("topleft"),
        ]);
      };
      const gapSensor = (
        parent: ReturnType<typeof k.add>, cy: number, isCorrect: boolean, letter: Letter,
      ) => {
        parent.add([
          k.rect(PIPE_W, GAP_H), k.pos(0, cy - GAP_H / 2), k.area(), k.opacity(0),
          k.anchor("topleft"), { isCorrect, letter }, "gap",
        ]);
      };

      const trySpawn = () => {
        if (gameOver || paused) return;
        const next = queueRef.current.shift();
        if (queueRef.current.length < BUFFER_TARGET) void refill();
        if (!next) {
          // Buffer empty — wait briefly for a prefetch to land, then retry.
          setBuffering(true);
          k.wait(0.6, trySpawn);
          return;
        }
        setBuffering(false);
        current = next;

        const letters = (["A", "B", "C", "D"] as Letter[]).filter((l) => next.options[l]);
        const correctL = next.correctLetter;
        const distractors = letters.filter((l) => l !== correctL);
        const distractor = distractors.length ? distractors[Math.floor(k.time()) % distractors.length] : correctL;

        const obst = k.add([k.pos(W + PIPE_W, 0), { resolved: false }, "obstacle"]);
        pipeSeg(obst, 0, TOP_GAP_C - GAP_H / 2);
        pipeSeg(obst, TOP_GAP_C + GAP_H / 2, BOT_GAP_C - GAP_H / 2 - (TOP_GAP_C + GAP_H / 2));
        pipeSeg(obst, BOT_GAP_C + GAP_H / 2, H - (BOT_GAP_C + GAP_H / 2));

        const correctOnTop = k.time() % 1 < 0.5;
        const topLetter = correctOnTop ? correctL : distractor;
        const botLetter = correctOnTop ? distractor : correctL;
        gapPill(obst, PIPE_W / 2, TOP_GAP_C, topLetter, next.options[topLetter] ?? "");
        gapPill(obst, PIPE_W / 2, BOT_GAP_C, botLetter, next.options[botLetter] ?? "");
        gapSensor(obst, TOP_GAP_C, correctOnTop, topLetter);
        gapSensor(obst, BOT_GAP_C, !correctOnTop, botLetter);

        obst.onUpdate(() => {
          if (paused) return;
          obst.pos.x -= SPEED * k.dt();
          if (obst.pos.x < -PIPE_W - 140) obst.destroy();
        });
      };

      // ---- collisions ----
      bird.onCollide("pipe", (p) => {
        const o = (p as unknown as { parent?: { resolved: boolean } }).parent;
        if (o?.resolved || paused) return;
        if (o) o.resolved = true;
        loseLife();
      });

      bird.onCollide("gap", (g) => {
        const gap = g as unknown as { isCorrect: boolean; letter: Letter; parent?: { resolved: boolean } };
        const o = gap.parent;
        if (o?.resolved || paused) return;
        if (o) o.resolved = true;
        const challenge = current;
        if (!challenge) return;

        answeredCount += 1;
        setAnswered(answeredCount);
        submitGate(challenge, gap.letter);

        if (gap.isCorrect) {
          correctCount += 1;
          setCorrect(correctCount);
          k.shake(3);
          squash = 0.22; // happy bounce
          celebrate(bird.pos.x + 20, bird.pos.y);
        } else {
          teachThenResume(challenge, gap.letter);
          loseLife();
        }
      });

      bird.onUpdate(() => {
        if (gameOver || !started || paused) return;
        if (bird.pos.y < 8 || bird.pos.y > H - 8) loseLife();
      });

      });
      k.go(SCENE);

      cleanup = () => {
        parkKaplay();
        if (canvas.parentElement === container) container.removeChild(canvas);
      };
    })();

    return () => { disposed = true; cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const t = (ms: string, en: string) => (lang === "ms" ? ms : en);

  return (
    <div className="relative flex w-full max-w-[360px] flex-col items-center gap-2">
      <div className="flex w-full items-center justify-between text-sm font-bold text-white">
        <span>✅ {correct}/{answered}</span>
        <span className="text-rose-300">{"❤".repeat(lives)}{"·".repeat(LIVES - lives)}</span>
        <span className="text-white/50 text-xs">
          {ready ? (buffering ? t("memuat…", "loading…") : t("ketuk", "tap")) : t("memuat…", "loading…")}
        </span>
      </div>

      <div ref={containerRef} className="w-full max-w-[360px] leading-[0]" />

      {/* Teaching moment — shown when the player flies through a wrong answer. */}
      {teach && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-2xl bg-black/85 p-4 text-center backdrop-blur-sm">
          <p className="text-sm font-bold text-rose-300">{t("Belum tepat", "Not quite")}</p>
          <p className="text-[13px] text-white/80 line-clamp-3">{teach.challenge.question}</p>
          <p className="text-sm font-semibold text-emerald-300">
            {t("Jawapan betul", "Correct answer")}: {teach.challenge.correctLetter}. {teach.challenge.options[teach.challenge.correctLetter]}
          </p>
          {teach.challenge.explanation && (
            <p className="text-[13px] text-white/70 line-clamp-4">{teach.challenge.explanation}</p>
          )}
          <button
            onClick={() => resumeRef.current?.()}
            className="mt-1 rounded-full bg-emerald-500 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-400"
          >
            {t("Teruskan ▶", "Continue ▶")}
          </button>
        </div>
      )}

      {/* End-of-run summary. */}
      {over && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 rounded-2xl bg-black/90 p-4 text-center backdrop-blur-sm">
          <p className="text-lg font-extrabold text-white">{t("Tamat!", "Run over!")}</p>
          <p className="text-sm text-white/80">
            {t("Betul", "Correct")}: <span className="font-bold text-emerald-300">{correct}</span> / {answered}
          </p>
          <div className="flex gap-2">
            <button
              onClick={restart}
              className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-400"
            >
              {t("Main lagi", "Play again")}
            </button>
            <button
              onClick={onExit}
              className="rounded-full bg-white/10 px-5 py-2 text-sm font-bold text-white/80 hover:bg-white/20"
            >
              {t("Kembali", "Back")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
