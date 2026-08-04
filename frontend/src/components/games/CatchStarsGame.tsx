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

type Letter = "A" | "B" | "C" | "D";

export interface GameChallenge {
  question: string;
  options: Partial<Record<Letter, string>>;
  /** Correct option letter, e.g. "C". */
  correctLetter: Letter;
  /** Assessment-integrated Play mode: identify the source session so an answer
   *  can be submitted back to the backend (mastery + event log). */
  sessionId?: string;
  /** One-line "why" shown as the teaching moment when the player picks wrong. */
  explanation?: string;
  topic?: string;
  subject?: string;
}

interface Props {
  onGameEnd: (won: boolean) => void;
  /** When provided, the game becomes assessment-integrated: catch the correct answer. */
  challenge?: GameChallenge | null;
}

const W = 360;
const H = 460;
const GOAL = 5; // correct catches to win
const LIVES = 3;
const TILE_W = 150;
const TILE_H = 46;
const BASKET_W = 104;
const BASKET_H = 22;
const BASKET_Y = H - 46;

interface Tile {
  x: number;
  y: number;
  vy: number;
  letter: Letter;
  text: string;
  correct: boolean;
  spawn: number; // for pop-in animation
  dead?: boolean;
}

const LETTER_COLORS: Record<Letter, string> = {
  A: "#38bdf8",
  B: "#a78bfa",
  C: "#fb7185",
  D: "#34d399",
};

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export function CatchStarsGame({ onGameEnd, challenge }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [lives, setLives] = useState(LIVES);
  const [combo, setCombo] = useState(0);

  // refs mirror state for the rAF loop (avoids stale closures)
  const basketXRef = useRef(W / 2);
  const tilesRef = useRef<Tile[]>([]);
  const progressRef = useRef(0);
  const livesRef = useRef(LIVES);
  const comboRef = useRef(0);
  const lastSpawnRef = useRef(0);
  const endedRef = useRef(false);
  const activeRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const particles = new Particles();
    const shake = new Shake();
    const floats = new FloatingText();
    const sfx = new Sfx();

    const letters = (["A", "B", "C", "D"] as Letter[]).filter(
      (l) => challenge?.options?.[l],
    );
    const pool: Letter[] = letters.length ? letters : ["A", "B", "C", "D"];
    const correct: Letter = challenge?.correctLetter ?? "A";

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
      // let the final burst play before handing back
      setTimeout(() => onGameEnd(won), 650);
    };

    const spawnTile = (now: number) => {
      // 45% chance the tile is the correct answer, else a distractor
      const wantCorrect = pool.length === 1 || Math.random() < 0.45;
      let letter: Letter;
      if (wantCorrect) {
        letter = correct;
      } else {
        const distractors = pool.filter((l) => l !== correct);
        letter = distractors.length
          ? distractors[(Math.random() * distractors.length) | 0]
          : correct;
      }
      const text = challenge
        ? truncate(challenge.options[letter] ?? letter, 22)
        : "⭐";
      const speedBoost = progressRef.current * 8;
      tilesRef.current.push({
        x: TILE_W / 2 + Math.random() * (W - TILE_W),
        y: -TILE_H,
        vy: 92 + Math.random() * 46 + speedBoost,
        letter,
        text,
        correct: letter === correct,
        spawn: now,
      });
    };

    const drawTile = (t: Tile, now: number) => {
      const age = (now - t.spawn) / 1000;
      const pop = easeOutBack(clamp(age / 0.18, 0, 1));
      const w = TILE_W * (0.5 + 0.5 * pop);
      const h = TILE_H * (0.5 + 0.5 * pop);
      const x = t.x - w / 2;
      const y = t.y - h / 2;
      const col = challenge ? LETTER_COLORS[t.letter] : "#fde047";

      ctx.save();
      // glow
      ctx.shadowColor = col;
      ctx.shadowBlur = 16;
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, "rgba(255,255,255,0.16)");
      g.addColorStop(1, "rgba(0,0,0,0.28)");
      roundRect(ctx, x, y, w, h, 12);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.shadowBlur = 0;
      roundRect(ctx, x, y, w, h, 12);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.stroke();

      if (challenge) {
        // letter badge
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.beginPath();
        ctx.arc(x + 18, y + h / 2, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "800 15px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(t.letter, x + 18, y + h / 2 + 1);
        // option text
        ctx.textAlign = "left";
        ctx.font = "700 14px system-ui, sans-serif";
        ctx.fillStyle = "#0f172a";
        ctx.fillText(t.text, x + 36, y + h / 2 + 1);
      } else {
        ctx.font = "26px serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("⭐", t.x, t.y);
      }
      ctx.restore();
    };

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      bgPhase += dt;

      // spawn
      const spawnGap = challenge ? 760 : 800;
      if (now - lastSpawnRef.current > spawnGap) {
        lastSpawnRef.current = now;
        spawnTile(now);
      }

      // update tiles + collision
      const bx = basketXRef.current;
      const bTop = BASKET_Y;
      for (const t of tilesRef.current) {
        t.y += t.vy * dt;
        if (
          !t.dead &&
          t.y + TILE_H / 2 >= bTop &&
          t.y - TILE_H / 2 <= bTop + BASKET_H &&
          Math.abs(t.x - bx) <= BASKET_W / 2 + TILE_W / 2 - 10
        ) {
          t.dead = true;
          if (t.correct) {
            comboRef.current += 1;
            progressRef.current += 1;
            setCombo(comboRef.current);
            setProgress(progressRef.current);
            sfx.coin(comboRef.current);
            particles.burst(t.x, t.y, 18, ["#34d399", "#a7f3d0", "#facc15"], {
              speed: 240,
            });
            const label =
              comboRef.current >= 3 ? `COMBO x${comboRef.current}` : "+1";
            floats.spawn(t.x, t.y - 10, label, "#bbf7d0", comboRef.current >= 3 ? 20 : 24);
            shake.add(0.12);
          } else {
            comboRef.current = 0;
            livesRef.current -= 1;
            setCombo(0);
            setLives(livesRef.current);
            sfx.buzz();
            particles.burst(t.x, t.y, 14, ["#f87171", "#fca5a5"], { speed: 200 });
            floats.spawn(t.x, t.y - 10, "MISS", "#fecaca", 22);
            shake.add(0.5);
          }
        }
      }
      tilesRef.current = tilesRef.current.filter(
        (t) => !t.dead && t.y < H + TILE_H,
      );

      particles.update(dt);
      floats.update(dt);
      shake.update(dt);

      // ---- draw ----
      const [sx, sy] = shake.offset();
      ctx.save();
      ctx.translate(sx, sy);

      verticalGradient(ctx, W, H, "#0b1a3a", "#231045");
      // parallax twinkle
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      for (let i = 0; i < 22; i++) {
        const tx = (i * 53) % W;
        const ty = (i * 97 + bgPhase * 22) % H;
        const tw = (Math.sin(bgPhase * 3 + i) + 1) * 1.1;
        ctx.globalAlpha = 0.25 + 0.25 * Math.sin(bgPhase * 2 + i);
        ctx.fillRect(tx, ty, tw, tw);
      }
      ctx.globalAlpha = 1;

      for (const t of tilesRef.current) drawTile(t, now);

      // basket / net
      const grad = ctx.createLinearGradient(0, bTop, 0, bTop + BASKET_H);
      grad.addColorStop(0, "#fbbf24");
      grad.addColorStop(1, "#b45309");
      roundRect(ctx, bx - BASKET_W / 2, bTop, BASKET_W, BASKET_H, 8);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 2;
      ctx.stroke();
      // basket rim highlight
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      roundRect(ctx, bx - BASKET_W / 2 + 4, bTop + 3, BASKET_W - 8, 5, 3);
      ctx.fill();

      particles.draw(ctx);
      floats.draw(ctx);
      ctx.restore();

      // ---- end conditions ----
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
      {challenge && (
        <div className="w-full rounded-xl bg-white/10 px-3 py-2 text-center text-sm font-semibold text-white ring-1 ring-white/15">
          Catch the correct answer 🧺
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
