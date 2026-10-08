// Client-side helper: log a frontend error to the public.app_errors table.
// Anyone (signed-in or anon) may insert; only admins can read.
import { supabase } from "@/integrations/supabase/client";

interface LogParams {
  message: string;
  level?: "error" | "warn" | "info";
  source?: string;
  stack?: string;
  context?: Record<string, unknown>;
}

export async function logAppError(params: LogParams): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("app_errors").insert({
      user_id: user?.id ?? null,
      level: params.level ?? "error",
      message: params.message.slice(0, 2000),
      source: params.source ?? null,
      url: typeof window !== "undefined" ? window.location.href : null,
      stack: params.stack?.slice(0, 4000) ?? null,
      context: (params.context ?? null) as never,
    });
  } catch {
    // Logging must never throw.
  }
}

let installed = false;
export function installGlobalErrorLogger() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => {
    void logAppError({
      message: e.message || "window.error",
      source: e.filename || "window",
      stack: e.error?.stack,
    });
  });
  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason;
    void logAppError({
      message: typeof reason === "string" ? reason : reason?.message ?? "unhandledrejection",
      source: "unhandledrejection",
      stack: reason?.stack,
    });
  });
}
