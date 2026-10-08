// offlinePacks.ts — the downloadable question bank behind offline practice.
//
// Downloads every cached MCQ (topic_anchors: anchor_question + question_bank) into
// IndexedDB, then serves and marks questions with no internet. Marking uses the
// stored answer key; the server re-marks each answer when the queue syncs, so
// mastery stays server-owned.

import { supabase } from "@/integrations/supabase/client";
import {
  replacePackQuestions,
  getPackQuestions,
  getAllPackQuestions,
  kvGet,
  kvSet,
  type PackQuestion,
} from "./offlineDb";

/** True in the installable offline build (cloudbuild-offline.yaml sets it). */
export const IS_OFFLINE_APP = import.meta.env.VITE_OFFLINE_APP === "1";

/** Where the main site sends people to install the offline app. */
export const OFFLINE_APP_URL =
  (import.meta.env.VITE_OFFLINE_APP_URL as string | undefined) ??
  "https://kuasaprestij-offline-746801891568.asia-southeast1.run.app";

// topic_anchors isn't in the generated Supabase types (it's a backend table).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// Subject names drift between BM and EN ("Biologi" / "Biology"); both map to one key.
const SUBJECT_ALIASES: Record<string, string> = {
  biologi: "biology",
  kimia: "chemistry",
  fizik: "physics",
  matematik: "mathematics",
  "matematik tambahan": "additional mathematics",
  sains: "science",
  sejarah: "history",
  geografi: "geography",
};

export function subjectKey(subject: string): string {
  const s = (subject ?? "").trim().toLowerCase();
  return SUBJECT_ALIASES[s] ?? s;
}

export function languageKey(language: string): string {
  const l = (language ?? "").trim().toLowerCase();
  if (["en", "english", "bahasa inggeris"].includes(l)) return "en";
  if (["ms", "bm", "malay", "bahasa melayu", "bahasa malaysia"].includes(l)) return "ms";
  if (["zh", "chinese", "mandarin", "bahasa cina", "中文"].includes(l)) return "zh";
  return l;
}

// ── Download ────────────────────────────────────────────────────────────────

export interface PackInfo {
  downloaded_at: number;
  questions: number;
  subjects: { subject: string; questions: number }[];
}

const PACK_INFO_KEY = "pack_info";

interface AnchorRow {
  id: string;
  subject: string | null;
  topic: string | null;
  language: string | null;
  form_level: number | null;
  anchor_question: Record<string, unknown> | null;
  question_bank: unknown;
  mnemonic_lyrics: string | null;
  worked_example: string | null;
}

/** Only 4-option MCQs whose answer key matches an option can be marked offline. */
function usableMcq(q: unknown): q is Record<string, unknown> {
  if (!q || typeof q !== "object") return false;
  const d = q as Record<string, unknown>;
  const type = (d.question_type as string | undefined) ?? "mcq";
  if (type !== "mcq") return false;
  const opts = d.options;
  if (!Array.isArray(opts) || opts.length !== 4 || !opts.every((o) => typeof o === "string" && o.trim())) return false;
  if (typeof d.question !== "string" || !d.question.trim()) return false;
  return resolveCorrectIndex(d) !== null;
}

function resolveCorrectIndex(d: Record<string, unknown>): number | null {
  const opts = d.options as string[];
  const raw = String(d.correct_answer ?? "").trim();
  if (!raw) return null;
  const exact = opts.findIndex((o) => o.trim().toLowerCase() === raw.toLowerCase());
  if (exact >= 0) return exact;
  // "B", "B)", "B." — not "A ball…", which is answer text that happens to start with A.
  const letter = raw.toUpperCase().match(/^\(?([A-D])(?:[).:]|$)/);
  if (letter) return "ABCD".indexOf(letter[1]);
  return null;
}

export async function downloadQuestionPack(
  onProgress?: (msg: string) => void,
): Promise<PackInfo> {
  onProgress?.("Downloading questions…");
  const rows: AnchorRow[] = [];
  // Page past PostgREST's 1000-row cap.
  for (let from = 0; ; from += 500) {
    const { data, error } = await db
      .from("topic_anchors")
      .select("id,subject,topic,language,form_level,anchor_question,question_bank,mnemonic_lyrics,worked_example")
      .order("id")
      .range(from, from + 499);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as unknown as AnchorRow[]));
    if (!data || data.length < 500) break;
  }

  const items: PackQuestion[] = [];
  const seenText = new Set<string>();
  for (const row of rows) {
    if (!row.subject || !row.topic) continue;
    const bank = Array.isArray(row.question_bank) ? row.question_bank : [];
    const all = [row.anchor_question, ...bank];
    all.forEach((q, i) => {
      if (!usableMcq(q)) return;
      const text = (q.question as string).trim();
      const dedupeKey = `${subjectKey(row.subject!)}|${languageKey(row.language ?? "")}|${text}`;
      if (seenText.has(dedupeKey)) return;
      seenText.add(dedupeKey);
      items.push({
        id: `${row.id}#${i}`,
        subject: row.subject!,
        subject_key: subjectKey(row.subject!),
        topic: row.topic!,
        language: row.language ?? "",
        language_key: languageKey(row.language ?? ""),
        form_level: row.form_level,
        draft: { ...q, topic: row.topic, subject: row.subject, question_type: "mcq" },
        mnemonic_lyrics: row.mnemonic_lyrics,
        worked_example: row.worked_example,
      });
    });
  }
  if (!items.length) throw new Error("No questions were available to download.");

  onProgress?.(`Saving ${items.length} questions…`);
  await replacePackQuestions(items);

  const bySubject = new Map<string, number>();
  for (const it of items) bySubject.set(it.subject, (bySubject.get(it.subject) ?? 0) + 1);
  const info: PackInfo = {
    downloaded_at: Date.now(),
    questions: items.length,
    subjects: [...bySubject.entries()]
      .map(([subject, questions]) => ({ subject, questions }))
      .sort((a, b) => a.subject.localeCompare(b.subject)),
  };
  await kvSet(PACK_INFO_KEY, info);
  return info;
}

export async function getPackInfo(): Promise<PackInfo | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    return (await kvGet<PackInfo>(PACK_INFO_KEY)) ?? null;
  } catch {
    return null;
  }
}

// ── Serve ───────────────────────────────────────────────────────────────────

const SEEN_KEY = "kp_offline_seen";

function readSeen(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function markSeen(id: string) {
  try {
    const seen = readSeen().filter((s) => s !== id);
    seen.push(id);
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen.slice(-300)));
  } catch { /* storage blocked: repeats are acceptable */ }
}

/**
 * Pick a question for this subject/topic in the student's language. Falls back to
 * other topics in the subject, then to English. Unseen questions first.
 */
export async function pickOfflineQuestion(
  subject: string,
  topic: string,
  language: string,
): Promise<PackQuestion | null> {
  if (typeof indexedDB === "undefined") return null;
  const sk = subjectKey(subject);
  const lk = languageKey(language);
  let pool = await getPackQuestions(sk, lk);
  if (!pool.length && lk !== "en") pool = await getPackQuestions(sk, "en");
  if (!pool.length) return null;

  const t = (topic ?? "").trim().toLowerCase();
  const sameTopic = pool.filter((q) => q.topic.trim().toLowerCase() === t);
  const candidates = sameTopic.length ? sameTopic : pool;

  const seen = new Set(readSeen());
  const fresh = candidates.filter((q) => !seen.has(q.id));
  const from = fresh.length ? fresh : candidates;
  const pick = from[Math.floor(Math.random() * from.length)];
  markSeen(pick.id);
  return pick;
}

/** Subjects + topics available offline, for the subject picker when /subjects can't load. */
export async function packSubjects(): Promise<{ subject: string; topics: string[] }[]> {
  if (typeof indexedDB === "undefined") return [];
  const all = await getAllPackQuestions();
  const map = new Map<string, Set<string>>();
  for (const q of all) {
    if (!map.has(q.subject)) map.set(q.subject, new Set());
    map.get(q.subject)!.add(q.topic);
  }
  return [...map.entries()].map(([subject, topics]) => ({ subject, topics: [...topics].sort() }));
}

// ── Mark ────────────────────────────────────────────────────────────────────

export interface OfflineVerdict {
  correct: boolean;
  correct_answer: string;
  feedback: string;
}

/** Mark an MCQ against its stored key. `answer` may be a letter or the option text. */
export function markOffline(draft: Record<string, unknown>, answer: string, isBM: boolean): OfflineVerdict | null {
  if (!usableMcq(draft)) return null;
  const opts = draft.options as string[];
  const correctIdx = resolveCorrectIndex(draft)!;
  const raw = (answer ?? "").trim();
  let chosen = opts.findIndex((o) => o.trim().toLowerCase() === raw.toLowerCase());
  if (chosen < 0 && /^[A-D]$/i.test(raw)) chosen = "ABCD".indexOf(raw.toUpperCase());
  const correct = chosen === correctIdx;
  const correctText = opts[correctIdx];

  const rationale = draft.distractor_rationale as Record<string, string> | undefined;
  const notes = typeof draft.illustrative_notes === "string" ? draft.illustrative_notes : "";
  const why = chosen >= 0 && !correct ? rationale?.[opts[chosen]] : undefined;
  const offlineNote = isBM
    ? "Ditanda di peranti ini. Akan diselaraskan bila ada internet."
    : "Marked on this device. It syncs when you're back online.";
  const feedback = correct
    ? [isBM ? "Betul!" : "Correct!", notes, offlineNote].filter(Boolean).join("\n\n")
    : [
        isBM ? `Jawapan betul: ${correctText}` : `The answer is: ${correctText}`,
        why ?? notes,
        offlineNote,
      ].filter(Boolean).join("\n\n");
  return { correct, correct_answer: correctText, feedback };
}
