// slm/index.ts — offline AI tasks backed by the fine-tuned Skor SLM (GGUF via llama.cpp).
//
// Use it only where it beats the stored answer key (see slm/field_test_v2/RESULTS.md):
//   - tutorTurn          SEDA hint in a chat (the tutor knows the key and must not reveal it)
//   - evaluateWritten    short written answers, which can't be marked by key
//   - gradeEssay         provisional band/score + strengths/improvements
// MCQs stay on markOffline() (stored key + distractor rationale). Never generate questions
// for students offline: the generator's keys were wrong ~50% of the time in field tests.
// Every result is provisional; /submit_answer re-marks it when the queue syncs.

import { kvGet, kvSet } from "@/lib/offlineDb";
import {
  ERROR_CATEGORIES, SYSTEM, cardText, essayUser, evaluatorUser, slmLang, tutorMessages,
  type FactCard, type McqFields, type SlmLang,
} from "./prompts";
import { getSlmRuntime } from "./runtime";

export { getSlmRuntime } from "./runtime";
export { slmLang } from "./prompts";

// ── GBNF grammars: syntax only; values are still checked below ─────────────────
const STR = `string ::= "\\"" char{1,600} "\\""
char   ::= [^"\\\\\\x7F\\x00-\\x1F] | "\\\\" ( ["\\\\/bfnrt] | "u" [0-9a-fA-F]{4} )
ws     ::= | " " | "\\n" [ \\t]{0,8}`;

const GRAMMAR = {
  tutor: `root ::= "{" ws "\\"seda_move\\":" ws move "," ws "\\"reply\\":" ws string ws "}"
move ::= "\\"invite_reasoning\\"" | "\\"explain_reasoning\\"" | "\\"build_on_ideas\\""
${STR}`,
  evaluator: `root ::= "{" ws "\\"student_feedback\\":" ws string "," ws "\\"teacher_insight\\":" ws "{" ws "\\"error_category\\":" ws cat "," ws "\\"root_cause_analysis\\":" ws string "," ws "\\"actionable_intervention\\":" ws string ws "}" ws "}"
cat ::= "\\"Conceptual Gap\\"" | "\\"Careless Error\\"" | "\\"Language Barrier\\"" | "\\"None\\""
${STR}`,
  essay_pass1: `root  ::= "{" ws "\\"band\\":" ws band "," ws "\\"score\\":" ws score ws "}"
band  ::= "\\"A\\"" | "\\"B\\"" | "\\"C\\"" | "\\"D\\""
score ::= "100" | [1-9] [0-9] | [0-9]
ws    ::= | " " | "\\n" [ \\t]{0,8}`,
  essay_pass2: `root ::= "{" ws "\\"strengths\\":" ws list "," ws "\\"improvements\\":" ws list ws "}"
list ::= "[" ws string ( "," ws string ){0,4} ws "]"
${STR}`,
};

function parse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// ── Fact cards ─────────────────────────────────────────────────────────────────
const CARDS_KEY = "slm_fact_cards";
let _cards: Record<string, FactCard | null> | null = null;

/** Fact cards ship as /offline/fact_cards.json (precached) and are kept in IndexedDB. */
async function factCards(): Promise<Record<string, FactCard | null>> {
  if (_cards) return _cards;
  _cards = (await kvGet<Record<string, FactCard | null>>(CARDS_KEY).catch(() => undefined)) ?? null;
  if (!_cards) {
    try {
      _cards = await fetch("/offline/fact_cards.json").then((r) => r.json());
      await kvSet(CARDS_KEY, _cards);
    } catch {
      _cards = {};
    }
  }
  return _cards!;
}

/** Card text for a topic; form is optional (any form's card for that subject+topic will do). */
export async function contextFor(subject: string, topic: string, lang: SlmLang, form?: number | null): Promise<string> {
  const cards = await factCards();
  const s = subject.trim().toLowerCase(), t = topic.trim().toLowerCase();
  let fallback: FactCard | null = null;
  for (const [key, card] of Object.entries(cards)) {
    if (!card) continue;
    const [ks, kf, kt] = key.split("|");
    if (ks.toLowerCase() !== s || kt.toLowerCase() !== t) continue;
    if (form != null && kf === String(form)) return cardText(card, lang);
    fallback ??= card;
  }
  return cardText(fallback, lang);
}

// ── Tasks ──────────────────────────────────────────────────────────────────────
export interface TutorTurn { seda_move: string; reply: string }

export async function tutorTurn(
  q: McqFields & { options: string[]; language: string; form?: number | null },
  history: { student: string; reply: TutorTurn }[],
  studentMessage: string,
): Promise<(TutorTurn & { modelVersion: string }) | null> {
  const rt = await getSlmRuntime();
  if (!rt) return null;
  const lang = slmLang(q.language);
  const context = q.context ?? (await contextFor(q.subject, q.topic, lang, q.form));
  const out = parse<TutorTurn>(await rt.complete(
    tutorMessages({ ...q, context }, history, studentMessage), { grammar: GRAMMAR.tutor, maxTokens: 220 }));
  // Last line of defence against the field-test failure: never show the key itself.
  if (!out?.reply || out.reply.toLowerCase().includes(q.correct_answer.trim().toLowerCase())) return null;
  return { ...out, modelVersion: rt.modelVersion };
}

export interface WrittenVerdict {
  student_feedback: string;
  teacher_insight: { error_category: string; root_cause_analysis: string; actionable_intervention: string };
  is_correct: boolean;
  modelVersion: string;
}

export async function evaluateWritten(
  q: Omit<McqFields, "options"> & { language: string; form?: number | null; student_answer: string },
): Promise<WrittenVerdict | null> {
  const rt = await getSlmRuntime();
  if (!rt) return null;
  const lang = slmLang(q.language);
  const context = q.context ?? (await contextFor(q.subject, q.topic, lang, q.form));
  const out = parse<Omit<WrittenVerdict, "is_correct" | "modelVersion">>(await rt.complete(
    [{ role: "system", content: SYSTEM.evaluator }, { role: "user", content: evaluatorUser({ ...q, context }) }],
    { grammar: GRAMMAR.evaluator, maxTokens: 400 }));
  if (!out?.student_feedback || !out.teacher_insight) return null;
  const cat = out.teacher_insight.error_category;
  if (cat !== "None" && !(ERROR_CATEGORIES as readonly string[]).includes(cat)) return null;
  return { ...out, is_correct: cat === "None", modelVersion: rt.modelVersion };
}

export interface EssayGrade {
  band: "A" | "B" | "C" | "D";
  score: number;
  strengths: string[];
  improvements: string[];
  modelVersion: string;
}

const BAND_RANGE: Record<EssayGrade["band"], [number, number]> = { A: [80, 100], B: [65, 79], C: [50, 64], D: [0, 49] };

export async function gradeEssay(title: string, essay: string, language: string): Promise<EssayGrade | null> {
  const rt = await getSlmRuntime();
  if (!rt) return null;
  const user = essayUser(title, slmLang(language), essay);
  const p1 = parse<{ band: EssayGrade["band"]; score: number }>(await rt.complete(
    [{ role: "system", content: SYSTEM.essay_pass1 }, { role: "user", content: user }],
    { grammar: GRAMMAR.essay_pass1, maxTokens: 30 }));
  if (!p1) return null;
  const [lo, hi] = BAND_RANGE[p1.band];
  const score = Math.min(hi, Math.max(lo, p1.score));   // keep band and score consistent
  const p2 = parse<{ strengths: string[]; improvements: string[] }>(await rt.complete(
    [{ role: "system", content: SYSTEM.essay_pass2 }, { role: "user", content: user }],
    { grammar: GRAMMAR.essay_pass2, maxTokens: 500 }));
  if (!p2) return null;
  return { band: p1.band, score, strengths: p2.strengths, improvements: p2.improvements, modelVersion: rt.modelVersion };
}
