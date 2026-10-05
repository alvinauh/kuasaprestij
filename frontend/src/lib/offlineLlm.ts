// offlineLlm.ts — main-thread interface to llm.worker.ts
//
// Creates the Web Worker lazily on first use, wraps message-passing in
// promises, and tracks model download progress for the UI.

import type { WorkerInMessage, WorkerOutMessage, OfflineQuestion, GeneratePayload } from "@/workers/llm.worker";

type ProgressCallback = (status: string, progress: number, loaded?: number, total?: number) => void;

let _worker: Worker | null = null;
let _ready = false;
const _pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();

function msgId(): string {
  return Math.random().toString(36).slice(2);
}

function getWorker(): Worker {
  if (!_worker) {
    // Vite resolves ?worker at build time — the worker gets its own bundle
    _worker = new Worker(new URL("@/workers/llm.worker.ts", import.meta.url), { type: "module" });
    _worker.addEventListener("message", (e: MessageEvent<WorkerOutMessage>) => {
      const msg = e.data;
      const pending = _pending.get(msg.id);
      if (!pending) return;
      if (msg.type === "result") {
        _pending.delete(msg.id);
        pending.resolve(msg.payload);
      } else if (msg.type === "error") {
        _pending.delete(msg.id);
        pending.reject(new Error(msg.payload));
      }
      // "progress" messages are forwarded via the callback stored at load time
    });
  }
  return _worker;
}

function send(msg: WorkerInMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    _pending.set(msg.id, { resolve, reject });
    getWorker().postMessage(msg);
  });
}

// ── Download / load model ─────────────────────────────────────────────────────

/** Total download for onnx-community/Qwen2.5-0.5B-Instruct q4 (model + tokenizer). */
export const OFFLINE_MODEL_BYTES = 800 * 1024 * 1024;

let _loadPromise: Promise<void> | null = null;

/** Throws a readable error when the browser can't hold the model. */
async function ensureStorage(): Promise<void> {
  if (typeof caches === "undefined") {
    throw new Error("This browser can't store offline files here (private window, or the page isn't on HTTPS).");
  }
  try {
    // Ask the browser not to evict ~800 MB the moment space gets tight.
    await navigator.storage?.persist?.();
    const est = await navigator.storage?.estimate?.();
    if (est?.quota != null && est.usage != null) {
      const free = est.quota - est.usage;
      if (free < OFFLINE_MODEL_BYTES) {
        const mb = (n: number) => Math.round(n / 1024 / 1024);
        throw new Error(`Not enough storage: needs ~${mb(OFFLINE_MODEL_BYTES)} MB, this browser allows ${mb(free)} MB.`);
      }
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Not enough storage")) throw e;
    /* estimate() unsupported — try the download anyway */
  }
}

export function loadOfflineModel(onProgress?: ProgressCallback): Promise<void> {
  if (_ready) return Promise.resolve();
  // A second caller (another card, or a generate) shares the in-flight download
  // instead of resolving immediately as if the model were ready.
  if (_loadPromise) return _loadPromise;

  const id = msgId();
  _loadPromise = ensureStorage().then(() => new Promise<void>((resolve, reject) => {
    const worker = getWorker();
    const listener = (e: MessageEvent<WorkerOutMessage>) => {
      if (e.data.id !== id) return;
      const msg = e.data;
      if (msg.type === "progress") {
        const { status, progress = 0, loaded, total } = msg.payload;
        // Per-file "progress" events reset to 0 for every shard; report the
        // overall "progress_total" so the bar moves forward once.
        if (status !== "progress") onProgress?.(status, progress, loaded, total);
        if (status === "ready") {
          worker.removeEventListener("message", listener);
          _ready = true;
          resolve();
        }
      } else if (msg.type === "error") {
        worker.removeEventListener("message", listener);
        reject(new Error(msg.payload));
      }
    };
    worker.addEventListener("message", listener);
    // Worker failed to start (e.g. module workers unsupported, script blocked)
    worker.addEventListener("error", (ev) => {
      worker.removeEventListener("message", listener);
      reject(new Error(ev.message || "The offline AI worker failed to start in this browser."));
    }, { once: true });

    const loadMsg: WorkerInMessage = { type: "load", id };
    worker.postMessage(loadMsg);
  })).catch((err) => {
    _loadPromise = null;          // allow a retry
    terminateOfflineLlm();
    throw err;
  });
  return _loadPromise;
}

// ── Check if model is already cached (no download needed) ────────────────────

export async function isModelCached(): Promise<boolean> {
  if (typeof caches === "undefined") return false;
  try {
    // The cache name alone isn't proof: an interrupted download leaves it behind
    // with only the small config files. Require the ONNX weights themselves.
    if (!(await caches.has("transformers-cache"))) return false;
    const cache = await caches.open("transformers-cache");
    const reqs = await cache.keys();
    return reqs.some((r) => r.url.includes("Qwen2.5-0.5B-Instruct") && r.url.includes("model_q4.onnx"));
  } catch {
    return false;
  }
}

// ── Generate a question offline ───────────────────────────────────────────────

export async function generateOfflineQuestion(
  params: GeneratePayload,
  onProgress?: ProgressCallback,
): Promise<OfflineQuestion> {
  if (!_ready) {
    await loadOfflineModel(onProgress);
  }
  const id = msgId();
  const msg: WorkerInMessage = { type: "generate", id, payload: params };
  return send(msg) as Promise<OfflineQuestion>;
}

// ── Teardown (call on unmount if needed) ─────────────────────────────────────

export function terminateOfflineLlm(): void {
  _worker?.terminate();
  _worker = null;
  _ready = false;
  _loadPromise = null;
  _pending.clear();
}
