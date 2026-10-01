// llm.worker.ts — offline question generation via Transformers.js (WASM)
//
// Runs in a Web Worker thread so inference never blocks the UI.
// Model: onnx-community/Qwen2.5-0.5B-Instruct (q4, ~300 MB)
//   - Supports BM / EN / ZH natively
//   - Downloads once from HuggingFace CDN, cached in browser Cache Storage
//   - Subsequent uses: instant local inference, no network needed

import { pipeline, env, TextGenerationPipeline } from "@huggingface/transformers";

// Keep model files in browser Cache Storage (persists across sessions).
// Never fall back to re-downloading on every page load.
env.useBrowserCache = true;
env.allowRemoteModels = true;

const MODEL_ID = "onnx-community/Qwen2.5-0.5B-Instruct";
const DTYPE = "q4";

let generator: TextGenerationPipeline | null = null;

// ── Message protocol ──────────────────────────────────────────────────────────
// Main thread sends:  { type: "load" | "generate" | "cancel", id, payload }
// Worker replies:     { type: "progress" | "result" | "error",  id, payload }

export type WorkerInMessage =
  | { type: "load"; id: string }
  | { type: "generate"; id: string; payload: GeneratePayload }

export interface GeneratePayload {
  topic: string;
  subject: string;
  language: string;
  kbat_level: string;
}

export type WorkerOutMessage =
  | { type: "progress"; id: string; payload: { status: string; progress?: number; loaded?: number; total?: number } }
  | { type: "result"; id: string; payload: OfflineQuestion }
  | { type: "error"; id: string; payload: string }

export interface OfflineQuestion {
  question: string;
  options: string[];
  correct_answer: string;
  kbat_level: string;
  source: "offline_llm";
}

function reply(msg: WorkerOutMessage) {
  self.postMessage(msg);
}

// ── Model loading ─────────────────────────────────────────────────────────────

async function loadModel(id: string) {
  try {
    reply({ type: "progress", id, payload: { status: "loading", progress: 0 } });
    generator = await pipeline("text-generation", MODEL_ID, {
      dtype: DTYPE,
      device: "wasm",
      progress_callback: (p: { status: string; progress?: number; loaded?: number; total?: number }) => {
        reply({ type: "progress", id, payload: p });
      },
    }) as TextGenerationPipeline;
    reply({ type: "progress", id, payload: { status: "ready", progress: 100 } });
  } catch (err) {
    reply({ type: "error", id, payload: String(err) });
  }
}

// ── Question generation ───────────────────────────────────────────────────────

const LANG_INSTRUCTION: Record<string, string> = {
  English: "Write the question and all options in English.",
  "Bahasa Melayu": "Tulis soalan dan semua pilihan jawapan dalam Bahasa Melayu.",
  Mandarin: "用中文写题目和所有选项。",
};

const KBAT_DESC: Record<string, string> = {
  Memahami: "C2 Understanding — explain, summarise, classify",
  Mengaplikasi: "C3 Applying — use concept in a new situation, solve",
  Menganalisis: "C4 Analysing — break down, distinguish cause and effect",
  Menilai: "C5 Evaluating — judge, justify, critique",
};

function buildPrompt(p: GeneratePayload): string {
  const langInstr = LANG_INSTRUCTION[p.language] ?? LANG_INSTRUCTION["English"];
  const kbatDesc = KBAT_DESC[p.kbat_level] ?? KBAT_DESC["Memahami"];
  return `<|im_start|>system
You are a Malaysian high school exam question generator for the KSSM syllabus.
Generate exactly ONE multiple-choice question. Output ONLY valid JSON, no explanation.
${langInstr}
KBAT cognitive level: ${kbatDesc}
<|im_end|>
<|im_start|>user
Generate a KSSM ${p.subject} MCQ about: ${p.topic}

Output this JSON structure (no markdown, no extra text):
{"question":"<question text>","options":["A. <option>","B. <option>","C. <option>","D. <option>"],"correct_answer":"A","kbat_level":"${p.kbat_level}"}
<|im_end|>
<|im_start|>assistant
`;
}

function extractJson(raw: string): OfflineQuestion | null {
  // Strip markdown fences and leading text before the first {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    const obj = JSON.parse(raw.slice(start, end + 1));
    if (
      typeof obj.question === "string" &&
      Array.isArray(obj.options) &&
      obj.options.length >= 2 &&
      typeof obj.correct_answer === "string"
    ) {
      // Normalise options to plain strings (strip "A. " prefix if present)
      const opts: string[] = obj.options.map((o: string) =>
        o.replace(/^[A-D][.)]\s*/u, "").trim()
      );
      return {
        question: obj.question.trim(),
        options: opts,
        correct_answer: obj.correct_answer.replace(/^[A-D][.)]\s*/u, "").trim(),
        kbat_level: obj.kbat_level ?? "Memahami",
        source: "offline_llm",
      };
    }
  } catch {
    // fall through
  }
  return null;
}

async function generateQuestion(id: string, payload: GeneratePayload) {
  if (!generator) {
    reply({ type: "error", id, payload: "Model not loaded. Call load first." });
    return;
  }
  try {
    reply({ type: "progress", id, payload: { status: "generating" } });
    const prompt = buildPrompt(payload);
    const output = await generator(prompt, {
      max_new_tokens: 300,
      temperature: 0.7,
      do_sample: true,
      repetition_penalty: 1.1,
    });

    const generated = Array.isArray(output)
      ? (output[0] as { generated_text: string }).generated_text
      : "";
    // Slice off the prompt prefix — only keep what the model added
    const newText = generated.slice(prompt.length).trim();
    const question = extractJson(newText);

    if (!question) {
      reply({ type: "error", id, payload: `Could not parse model output: ${newText.slice(0, 200)}` });
      return;
    }
    reply({ type: "result", id, payload: question });
  } catch (err) {
    reply({ type: "error", id, payload: String(err) });
  }
}

// ── Event loop ────────────────────────────────────────────────────────────────

self.addEventListener("message", (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data;
  if (msg.type === "load") void loadModel(msg.id);
  else if (msg.type === "generate") void generateQuestion(msg.id, msg.payload);
});
