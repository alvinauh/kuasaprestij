import { useEffect, useRef, useState } from "react";
import type { GameChallenge } from "./CatchStarsGame";
import { acquireKaplay, parkKaplay } from "./kaplay";

const SCENE = "answer-flappy";
const CANVAS_CLASS =
  "w-full max-w-[360px] rounded-2xl border border-white/20 touch-none shadow-2xl";

interface Props {
  onGameEnd: (won: boolean) => void;
  /** Assessment-integrated: steer through the gate labelled with the correct answer. */
  challenge?: GameChallenge | null;
}

const W = 360;
const H = 480;
const GOAL = 3; // correct gates to win
const LIVES = 3;

const SPEED = 95; // px/s the world scrolls left
const FOLLOW = 0.22; // how quickly the bird eases toward your finger/cursor
const PIPE_W = 74;
const BIRD_X = 82;

// Fixed two-gap layout so the student reads answers rather than dodging geometry.
const GAP_H = 140;
const TOP_GAP_C = 132; // centre of the upper opening
const BOT_GAP_C = 348; // centre of the lower opening

type Letter = "A" | "B" | "C" | "D";

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function FlappyAnswerGame({ onGameEnd, challenge }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [lives, setLives] = useState(LIVES);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let cleanup = () => {};

    // Reuse the one shared Kaplay engine (see kaplay.ts) — re-initialising it
    // per mount corrupts the shared font atlas and blanks out the answer text.
    void (async () => {
      const { k, canvas } = await acquireKaplay();
      if (disposed) return;
      canvas.className = CANVAS_CLASS;
      container.appendChild(canvas);
      setReady(true);

      // The whole game lives inside a scene so parkKaplay() (on unmount) tears
      // down its objects, timers, and input handlers cleanly.
      k.scene(SCENE, () => {
      k.add([k.rect(W, H), k.pos(0, 0), k.color(11, 16, 34), k.z(-100)]);
      k.setGravity(0); // no gravity — the bird is steered directly by your thumb

      // ---- state ----
      let correctCount = 0;
      let livesLeft = LIVES;
      let over = false;
      let started = false;
      let invulnUntil = 0;
      let targetY = H / 2; // follows the finger/cursor
      let spawner: { cancel: () => void } | null = null;

      const letters = (["A", "B", "C", "D"] as Letter[]).filter(
        (l) => challenge?.options?.[l],
      );
      const correct: Letter = challenge?.correctLetter ?? "A";
      const distractors = letters.filter((l) => l !== correct);
      let distractorTurn = 0;

      // ---- parallax stars ----
      for (let i = 0; i < 26; i++) {
        const depth = 0.3 + Math.random() * 0.7;
        const star = k.add([
          k.rect(2 + depth * 2, 2 + depth * 2),
          k.pos(Math.random() * W, Math.random() * H),
          k.color(255, 255, 255),
          k.opacity(0.2 + depth * 0.5),
          k.z(-10),
        ]);
        star.onUpdate(() => {
          star.pos.x -= SPEED * depth * 0.5 * k.dt();
          if (star.pos.x < -4) star.pos.x = W + 4;
        });
      }

      // ---- bird (no body/gravity — position is driven manually) ----
      const bird = k.add([
        k.circle(15),
        k.pos(BIRD_X, H / 2),
        k.color(250, 204, 21),
        k.outline(3, k.rgb(120, 53, 15)),
        k.area({ scale: 0.85 }),
        k.anchor("center"),
        k.rotate(0),
        k.opacity(1),
        k.z(10),
        "bird",
      ]);

      const startHint = k.add([
        k.text("Move to steer\nslide finger or cursor up & down", { size: 18, align: "center" }),
        k.pos(W / 2, H * 0.36),
        k.color(255, 255, 255),
        k.opacity(0.9),
        k.anchor("center"),
        k.z(20),
      ]);

      const begin = () => {
        if (over || started) return;
        started = true;
        startHint.destroy();
        // Warm-up: ~3s of free steering with no obstacles so the student eases in.
        let count = 3;
        const warm = k.add([
          k.text(`Warm up — steer freely\n${count}`, { size: 18, align: "center" }),
          k.pos(W / 2, H * 0.22),
          k.color(255, 255, 255),
          k.opacity(0.9),
          k.anchor("center"),
          k.z(20),
        ]);
        const tick = k.loop(1, () => {
          count -= 1;
          if (count > 0) warm.text = `Warm up — steer freely\n${count}`;
          else {
            tick.cancel();
            warm.destroy();
            if (!over) spawner = k.loop(2.35, spawnObstacle);
          }
        });
      };
      const steer = (y: number) => {
        begin();
        targetY = clamp(y, 16, H - 16);
      };
      // Pointer + touch both drive the same steering (touchToMouse maps touch→mouse too).
      // Moving the cursor over the canvas steers AND starts the game — matches the phone's
      // onTouchStart so trackpad/mouse users don't have to click first to "wake" the bird.
      k.onMouseMove(() => steer(k.mousePos().y));
      k.onMousePress(() => steer(k.mousePos().y));
      k.onTouchStart((pos) => steer(pos.y));
      k.onTouchMove((pos) => steer(pos.y));
      // Keyboard fallback for desktop testing.
      k.onKeyDown("up", () => steer(bird.pos.y - 8));
      k.onKeyDown("down", () => steer(bird.pos.y + 8));

      // Ease the bird toward the target each frame + tilt for personality.
      bird.onUpdate(() => {
        if (over) return;
        const dy = targetY - bird.pos.y;
        bird.pos.y += dy * FOLLOW;
        bird.angle = clamp(dy * 0.4, -28, 45);
      });

      const finish = (won: boolean) => {
        if (over) return;
        over = true;
        // brief pause so the last hit/score reads, then hand back
        k.wait(0.55, () => {
          if (!disposed) onGameEnd(won);
        });
      };

      const loseLife = () => {
        if (k.time() < invulnUntil || over) return;
        livesLeft -= 1;
        setLives(livesLeft);
        invulnUntil = k.time() + 1;
        k.shake(9);
        // reset bird to a safe glide
        bird.pos.x = BIRD_X;
        bird.pos.y = H / 2;
        targetY = H / 2;
        // blink during invulnerability
        let blinks = 6;
        const t = k.loop(0.12, () => {
          bird.opacity = bird.opacity === 1 ? 0.3 : 1;
          if (--blinks <= 0) {
            bird.opacity = 1;
            t.cancel();
          }
        });
        if (livesLeft <= 0) finish(false);
      };

      // ---- obstacle spawning ----
      const gapPill = (parent: ReturnType<typeof k.add>, cx: number, cy: number, label: string) => {
        const pill = parent.add([
          k.rect(128, 34, { radius: 8 }),
          k.pos(cx, cy),
          k.color(248, 250, 252),
          k.outline(2, k.rgb(148, 163, 184)),
          k.anchor("center"),
          k.z(6),
        ]);
        pill.add([
          k.text(truncate(label, 15), { size: 15, align: "center" }),
          k.color(15, 23, 42),
          k.anchor("center"),
          k.pos(0, 0),
        ]);
      };

      const pipeSeg = (parent: ReturnType<typeof k.add>, y: number, h: number) => {
        if (h <= 0) return;
        parent.add([
          k.rect(PIPE_W, h),
          k.pos(0, y),
          k.color(34, 197, 94),
          k.outline(3, k.rgb(21, 128, 61)),
          k.area(),
          k.anchor("topleft"),
          "pipe",
        ]);
      };

      const gapSensor = (parent: ReturnType<typeof k.add>, cy: number, isCorrect: boolean) => {
        parent.add([
          k.rect(PIPE_W, GAP_H),
          k.pos(0, cy - GAP_H / 2),
          k.area(),
          k.opacity(0),
          k.anchor("topleft"),
          { isCorrect },
          "gap",
        ]);
      };

      const spawnObstacle = () => {
        if (over) return;
        const obst = k.add([k.pos(W + PIPE_W, 0), { resolved: false }, "obstacle"]);
        // solid segments: top cap, middle divider, bottom cap (openings at TOP/BOT gaps)
        pipeSeg(obst, 0, TOP_GAP_C - GAP_H / 2);
        pipeSeg(obst, TOP_GAP_C + GAP_H / 2, BOT_GAP_C - GAP_H / 2 - (TOP_GAP_C + GAP_H / 2));
        pipeSeg(obst, BOT_GAP_C + GAP_H / 2, H - (BOT_GAP_C + GAP_H / 2));

        // assign correct answer to a random opening
        const correctOnTop = Math.random() < 0.5;
        const distractor =
          distractors.length > 0
            ? distractors[distractorTurn++ % distractors.length]
            : correct;
        const topLetter = correctOnTop ? correct : distractor;
        const botLetter = correctOnTop ? distractor : correct;
        const label = (l: Letter) =>
          challenge ? `${l}. ${challenge.options[l] ?? ""}` : "";

        if (challenge) {
          gapPill(obst, PIPE_W / 2, TOP_GAP_C, label(topLetter));
          gapPill(obst, PIPE_W / 2, BOT_GAP_C, label(botLetter));
        }
        gapSensor(obst, TOP_GAP_C, correctOnTop);
        gapSensor(obst, BOT_GAP_C, !correctOnTop);

        obst.onUpdate(() => {
          obst.pos.x -= SPEED * k.dt();
          if (obst.pos.x < -PIPE_W - 140) obst.destroy();
        });
      };

      // ---- collisions ----
      bird.onCollide("pipe", (p) => {
        const o = (p as unknown as { parent?: { resolved: boolean } }).parent;
        if (o?.resolved) return;
        if (o) o.resolved = true;
        loseLife();
      });

      bird.onCollide("gap", (g) => {
        const gap = g as unknown as { isCorrect: boolean; parent?: { resolved: boolean } };
        const o = gap.parent;
        if (o?.resolved) return;
        if (o) o.resolved = true;
        if (gap.isCorrect) {
          correctCount += 1;
          setProgress(correctCount);
          k.shake(3);
          if (correctCount >= GOAL) finish(true);
        } else {
          loseLife();
        }
      });

      });
      k.go(SCENE);

      cleanup = () => {
        parkKaplay();
        if (canvas.parentElement === container) container.removeChild(canvas);
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex w-full max-w-[360px] flex-col items-center gap-2">
      {challenge && (
        <div className="w-full rounded-xl bg-white/10 px-3 py-2 text-center text-sm font-semibold text-white ring-1 ring-white/15">
          Steer through the correct answer 🐤
          <div className="mt-1 text-[13px] font-normal text-white/80 line-clamp-2">
            {challenge.question}
          </div>
        </div>
      )}
      <div className="flex w-full items-center justify-between text-sm font-bold text-white">
        <span>🎯 {progress}/{GOAL}</span>
        <span className="text-rose-300">
          {"❤".repeat(lives)}
          {"·".repeat(LIVES - lives)}
        </span>
        <span className="text-white/50 text-xs">{ready ? "drag to steer" : "loading…"}</span>
      </div>
      <div ref={containerRef} className="w-full max-w-[360px] leading-[0]" />
    </div>
  );
}
