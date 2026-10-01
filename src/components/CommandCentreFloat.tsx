import { useState, useEffect } from "react";
import { Sparkles, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "@tanstack/react-router";
import { AiControllerPanel } from "@/components/teacher/AiControllerPanel";
import { cn } from "@/lib/utils";

const HIDDEN_PATHS = new Set(["/login", "/reset-password"]);

export function CommandCentreFloat() {
  const { profile } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  // Close on route change
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const path = location.pathname;

  // Hide on embed pages, public pages, and for non-teacher/admin roles
  if (
    path.startsWith("/embed/") ||
    HIDDEN_PATHS.has(path) ||
    !profile ||
    (profile.role !== "teacher" && profile.role !== "admin")
  ) {
    return null;
  }

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full",
          "bg-gradient-to-r from-violet-600 to-purple-600 px-4 py-3",
          "text-sm font-semibold text-white shadow-lg shadow-violet-500/30",
          "hover:from-violet-500 hover:to-purple-500 hover:shadow-violet-500/40 hover:scale-105",
          "active:scale-95 transition-all duration-150",
          open && "opacity-0 pointer-events-none"
        )}
        aria-label="Open AI Command Centre"
      >
        <Sparkles className="h-4 w-4" />
        Command
      </button>

      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* Slide-over panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="AI Command Centre"
        className={cn(
          "fixed right-0 top-0 z-50 flex h-full w-full max-w-[480px] flex-col",
          "bg-card shadow-2xl transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Panel header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border/60 bg-card/90 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">AI Command Centre</span>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition"
            aria-label="Close Command Centre"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Chat panel — lazy mount to avoid background API calls */}
        <div className="min-h-0 flex-1 overflow-hidden">
          {open && <AiControllerPanel />}
        </div>
      </div>
    </>
  );
}
