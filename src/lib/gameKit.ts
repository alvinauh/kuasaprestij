// gameKit — tiny zero-dependency juice toolkit for canvas mini-games.
// Everything here is instantiated INSIDE a useEffect (client-only), so it is
// SSR-safe: no module-level access to window/document/AudioContext.
//
// The point of this file is "juice" — the particles, screen-shake, easing and
// punchy sound that separate a prototype from a game that feels alive. No art
// assets required; sound is synthesized with the WebAudio API.

export type RGB = [number, number, number];

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

// Punchy overshoot easing — great for "pop-in" tile spawns and win banners.
export const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Respect the `reduce_motion` accommodation (and OS prefers-reduced-motion). When on,
 * games skip particle bursts + screen shake. The flag is set on <html data-reduce-motion="1">
 * by useStudentPrefs when the student's profile enables reduce_motion.
 */
export function motionEnabled(): boolean {
  if (typeof document !== "undefined" && document.documentElement.dataset.reduceMotion === "1") return false;
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Particles — one pooled system per game. Emit bursts on catch / hit / win.
// ---------------------------------------------------------------------------
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
  spin: number;
  rot: number;
}

export class Particles {
  private pool: Particle[] = [];

  /** Radial confetti burst. */
  burst(
    x: number,
    y: number,
    count: number,
    colors: string[],
    opts: { speed?: number; gravity?: number; size?: number; life?: number } = {},
  ) {
    if (!motionEnabled()) return;   // reduce_motion: no confetti bursts
    const speed = opts.speed ?? 220;
    const gravity = opts.gravity ?? 620;
    const size = opts.size ?? 6;
    const life = opts.life ?? 0.8;
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const spd = speed * (0.4 + Math.random() * 0.9);
      this.pool.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 60,
        life,
        maxLife: life,
        size: size * (0.6 + Math.random() * 0.8),
        color: colors[(Math.random() * colors.length) | 0],
        gravity,
        spin: (Math.random() - 0.5) * 12,
        rot: Math.random() * Math.PI,
      });
    }
  }

  update(dt: number) {
    this.pool = this.pool.filter((p) => {
      p.life -= dt;
      if (p.life <= 0) return false;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      return true;
    });
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const p of this.pool) {
      const a = clamp(p.life / p.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  get count() {
    return this.pool.length;
  }
}

// ---------------------------------------------------------------------------
// Screen shake — trauma-based (Squirrel Eiserloh style). Add trauma on hits;
// it decays over time and shake magnitude = trauma^2 for a snappy falloff.
// ---------------------------------------------------------------------------
export class Shake {
  private trauma = 0;
  private t = 0;
  add(amount: number) {
    if (!motionEnabled()) return;   // reduce_motion: no screen shake
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }
  update(dt: number) {
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
  }
  /** Returns [dx, dy] to translate the canvas by this frame. */
  offset(maxPx = 14): [number, number] {
    const s = this.trauma * this.trauma;
    // cheap pseudo-noise from time; no Math.random so it reads as vibration
    const nx = Math.sin(this.t * 47) + Math.sin(this.t * 91);
    const ny = Math.cos(this.t * 53) + Math.cos(this.t * 83);
    return [nx * 0.5 * maxPx * s, ny * 0.5 * maxPx * s];
  }
}

// ---------------------------------------------------------------------------
// Sfx — synthesized sound. No audio files. Lazily creates an AudioContext on
// first play (must be triggered by a user gesture, which game input always is).
// ---------------------------------------------------------------------------
type Wave = OscillatorType;

export class Sfx {
  private ctx: AudioContext | null = null;
  private muted = false;

  private ac(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      const AC =
        (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
          .AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      try {
        this.ctx = new AC();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  setMuted(m: boolean) {
    this.muted = m;
  }

  private tone(
    freq: number,
    dur: number,
    type: Wave,
    gain: number,
    slideTo?: number,
    delay = 0,
  ) {
    const ctx = this.ac();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** Bright ascending "coin" — correct catch. Pitch rises with combo. */
  coin(combo = 0) {
    const base = 660 + Math.min(combo, 8) * 45;
    this.tone(base, 0.09, "square", 0.18);
    this.tone(base * 1.5, 0.12, "square", 0.14, undefined, 0.06);
  }
  /** Dull buzzer — wrong catch. */
  buzz() {
    this.tone(150, 0.22, "sawtooth", 0.22, 70);
  }
  /** Soft whoosh — flap / jump. */
  blip() {
    this.tone(420, 0.08, "triangle", 0.14, 620);
  }
  /** Rising arpeggio — win. */
  win() {
    [523, 659, 784, 1047].forEach((f, i) =>
      this.tone(f, 0.16, "square", 0.16, undefined, i * 0.08),
    );
  }
  /** Descending tri-tone — lose. */
  lose() {
    [400, 320, 240].forEach((f, i) =>
      this.tone(f, 0.2, "sawtooth", 0.16, undefined, i * 0.1),
    );
  }
}

// ---------------------------------------------------------------------------
// Floating text — "+1", "PERFECT!", combo callouts that rise and fade.
// ---------------------------------------------------------------------------
interface FloatLabel {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  size: number;
  vy: number;
}

export class FloatingText {
  private items: FloatLabel[] = [];
  spawn(x: number, y: number, text: string, color: string, size = 22) {
    this.items.push({ x, y, text, color, life: 0.9, maxLife: 0.9, size, vy: -70 });
  }
  update(dt: number) {
    this.items = this.items.filter((f) => {
      f.life -= dt;
      f.y += f.vy * dt;
      f.vy *= 0.94;
      return f.life > 0;
    });
  }
  draw(ctx: CanvasRenderingContext2D) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const f of this.items) {
      const a = clamp(f.life / f.maxLife, 0, 1);
      const pop = easeOutBack(clamp((f.maxLife - f.life) / 0.18, 0, 1));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = `800 ${f.size * (0.7 + pop * 0.3)}px system-ui, sans-serif`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------
export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Vertical gradient fill for a full-canvas background. */
export function verticalGradient(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  top: string,
  bottom: string,
) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}
