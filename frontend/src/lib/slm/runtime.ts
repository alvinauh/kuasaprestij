// runtime.ts — where the fine-tuned GGUF model runs. One interface, picked per device:
//
//   native   Android APK: Capacitor plugin "SkorLlm" wrapping llama.cpp (model in app storage)
//   desktop  Windows/Linux app or lab PC: llama-server (llama.cpp) on 127.0.0.1, started by the
//            desktop wrapper or slm/serve.sh; OpenAI-style /v1/chat/completions with a GBNF grammar
//   none     plain browser: no offline AI (questions still work from the pack, marked by key)
//
// The old in-browser ONNX 0.5B worker (offlineLlm.ts) stays as the last fallback for hints only.

import type { ChatMessage } from "./prompts";

export interface CompleteOptions {
  grammar?: string;      // GBNF; forces valid JSON for small models
  maxTokens?: number;
  temperature?: number;
}

export interface SlmRuntime {
  name: "native" | "desktop";
  modelVersion: string;
  complete(messages: ChatMessage[], opts?: CompleteOptions): Promise<string>;
}

/** Contract for the Android plugin (to be implemented in Java/Kotlin over llama.cpp's JNI). */
interface SkorLlmPlugin {
  status(): Promise<{ loaded: boolean; modelVersion?: string }>;
  load(opts: { path?: string; threads?: number }): Promise<{ modelVersion: string }>;
  complete(opts: { messages: ChatMessage[]; grammar?: string; maxTokens: number; temperature: number }):
    Promise<{ text: string }>;
}

const DESKTOP_URL = (import.meta.env.VITE_SLM_URL as string | undefined) ?? "http://127.0.0.1:8088";

function nativePlugin(): SkorLlmPlugin | null {
  // No @capacitor/core dependency needed: the APK's bridge exposes registered plugins here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cap = (globalThis as any).Capacitor;
  return cap?.isNativePlatform?.() && cap?.Plugins?.SkorLlm ? (cap.Plugins.SkorLlm as SkorLlmPlugin) : null;
}

async function tryNative(): Promise<SlmRuntime | null> {
  const p = nativePlugin();
  if (!p) return null;
  try {
    const s = await p.status();
    const modelVersion = s.loaded ? s.modelVersion ?? "unknown" : (await p.load({ threads: 4 })).modelVersion;
    return {
      name: "native",
      modelVersion,
      async complete(messages, o = {}) {
        const r = await p.complete({ messages, grammar: o.grammar, maxTokens: o.maxTokens ?? 512,
                                     temperature: o.temperature ?? 0.2 });
        return r.text;
      },
    };
  } catch (e) {
    console.warn("[slm] native runtime unavailable:", e);
    return null;
  }
}

async function tryDesktop(): Promise<SlmRuntime | null> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 800);
    const res = await fetch(`${DESKTOP_URL}/health`, { signal: ctl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const props = await fetch(`${DESKTOP_URL}/props`).then((r) => r.json()).catch(() => ({}));
    const modelVersion = String(props?.model_path ?? "desktop").split(/[\\/]/).pop() ?? "desktop";
    return {
      name: "desktop",
      modelVersion,
      async complete(messages, o = {}) {
        const r = await fetch(`${DESKTOP_URL}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages, grammar: o.grammar, max_tokens: o.maxTokens ?? 512,
                                 temperature: o.temperature ?? 0.2 }),
        });
        if (!r.ok) throw new Error(`llama-server ${r.status}`);
        const j = await r.json();
        return j.choices?.[0]?.message?.content ?? "";
      },
    };
  } catch {
    return null;
  }
}

let _runtime: Promise<SlmRuntime | null> | null = null;

/** The best available runtime on this device, or null. Cached; call resetSlmRuntime() to re-probe. */
export function getSlmRuntime(): Promise<SlmRuntime | null> {
  if (!_runtime) _runtime = (async () => (await tryNative()) ?? (await tryDesktop()))();
  return _runtime;
}

export function resetSlmRuntime(): void {
  _runtime = null;
}
