// offlineLlm.ts — main-thread interface to llm.worker.ts
//
// Creates the Web Worker lazily on first use, wraps message-passing in
// promises, and tracks model download progress for the UI.

import type { WorkerInMessage, WorkerOutMessage, OfflineQuestion, GeneratePayload } from "@/workers/llm.worker";

type ProgressCallback = (status: string, progress: number, loaded?: number, total?: number) => void;

let _worker: Worker | null = null;
let _ready = false;
let _loading = false;
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

export async function loadOfflineModel(onProgress?: ProgressCallback): Promise<void> {
  if (_ready) return;
  if (_loading) return; // already in flight

  _loading = true;
  const id = msgId();

  return new Promise((resolve, reject) => {
    const worker = getWorker();
    _pending.set(id, {
      resolve: () => { /* result not expected on load */ },
      reject,
    });

    // Override progress handling for this load call
    const listener = (e: MessageEvent<WorkerOutMessage>) => {
      if (e.data.id !== id) return;
      const msg = e.data;
      if (msg.type === "progress") {
        const { status, progress = 0, loaded, total } = msg.payload;
        onProgress?.(status, progress, loaded, total);
        if (status === "ready") {
          worker.removeEventListener("message", listener);
          _pending.delete(id);
          _ready = true;
          _loading = false;
          resolve();
        }
      } else if (msg.type === "error") {
        worker.removeEventListener("message", listener);
        _pending.delete(id);
        _loading = false;
        reject(new Error(msg.payload));
      }
    };
    worker.addEventListener("message", listener);

    const loadMsg: WorkerInMessage = { type: "load", id };
    worker.postMessage(loadMsg);
  });
}

// ── Check if model is already cached (no download needed) ────────────────────

export async function isModelCached(): Promise<boolean> {
  if (typeof caches === "undefined") return false;
  try {
    // Transformers.js stores model shards under the transformers-cache key
    const keys = await caches.keys();
    return keys.some((k) => k.includes("transformers"));
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
  _loading = false;
  _pending.clear();
}
