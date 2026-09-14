import { useEffect, useRef, useState } from "react";
import {
  Particles, Shake, Sfx, FloatingText,
  roundRect, verticalGradient,
} from "../../lib/gameKit";

const W = 360;
const H = 200;
const GROUND = 162;   // y of the running surface
const GOAL = 5;

interface Cactus { x: number; passed: boolean; }

// ── visual helpers ────────────────────────────────────────────────────────────

function drawCloud(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.beginPath();
  ctx.arc(cx,              cy,              r,        0, Math.PI * 2);
  ctx.arc(cx - r * 0.75,  cy + r * 0.35,  r * 0.65, 0, Math.PI * 2);
  ctx.arc(cx + r * 0.75,  cy + r * 0.35,  r * 0.65, 0, Math.PI * 2);
  ctx.arc(cx - r * 1.3,   cy + r * 0.6,   r * 0.45, 0, Math.PI * 2);
  ctx.arc(cx + r * 1.3,   cy + r * 0.6,   r * 0.45, 0, Math.PI * 2);
  ctx.fill();
}

function drawBackground(ctx: CanvasRenderingContext2D, groundScroll: number) {
  // Sky
  verticalGradient(ctx, W, H, "#87ceeb", "#c7e8fa");

  // Clouds — 3 layers at different depths
  const cloudLayers = [
    { period: 260, speed: 0.025, y: 14, r: 17 },
    { period: 200, speed: 0.05,  y: 36, r: 13 },
    { period: 170, speed: 0.08,  y: 55, r: 10 },
  ];
  for (const { period, speed, y, r } of cloudLayers) {
    const scroll = (groundScroll * speed) % period;
    for (let i = -1; i <= Math.ceil(W / period) + 1; i++) {
      drawCloud(ctx, i * period - scroll, y, r);
    }
  }

  // Far rolling hills (slow)
  {
    const period = 115;
    const scroll = (groundScroll * 0.12) % period;
    ctx.fillStyle = "#a7f3d0";
    for (let i = -1; i <= Math.ceil(W / period) + 1; i++) {
      ctx.beginPath();
      ctx.arc(i * period - scroll, GROUND + 8, 68, Math.PI, 0);
      ctx.fill();
    }
  }

  // Near rolling hills (moderate)
  {
    const period = 145;
    const scroll = (groundScroll * 0.3) % period;
    ctx.fillStyle = "#6ee7b7";
    for (let i = -1; i <= Math.ceil(W / period) + 1; i++) {
      ctx.beginPath();
      ctx.arc(i * period - scroll, GROUND + 10, 54, Math.PI, 0);
      ctx.fill();
    }
  }

  // Grass strip
  ctx.fillStyle = "#4ade80";
  ctx.fillRect(0, GROUND, W, 14);

  // Scrolling grass tufts on top of grass
  {
    const period = 42;
    const scroll = groundScroll % period;
    ctx.fillStyle = "#15803d";
    for (let i = -1; i <= Math.ceil(W / period) + 1; i++) {
      const tx = i * period - scroll;
      ctx.beginPath();
      ctx.moveTo(tx + 3, GROUND + 13);
      ctx.lineTo(tx,     GROUND + 5);
      ctx.lineTo(tx + 6, GROUND + 5);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(tx + 16, GROUND + 13);
      ctx.lineTo(tx + 13, GROUND + 7);
      ctx.lineTo(tx + 19, GROUND + 7);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Earth
  ctx.fillStyle = "#92400e";
  ctx.fillRect(0, GROUND + 14, W, H - GROUND - 14);

  // Ground edge
  ctx.strokeStyle = "#15803d";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, GROUND + 14);
  ctx.lineTo(W, GROUND + 14);
  ctx.stroke();
}

// Dino drawn within a 30×40 bounding box at (x, y).
// Feet touch y+40 when on the ground.
function drawDinosaur(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  legPhase: number,
  inAir: boolean,
) {
  const G  = "#22c55e";  // green-500 body
  const GL = "#86efac";  // green-300 belly
  const GD = "#15803d";  // green-700 shadow/details

  // Ground shadow
  if (!inAir) {
    ctx.fillStyle = "rgba(0,0,0,0.14)";
    ctx.beginPath();
    ctx.ellipse(x + 15, GROUND + 3, 13, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Tail — curves back-left from lower body
  ctx.fillStyle = GD;
  ctx.beginPath();
  ctx.moveTo(x + 6, y + 20);
  ctx.quadraticCurveTo(x - 2, y + 26, x - 8, y + 34);
  ctx.lineTo(x + 0, y + 33);
  ctx.quadraticCurveTo(x + 6, y + 25, x + 9, y + 22);
  ctx.closePath();
  ctx.fill();

  // Body — add a subtle glow
  ctx.shadowColor = "#4ade80";
  ctx.shadowBlur = 5;
  ctx.fillStyle = G;
  roundRect(ctx, x + 4, y + 14, 21, 21, 8);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Belly highlight
  ctx.fillStyle = GL;
  roundRect(ctx, x + 7, y + 18, 10, 13, 5);
  ctx.fill();

  // Neck
  ctx.fillStyle = G;
  roundRect(ctx, x + 14, y + 7, 9, 11, 4);
  ctx.fill();

  // Head — fits x+8..x+30
  ctx.fillStyle = G;
  roundRect(ctx, x + 8, y + 1, 22, 11, 5);
  ctx.fill();

  // Snout — fits x+22..x+30
  ctx.fillStyle = G;
  roundRect(ctx, x + 22, y + 4, 8, 6, 3);
  ctx.fill();

  // Nostril
  ctx.fillStyle = GD;
  ctx.beginPath();
  ctx.arc(x + 27, y + 6, 1, 0, Math.PI * 2);
  ctx.fill();

  // Eye — sclera
  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.arc(x + 17, y + 5, 3, 0, Math.PI * 2);
  ctx.fill();
  // Pupil (looking right)
  ctx.fillStyle = "#0f172a";
  ctx.beginPath();
  ctx.arc(x + 18, y + 5, 1.7, 0, Math.PI * 2);
  ctx.fill();
  // Sparkle
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  ctx.arc(x + 18.5, y + 4.2, 0.7, 0, Math.PI * 2);
  ctx.fill();

  // Tiny arm
  ctx.fillStyle = GD;
  roundRect(ctx, x + 19, y + 20, 6, 3, 2);
  ctx.fill();
  roundRect(ctx, x + 23, y + 21, 4, 3, 1);
  ctx.fill();

  // Legs — alternate stride, tuck up in air
  const frontH = inAir ? 3 : (legPhase < 0.5 ? 7 : 4);
  const backH  = inAir ? 3 : (legPhase < 0.5 ? 4 : 7);
  const legTop = y + 35;

  ctx.fillStyle = G;
  roundRect(ctx, x + 15, legTop, 7, frontH, 3);
  ctx.fill();
  roundRect(ctx, x + 6, legTop, 7, backH, 3);
  ctx.fill();

  // Feet (darker, at leg bottoms)
  ctx.fillStyle = GD;
  roundRect(ctx, x + 13, legTop + frontH, 10, 3, 2);
  ctx.fill();
  roundRect(ctx, x + 4, legTop + backH, 10, 3, 2);
  ctx.fill();
}

// Cactus drawn in a 20×40 bounding box at (x, y) where y+40 == GROUND.
function drawCactus(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const C  = "#16a34a";  // green-700 body
  const CH = "#4ade80";  // highlight stripe

  // Main trunk
  ctx.fillStyle = C;
  roundRect(ctx, x + 6, y, 8, 40, 4);
  ctx.fill();
  // Highlight stripe
  ctx.fillStyle = CH;
  roundRect(ctx, x + 8, y + 3, 2, 34, 1);
  ctx.fill();

  // Left arm: horizontal then vertical
  ctx.fillStyle = C;
  roundRect(ctx, x,  y + 12, 8, 5, 2);  // horizontal
  ctx.fill();
  roundRect(ctx, x,  y + 4,  6, 13, 3); // vertical segment
  ctx.fill();

  // Right arm: different height for asymmetry
  ctx.fillStyle = C;
  roundRect(ctx, x + 12, y + 18, 8, 5, 2);  // horizontal
  ctx.fill();
  roundRect(ctx, x + 14, y + 10, 6, 13, 3); // vertical segment
  ctx.fill();

  // Spines
  ctx.strokeStyle = "#fef9c3";
  ctx.lineWidth = 1.5;
  const spines: [number, number, number, number][] = [
    [x + 5, y + 8,  x + 1, y + 6],
    [x + 5, y + 20, x + 1, y + 18],
    [x + 5, y + 31, x + 1, y + 29],
    [x + 15, y + 14, x + 19, y + 12],
    [x + 15, y + 25, x + 19, y + 23],
  ];
  for (const [x1, y1, x2, y2] of spines) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props { onGameEnd: (won: boolean) => void; }

export function DinoRunnerGame({ onGameEnd }: Props) {
  const canvasRef    = useRef<HTMLCanvasElement | null>(null);
  const dinoYRef     = useRef(GROUND - 40);
  const dinoVyRef    = useRef(0);
  const cactiRef     = useRef<Cactus[]>([]);
  const nextSpawnRef = useRef(1500);
  const speedRef     = useRef(200);
  const clearedRef   = useRef(0);
  const endedRef     = useRef(false);
  const gameActive   = useRef(false);
  const startedRef   = useRef(false);
  const [cleared, setCleared] = useState(0);
  const [started,  setStarted]  = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Juice instances
    const particles = new Particles();
    const shake     = new Shake();
    const sfx       = new Sfx();
    const floats    = new FloatingText();

    // Animation state (closure — persists across animation frames)
    let animT       = 0;
    let legPhase    = 0;
    let groundScroll = 0;
    let wasAirborne = false;

    const jump = () => {
      if (!startedRef.current) {
        startedRef.current = true;
        setStarted(true);
      }
      if (dinoYRef.current >= GROUND - 40 - 0.1) {
        dinoVyRef.current = -400;
        sfx.blip();
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") { e.preventDefault(); jump(); }
    };
    const onTap = (e: Event) => { e.preventDefault(); jump(); };

    window.addEventListener("keydown", onKey);
    canvas.addEventListener("mousedown", onTap);
    canvas.addEventListener("touchstart", onTap, { passive: false });

    let raf = 0;
    let prev = performance.now();
    let elapsed = 0;

    const end = (won: boolean) => {
      if (!gameActive.current || endedRef.current) return;
      endedRef.current = true;
      gameActive.current = false;
      cancelAnimationFrame(raf);
      if (won) sfx.win(); else sfx.lose();
      onGameEnd(won);
    };

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      animT += dt;

      if (startedRef.current) {
        groundScroll += speedRef.current * dt;
        legPhase = (animT * 5) % 1;
      }

      // ── Ready gate ────────────────────────────────────────────────────────
      if (!startedRef.current) {
        ctx.save();
        drawBackground(ctx, 0);
        drawDinosaur(ctx, 60, GROUND - 40, 0, false);
        ctx.fillStyle = "rgba(0,0,0,0.38)";
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 18px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Tap / Space to start", W / 2, H / 2 - 10);
        ctx.font = "13px system-ui, sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.fillText("Jump over the cacti!", W / 2, H / 2 + 14);
        ctx.restore();
        raf = requestAnimationFrame(loop);
        return;
      }

      // ── Physics ───────────────────────────────────────────────────────────
      elapsed += dt * 1000;
      speedRef.current = 200 + Math.min(150, elapsed / 100);

      dinoVyRef.current += 800 * dt;
      dinoYRef.current  += dinoVyRef.current * dt;

      const isAirborne = dinoYRef.current < GROUND - 40 - 1;

      if (dinoYRef.current >= GROUND - 40) {
        dinoYRef.current  = GROUND - 40;
        dinoVyRef.current = 0;
        if (wasAirborne) {
          // Landing dust puff
          particles.burst(
            75, GROUND,
            6, ["#fde68a", "#d1fae5", "#fff"],
            { speed: 80, gravity: 280, size: 4, life: 0.38 },
          );
        }
      }
      wasAirborne = isAirborne;

      // ── Spawn ─────────────────────────────────────────────────────────────
      nextSpawnRef.current -= dt * 1000;
      if (nextSpawnRef.current <= 0) {
        cactiRef.current.push({ x: W + 20, passed: false });
        nextSpawnRef.current = 1500 + Math.random() * 1000;
      }

      // ── Collision + pass check ────────────────────────────────────────────
      // Hitbox slightly inset from visual for fair feel
      const dinoBox = { x: 63, y: dinoYRef.current + 5, w: 22, h: 32 };
      for (const c of cactiRef.current) {
        c.x -= speedRef.current * dt;
        const cBox = { x: c.x + 5, y: GROUND - 38, w: 10, h: 38 };
        if (
          dinoBox.x < cBox.x + cBox.w &&
          dinoBox.x + dinoBox.w > cBox.x &&
          dinoBox.y < cBox.y + cBox.h &&
          dinoBox.y + dinoBox.h > cBox.y
        ) {
          particles.burst(
            75, dinoYRef.current + 20,
            16, ["#fca5a5", "#fb923c", "#fde68a", "#fff"],
            { speed: 210, gravity: 520, size: 6, life: 0.65 },
          );
          shake.add(0.5);
          return end(false);
        }
        if (!c.passed && c.x + 20 < 60) {
          c.passed = true;
          clearedRef.current += 1;
          setCleared(clearedRef.current);
          sfx.coin(clearedRef.current);
          floats.spawn(75, dinoYRef.current - 8, "+1", "#fbbf24", 22);
          particles.burst(
            75, dinoYRef.current + 10,
            10, ["#fbbf24", "#86efac", "#67e8f9"],
            { speed: 130, gravity: 420, size: 5, life: 0.55 },
          );
        }
      }
      cactiRef.current = cactiRef.current.filter((c) => c.x > -40);

      // ── Update juice ──────────────────────────────────────────────────────
      shake.update(dt);
      particles.update(dt);
      floats.update(dt);

      // ── Draw ──────────────────────────────────────────────────────────────
      const [sx, sy] = shake.offset(8);
      ctx.save();
      ctx.translate(sx, sy);

      drawBackground(ctx, groundScroll);
      drawDinosaur(ctx, 60, dinoYRef.current, legPhase, isAirborne);

      for (const c of cactiRef.current) {
        drawCactus(ctx, c.x, GROUND - 40);
      }

      particles.draw(ctx);
      floats.draw(ctx);

      ctx.restore();

      if (clearedRef.current >= GOAL) return end(true);
      raf = requestAnimationFrame(loop);
    };

    gameActive.current = true;
    raf = requestAnimationFrame(loop);

    return () => {
      gameActive.current = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      canvas.removeEventListener("mousedown", onTap);
      canvas.removeEventListener("touchstart", onTap);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="w-full max-w-[360px] text-sm font-bold text-white">
        Cleared: {cleared}/{GOAL} · {started ? "tap / space to jump" : "tap / space to start"}
      </div>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="w-full max-w-[360px] rounded-2xl border border-white/20 touch-none"
      />
    </div>
  );
}
