import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Loader2, Target, Sparkles } from "lucide-react";
import type { CoachNarrative } from "@/services/api";

interface StudyCoachModalProps {
  open: boolean;
  loading: boolean;
  narrative: CoachNarrative | null;
  errorMessage?: string | null;
  onClose: () => void;
  onStartPractice?: (topic: string, subject: string) => void;
}

export function StudyCoachModal({
  open,
  loading,
  narrative,
  errorMessage,
  onClose,
  onStartPractice,
}: StudyCoachModalProps) {
  const focus = narrative?.focus_areas?.slice(0, 3) ?? [];
  const firstFocus = focus[0];

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        className="max-h-[92vh] overflow-y-auto rounded-t-3xl border-t-2 border-primary bg-[linear-gradient(180deg,#1a0533_0%,#2d0a6e_100%)] text-foreground"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2 font-display text-2xl">
            <Target className="h-6 w-6 text-primary-glow" />
            <span>Your Study Coach Report</span>
          </SheetTitle>
        </SheetHeader>

        <div className="mx-auto max-w-md space-y-4 pb-6 pt-4">
          {loading ? (
            <div className="flex flex-col items-center gap-4 py-12 text-center">
              <Loader2 className="h-10 w-10 animate-spin text-primary-glow" />
              <div className="space-y-1">
                <p className="font-display text-lg font-semibold">
                  Your AI coach is analysing your answers…
                </p>
                <p className="text-sm text-muted-foreground">
                  This usually takes 5–15 seconds.
                </p>
              </div>
            </div>
          ) : errorMessage ? (
            <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              {errorMessage}
            </div>
          ) : narrative ? (
            <>
              <div className="rounded-2xl border border-primary/40 bg-primary/10 p-4">
                <p className="text-base leading-relaxed">{narrative.greeting}</p>
              </div>

              {narrative.strengths?.length > 0 && (
                <div className="rounded-2xl border border-[oklch(0.6_0.18_150/0.45)] bg-[oklch(0.3_0.1_150/0.18)] p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[oklch(0.82_0.18_150)]">
                    <span>✅</span> What you’re good at
                  </div>
                  <ul className="mt-2 space-y-1 text-sm">
                    {narrative.strengths.map((s, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-[oklch(0.82_0.18_150)]">•</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {focus.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary-glow">
                    <span>📚</span> Focus areas (most urgent first)
                  </div>
                  {focus.map((f, i) => (
                    <div
                      key={i}
                      className="rounded-2xl border border-border/70 bg-card/60 p-4 backdrop-blur"
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="grid h-6 w-6 place-items-center rounded-full bg-gradient-primary text-xs font-bold text-primary-foreground">
                          {i + 1}
                        </span>
                        <div className="font-display text-base font-semibold leading-snug">
                          {f.topic}
                        </div>
                        <span className="ml-auto text-xs text-muted-foreground">{f.subject}</span>
                      </div>
                      <p className="mt-2 text-sm text-foreground/90">{f.why}</p>
                      <div className="mt-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
                        <span className="font-semibold text-warning">💡 Tip: </span>
                        <span className="text-foreground/90">{f.tip}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {narrative.next_step && (
                <div className="rounded-2xl border border-[oklch(0.65_0.22_300/0.4)] bg-[oklch(0.3_0.12_300/0.2)] p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary-glow">
                    <span>👉</span> Next step
                  </div>
                  <p className="mt-1 text-sm leading-relaxed">{narrative.next_step}</p>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                {firstFocus && onStartPractice && (
                  <Button
                    onClick={() => onStartPractice(firstFocus.topic, firstFocus.subject)}
                    size="lg"
                    className="h-12 flex-1 rounded-2xl bg-gradient-primary font-bold shadow-glow"
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    Start Practice Session
                  </Button>
                )}
                <Button
                  onClick={onClose}
                  size="lg"
                  variant="outline"
                  className="h-12 rounded-2xl border-border/60 bg-card/40 font-semibold"
                >
                  Close
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
