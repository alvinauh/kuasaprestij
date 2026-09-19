import { useEffect, useRef, useState } from "react";

interface Props {
  onGameEnd: (won: boolean) => void;
}

const W = 360;
const H = 480;
const GOAL = 3;
const GAP = 175;
const PIPE_W = 60;
const BIRD_X = 80;
const BIRD_R = 18;
const PIPE_SPEED = 120; // px/s the pipes scroll left
const FOLLOW = 0.22; // how quickly the bird eases toward your finger/cursor

interface Pipe {
  x: number;
  gapY: number;
  passed: boolean;
}

export function FlappyBirdGame({ onGameEnd }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const birdYRef = useRef(H / 2);
  const targetYRef = useRef(H / 2);
  const pipesRef = useRef<Pipe[]>([{ x: W + 40, gapY: 200, passed: false }]);
  const scoreRef = useRef(0);
  const endedRef = useRef(false);
  const gameActive = useRef(false);
  const startedRef = useRef(false);
  const framesRef = useRef(0);
  const warmupUntilRef = useRef(0); // set on first input; obstacles held until then
  const [score, setScore] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Map a viewport Y coordinate to the game's internal Y (canvas is scaled by CSS).
    const toGameY = (clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const scale = H / rect.height;
      return (clientY - rect.top) * scale;
    };
    const steer = (clientY: number) => {
      // First input starts the world so idle time isn't an instant loss.
      if (!startedRef.current) {
        startedRef.current = true;
        setStarted(true);
      }
      targetYRef.current = Math.max(BIRD_R, Math.min(H - BIRD_R, toGameY(clientY)));
    };

    const onMouseMove = (e: MouseEvent) => steer(e.clientY);
    const onTouch = (e: TouchEvent) => {
      if (!e.touches[0]) return;
      e.preventDefault();
      steer(e.touches[0].clientY);
    };
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("touchstart", onTouch, { passive: false });
    canvas.addEventListener("touchmove", onTouch, { passive: false });

    let raf = 0;
    let prev = performance.now();

    const end = (won: boolean) => {
      if (!gameActive.current || endedRef.current) return;
      endedRef.current = true;
      gameActive.current = false;
      cancelAnimationFrame(raf);
      onGameEnd(won);
    };

    const drawScene = () => {
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#7dd3fc");
      sky.addColorStop(1, "#0c4a6e");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = "#166534";
      for (const p of pipesRef.current) {
        ctx.fillRect(p.x, 0, PIPE_W, p.gapY - GAP / 2);
        ctx.fillRect(p.x, p.gapY + GAP / 2, PIPE_W, H);
      }

      ctx.fillStyle = "#facc15";
      ctx.beginPath();
      ctx.arc(BIRD_X, birdYRef.current, BIRD_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.arc(BIRD_X + 6, birdYRef.current - 4, 3, 0, Math.PI * 2);
      ctx.fill();
    };

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;

      // Ready gate: hold the bird still and show a hint until the first touch.
      if (!startedRef.current) {
        drawScene();
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 20px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Drag to steer", W / 2, H / 2 - 10);
        ctx.font = "15px system-ui, sans-serif";
        ctx.fillText("slide your thumb up & down", W / 2, H / 2 + 16);
        raf = requestAnimationFrame(loop);
        return;
      }

      framesRef.current += 1;

      // Bird eases toward your finger/cursor — no gravity, no flap timing.
      birdYRef.current += (targetYRef.current - birdYRef.current) * FOLLOW;

      // Warm-up: ~3s of free steering with no obstacles so the student eases in.
      if (warmupUntilRef.current === 0) warmupUntilRef.current = now + 3000;
      if (now < warmupUntilRef.current) {
        drawScene();
        const secs = Math.ceil((warmupUntilRef.current - now) / 1000);
        ctx.fillStyle = "rgba(0,0,0,0.28)";
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.font = "bold 20px system-ui, sans-serif";
        ctx.fillText("Warm up — steer freely", W / 2, H / 2 - 12);
        ctx.font = "bold 34px system-ui, sans-serif";
        ctx.fillText(`${secs}`, W / 2, H / 2 + 30);
        raf = requestAnimationFrame(loop);
        return;
      }

      for (const p of pipesRef.current) {
        p.x -= PIPE_SPEED * dt;
        const topH = p.gapY - GAP / 2;
        const botY = p.gapY + GAP / 2;
        const hitX = BIRD_X + BIRD_R > p.x && BIRD_X - BIRD_R < p.x + PIPE_W;
        if (hitX && (birdYRef.current - BIRD_R < topH || birdYRef.current + BIRD_R > botY)) {
          return end(false);
        }
        if (framesRef.current > 1 && !p.passed && p.x + PIPE_W < BIRD_X - BIRD_R) {
          p.passed = true;
          scoreRef.current += 1;
          setScore(scoreRef.current);
        }
      }
      const last = pipesRef.current[pipesRef.current.length - 1];
      if (last.x < 180) {
        pipesRef.current.push({
          x: W + 40,
          gapY: 110 + Math.random() * (H - 220),
          passed: false,
        });
      }
      pipesRef.current = pipesRef.current.filter((p) => p.x > -PIPE_W);

      drawScene();

      if (scoreRef.current >= GOAL) return end(true);
      raf = requestAnimationFrame(loop);
    };
    gameActive.current = true;
    raf = requestAnimationFrame(loop);

    return () => {
      gameActive.current = false;
      cancelAnimationFrame(raf);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("touchstart", onTouch);
      canvas.removeEventListener("touchmove", onTouch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="w-full max-w-[360px] text-sm font-bold text-white">
        Pipes: {score}/{GOAL} · {started ? "slide your thumb to steer" : "drag to start"}
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
