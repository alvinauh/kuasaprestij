import type { SessionResponse } from "@/services/api";
import type { GameChallenge } from "@/components/games/CatchStarsGame";

const LETTERS = ["A", "B", "C", "D"] as const;
type Letter = (typeof LETTERS)[number];

/** Core builder: resolve the correct letter from an explicit answer string
 *  (letter OR option-text match). Returns null unless it's a complete MCQ. */
export function buildChallengeFrom(
  question: string | undefined,
  options: { A: string; B: string; C: string; D: string } | undefined,
  correctRaw: string | null | undefined,
  questionType?: string,
  extra?: Partial<GameChallenge>,
): GameChallenge | null {
  if (questionType && questionType !== "mcq") return null;
  if (!question || !options || !LETTERS.every((l) => options[l])) return null;

  const raw = (correctRaw ?? "").trim();
  if (!raw) return null;
  let correctLetter: Letter | null = null;
  const up = raw.toUpperCase();
  // 1) bare letter: "A"
  if ((LETTERS as readonly string[]).includes(up)) {
    correctLetter = up as Letter;
  }
  // 2) leading-letter prefix: "A)", "A.", "A -", "(A)"  (common LLM formatting)
  if (!correctLetter) {
    const m = up.match(/^\(?([A-D])[).\-:\s]/);
    if (m) correctLetter = m[1] as Letter;
  }
  // 3) exact option-text match
  if (!correctLetter) {
    correctLetter =
      LETTERS.find(
        (l) => (options[l] ?? "").trim().toLowerCase() === raw.toLowerCase(),
      ) ?? null;
  }
  // 4) tolerant match: option contains raw or vice versa (prefix/format drift)
  if (!correctLetter) {
    const rl = raw.toLowerCase();
    correctLetter =
      LETTERS.find((l) => {
        const o = (options[l] ?? "").trim().toLowerCase();
        return o.length > 0 && (o.includes(rl) || rl.includes(o));
      }) ?? null;
  }
  if (!correctLetter) return null;

  return { question, options, correctLetter, ...extra };
}

/** Derive a challenge from a session object. NOTE: the backend strips
 *  `correct_answer` from /start_session payloads, so `session.correct` is
 *  usually empty in the live feed — prefer buildChallengeFrom() with the
 *  correct answer from the submit-answer feedback. Kept for the /gametest
 *  harness and any caller that already has the answer on the session. */
export function buildChallenge(session: SessionResponse | null): GameChallenge | null {
  if (!session) return null;
  return buildChallengeFrom(
    session.question,
    session.options,
    session.correct,
    session.question_type ?? "mcq",
  );
}
