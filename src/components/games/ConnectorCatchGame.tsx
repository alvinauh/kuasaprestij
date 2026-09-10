import { useEffect, useRef, useState } from "react";
import {
  Particles,
  Shake,
  Sfx,
  FloatingText,
  roundRect,
  verticalGradient,
  easeOutBack,
  clamp,
} from "@/lib/gameKit";
import { shuffled, type WritingChallenge } from "./writing";

interface Props {
  onGameEnd: (won: boolean) => void;
  challenge: WritingChallenge;
}

const W = 360;
const H = 460;
const GOAL = 3; // correct connectors to win
const LIVES = 3;
const TILE_H = 44;
const BASKET_W = 108;
const BASKET_H = 22;
const BASKET_Y = H - 46;

interface Tile {
  x: number;
  y: number;
  vy: number;
  text: string;
  correct: boolean;
  w: number;
  spawn: number;
  dead?: boolean;
}

/**
 * Connector Catch — a writing-native reinforcement game. A sentence is missing its
 * cohesive connector (however / therefore / so / because…). The correct connector and
 * plausible wrong ones fall; steer the basket to catch the RIGHT one and dodge the rest.
 * Tests cohesion and logical linking — writing skill, not recall.
 */
export function ConnectorCatchGame({ onGameEnd, challenge }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [lives, setLives] = useState(LIVES);
  const [combo, setCombo] = useState(0);

  const basketXRef = useRef(W / 2);
  const tilesRef = useRef<Tile[]>([]);
  const progressRef = useRef(0);
  const livesRef = useRef(LIVES);
  const comboRef = useRef(0);
  const lastSpawnRef = useRef(0);
  const endedRef = useRef(false);
  const activeRef = useRef(false);

  const conn = challenge.connector;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const particles = new Particles();
    const shake = new Shake();
    const floats = new FloatingText();
    const sfx = new Sfx();

    const correct = (conn?.answer ?? "so").trim();
    const distractors = (conn?.distractors ?? ["but", "although", "because"]).map((d) => d.trim());
    const pool = shuffled([correct, ...distractors].filter(Boolean));

    const onMove = (clientX: number) => {
      const r = canvas.getBoundingClientRect();
      const ratio = W / r.width;
      basketXRef.current = clamp(
        (clientX - r.left) * ratio,
        BASKET_W / 2,
        W - BASKET_W / 2,
      );
    };
    const mm = (e: MouseEvent) => onMove(e.clientX);
    const tm = (e: TouchEvent) => {
      if (e.touches[0]) onMove(e.touches[0].clientX);
    };
    canvas.addEventListener("mousemove", mm);
    canvas.addEventListener("touchmove", tm, { passive: true });

    let raf = 0;
    let prev = performance.now();
    let bgPhase = 0;

    const measure = (txt: string) => {
      ctx.font = "700 15px system-ui, sans-serif";
      return Math.max(64, ctx.measureText(txt).width + 30);
    };

    const end = (won: boolean) => {
      if (!activeRef.current || endedRef.current) return;
      endedRef.current = true;
      activeRef.current = false;
      if (won) {
        sfx.win();
        particles.burst(W / 2, H / 2, 46, ["#facc15", "#34d399", "#38bdf8", "#f472b6"], {
          speed: 320,
          life: 1.1,
        });
      } else {
        sfx.lose();
      }
      setTimeout(() => onGameEnd(won), 650);
    };

    const spawnTile = (now: number) => {
      const wantCorrect = pool.length === 1 || Math.random() < 0.42;
      let text: string;
      if (wantCorrect) {
        text = correct;
      } else {
        const wrong = pool.filter((p) => p !== correct);
        text = wrong.length ? wrong[(Math.random() * wrong.length) | 0] : correct;
      }
      const w = measure(text);
      const speedBoost = progressRef.current * 10;
      tilesRef.current.push({
        x: w / 2 + Math.random() * (W - w),
        y: -TILE_H,
        vy: 88 + Math.random() * 42 + speedBoost,
        text,
        correct: text === correct,
        w,
        spawn: now,
      });
    };

    const drawTile = (t: Tile, now: number) => {
      const age = (now - t.spawn) / 1000;
      const pop = easeOutBack(clamp(age / 0.18, 0, 1));
      const w = t.w * (0.5 + 0.5 * pop);
      const h = TILE_H * (0.5 + 0.5 * pop);
      const x = t.x - w / 2;
      const y = t.y - h / 2;
      // Neutral colour — the player must READ the word, not colour-match.
      const col = "#e0e7ff";

      ctx.save();
      ctx.shadowColor = "rgba(129,140,248,0.7)";
      ctx.shadowBlur = 14;
      roundRect(ctx, x, y, w, h, 12);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.stroke();

      ctx.fillStyle = "#1e1b4b";
      ctx.font = "700 15px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(t.text, t.x, t.y + 1);
      ctx.restore();
    };

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      bgPhase += dt;

      if (now - lastSpawnRef.current > 820) {
        lastSpawnRef.current = now;
        spawnTile(now);
      }

      const bx = basketXRef.current;
      const bTop = BASKET_Y;
      for (const t of tilesRef.current) {
        t.y += t.vy * dt;
        if (
          !t.dead &&
          t.y + TILE_H / 2 >= bTop &&
          t.y - TILE_H / 2 <= bTop + BASKET_H &&
          Math.abs(t.x - bx) <= BASKET_W / 2 + t.w / 2 - 10
        ) {
          t.dead = true;
          if (t.correct) {
            comboRef.current += 1;
            progressRef.current += 1;
            setCombo(comboRef.current);
            setProgress(progressRef.current);
            sfx.coin(comboRef.current);
            particles.burst(t.x, t.y, 18, ["#34d399", "#a7f3d0", "#facc15"], { speed: 240 });
            const label = comboRef.current >= 3 ? `COMBO x${comboRef.current}` : "+1";
            floats.spawn(t.x, t.y - 10, label, "#bbf7d0", comboRef.current >= 3 ? 20 : 24);
            shake.add(0.12);
          } else {
            comboRef.current = 0;
            livesRef.current -= 1;
            setCombo(0);
            setLives(livesRef.current);
            sfx.buzz();
            particles.burst(t.x, t.y, 14, ["#f87171", "#fca5a5"], { speed: 200 });
            floats.spawn(t.x, t.y - 10, "WRONG", "#fecaca", 20);
            shake.add(0.5);
          }
        }
      }
      tilesRef.current = tilesRef.current.filter((t) => !t.dead && t.y < H + TILE_H);

      particles.update(dt);
      floats.update(dt);
      shake.update(dt);

      const [sx, sy] = shake.offset();
      ctx.save();
      ctx.translate(sx, sy);

      verticalGradient(ctx, W, H, "#07203a", "#0b3a2e");
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      for (let i = 0; i < 20; i++) {
        const tx = (i * 53) % W;
        const ty = (i * 97 + bgPhase * 20) % H;
        const tw = (Math.sin(bgPhase * 3 + i) + 1) * 1.0;
        ctx.globalAlpha = 0.2 + 0.22 * Math.sin(bgPhase * 2 + i);
        ctx.fillRect(tx, ty, tw, tw);
      }
      ctx.globalAlpha = 1;

      for (const t of tilesRef.current) drawTile(t, now);

      const grad = ctx.createLinearGradient(0, bTop, 0, bTop + BASKET_H);
      grad.addColorStop(0, "#22d3ee");
      grad.addColorStop(1, "#0e7490");
      roundRect(ctx, bx - BASKET_W / 2, bTop, BASKET_W, BASKET_H, 8);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 2;
      ctx.stroke();

      particles.draw(ctx);
      floats.draw(ctx);
      ctx.restore();

      if (progressRef.current >= GOAL) return end(true);
      if (livesRef.current <= 0) return end(false);
      raf = requestAnimationFrame(loop);
    };

    activeRef.current = true;
    raf = requestAnimationFrame(loop);

    return () => {
      activeRef.current = false;
      cancelAnimationFrame(raf);
      canvas.removeEventListener("mousemove", mm);
      canvas.removeEventListener("touchmove", tm);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex w-full max-w-[360px] flex-col items-center gap-2">
      <div className="w-full rounded-xl bg-white/10 px-3 py-2 text-center text-sm font-semibold text-white ring-1 ring-white/15">
        Catch the right connector 🔗
        <div className="mt-1 text-[13px] font-normal leading-snug text-white/85">
          {conn?.before} <span className="rounded bg-white/20 px-2 font-bold text-amber-200">____</span> {conn?.after}
        </div>
      </div>
      <div className="flex w-full items-center justify-between text-sm font-bold text-white">
        <span>🎯 {progress}/{GOAL}</span>
        <span className="text-rose-300">
          {"❤".repeat(Math.max(0, lives))}
          {"·".repeat(Math.max(0, LIVES - lives))}
        </span>
        <span className="text-amber-300">{combo >= 2 ? `🔥x${combo}` : ""}</span>
      </div>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="w-full max-w-[360px] rounded-2xl border border-white/20 touch-none shadow-2xl"
      />
    </div>
  );
}
