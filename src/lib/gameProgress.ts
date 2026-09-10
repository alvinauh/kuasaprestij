// Client-side game-feel math for the Shorts question feed.
// XP/level and speed bonus are computed on the client; correctness/base points
// still come from the backend (/submit_answer).

export const XP_PER_LEVEL = 500;
export const QUESTION_SECONDS = 20;
export const MAX_SPEED_BONUS = 50;

export function levelFromXp(xp: number): number {
  return 1 + Math.floor(Math.max(0, xp) / XP_PER_LEVEL);
}

export function xpProgress(xp: number): { level: number; into: number; pct: number } {
  const safe = Math.max(0, xp);
  const into = safe % XP_PER_LEVEL;
  return { level: levelFromXp(safe), into, pct: into / XP_PER_LEVEL };
}

/** Bonus points for answering quickly (0 when time is up). */
export function speedBonus(secondsLeft: number): number {
  const frac = Math.max(0, Math.min(1, secondsLeft / QUESTION_SECONDS));
  return Math.round(frac * MAX_SPEED_BONUS);
}

/** Total points for a correct answer: backend base (or fallback) + streak + speed. */
export function totalPoints(basePoints: number | null | undefined, streak: number, secondsLeft: number): number {
  const base = typeof basePoints === "number" && basePoints > 0 ? basePoints : 100;
  return base + Math.max(0, streak) * 10 + speedBonus(secondsLeft);
}
