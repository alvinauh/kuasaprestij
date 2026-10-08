/**
 * Games that can run as a Live Arena battle: endless (no win goal), report a running
 * score, and end a run on a crash so the player can go again. Keep in sync with
 * LIVE_GAMES in the backend (app/main.py).
 */
export interface LiveGameInfo {
  id: string;
  emoji: string;
  name: string;
  /** One line for the setup screen, the projector and the student's phone. */
  howTo: string;
  /** What the score counts, e.g. "cacti". */
  unit: string;
  /** Shown when a run ends. */
  endedAt: string;
}

export const LIVE_GAMES: LiveGameInfo[] = [
  { id: "dino", emoji: "🦕", name: "Dino Run", howTo: "Tap to jump over the cacti. Best run wins.", unit: "cacti", endedAt: "Crashed at" },
  { id: "flappy", emoji: "🐦", name: "Flappy Bird", howTo: "Slide your thumb to fly through the pipes. Best run wins.", unit: "pipes", endedAt: "Crashed at" },
  { id: "catch", emoji: "⭐", name: "Catch Stars", howTo: "Slide the basket to catch stars and dodge the bombs (3 lives). Best run wins.", unit: "stars", endedAt: "Out of lives at" },
];

export function liveGame(id?: string | null): LiveGameInfo {
  return LIVE_GAMES.find((g) => g.id === id) ?? LIVE_GAMES[0];
}
