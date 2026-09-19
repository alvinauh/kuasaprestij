// Shared contract for the writing-native mini-games (sentence builder + connector
// catch). Essays have no correct-letter, so instead of the MCQ reaction games we
// reinforce writing mechanics: word order and cohesive devices.

export interface WritingConnector {
  before: string;
  after: string;
  answer: string;
  distractors: string[];
}

export interface WritingChallenge {
  sentence: string;
  tokens: string[];
  connector: WritingConnector;
  subject?: string;
  topic?: string;
  language?: string;
}

/** Fisher–Yates shuffle that guarantees the result differs from the input when
 *  possible (so a Sentence Builder never spawns already-solved). */
export function shuffled<T>(arr: T[]): T[] {
  if (arr.length < 2) return [...arr];
  let out = [...arr];
  for (let attempt = 0; attempt < 6; attempt++) {
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    if (out.some((v, i) => v !== arr[i])) break;
    out = [...arr];
  }
  return out;
}

export type WritingGameType = "sentence_builder" | "connector_catch";

/** Mirror of the backend `_language_composition_spec` detection: is this topic a
 *  free/guided composition (BM karangan / 华文 作文 / English writing)? Such questions
 *  have no correct-letter, so their penalty game is a writing-native game. */
export function isWritingComposition(subject?: string, topic?: string): boolean {
  const s = (subject ?? "").trim();
  const t = (topic ?? "").trim();
  if (s === "Bahasa Melayu") return t.includes("Penulisan Karangan");
  if (s === "Bahasa Cina")
    return ["Menulis", "Penulisan", "Karangan", "作文"].some((k) => t.includes(k));
  if (s === "Bahasa Inggeris")
    return t.includes("Continuous Writing") || t.includes("Directed Writing");
  return false;
}
