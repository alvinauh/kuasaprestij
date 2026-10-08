/** Shared Kaplay engine for the canvas games (Answer-Flappy, Play mode).
 *
 *  WHY A SINGLETON. Kaplay is a global singleton that spins up a fresh WebGL
 *  context and re-loads its bitmap font atlas every time kaplay() is called.
 *  Its internal `initialized` reference is never cleared, so each React
 *  remount (a new round, a new penalty, a replay) re-invokes kaplay(), which
 *  double-quits the previous instance and races the async font-atlas load on
 *  the shared singleton. After a handful of remounts the atlas is left in a
 *  bad state and every on-canvas letter renders as a blank/garbled black
 *  smear — the "questions blanked out in the game" bug.
 *
 *  THE FIX. Initialise Kaplay exactly once, on a detached canvas, and reuse it.
 *  Each game builds its world inside a Kaplay *scene*; switching scenes tears
 *  down that scene's objects, timers, and input handlers without ever
 *  re-initialising the engine — so the font atlas loads a single time and
 *  stays intact for the life of the page. */

// Every Kaplay game in this app shares these dimensions.
export const GAME_W = 360;
export const GAME_H = 480;

import type { KAPLAYCtx } from "kaplay";

// The full Kaplay context (add/rect/pos/scene/go/…) so callers keep real typing.
type KaplayCtx = KAPLAYCtx;

const IDLE_SCENE = "__idle__";

let importPromise: Promise<typeof import("kaplay")> | null = null;
let ctx: KaplayCtx | null = null;
let sharedCanvas: HTMLCanvasElement | null = null;

/** Get the one shared Kaplay context + its detached canvas, initialising on
 *  first use. Callers move the canvas into their container and register a
 *  scene. */
export async function acquireKaplay(): Promise<{ k: KaplayCtx; canvas: HTMLCanvasElement }> {
  if (!importPromise) importPromise = import("kaplay");
  const kaplay = (await importPromise).default;
  if (!ctx || !sharedCanvas) {
    sharedCanvas = document.createElement("canvas");
    ctx = kaplay({
      canvas: sharedCanvas,
      width: GAME_W,
      height: GAME_H,
      // Base background is repainted per-scene with a full-canvas rect, so the
      // value here is irrelevant.
      background: [0, 0, 0],
      global: false,
      touchToMouse: true,
      crisp: false,
      pixelDensity: Math.min(2, window.devicePixelRatio || 1),
    }) as unknown as KaplayCtx;
    ctx.scene(IDLE_SCENE, () => {});
    ctx.go(IDLE_SCENE);
  }
  return { k: ctx, canvas: sharedCanvas };
}

/** Park the shared engine on an empty scene, tearing down the active game's
 *  objects / timers / handlers WITHOUT quitting (quitting would corrupt the
 *  font atlas for the next game). Safe to call before init (no-op). */
export function parkKaplay() {
  try {
    ctx?.go(IDLE_SCENE);
  } catch {
    /* not initialised yet */
  }
}
