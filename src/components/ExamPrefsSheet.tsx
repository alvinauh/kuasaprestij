import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  useStudentPrefs,
  type ExamFont,
  type PaperColour,
  type LineStyle,
} from "@/hooks/useStudentPrefs";

interface Props {
  open: boolean;
  onClose: () => void;
}

const FONT_OPTIONS: { key: ExamFont; label: string; sample: string }[] = [
  { key: "serif", label: "Times New Roman", sample: "Aa" },
  { key: "sans",  label: "Arial / Sans",    sample: "Aa" },
];

const COLOUR_OPTIONS: { key: PaperColour; label: string; bg: string; border: string }[] = [
  { key: "white", label: "White",      bg: "#ffffff",  border: "#d1d5db" },
  { key: "cream", label: "Cream",      bg: "#fdf6e3",  border: "#d6cba5" },
  { key: "blue",  label: "Light Blue", bg: "#eef2ff",  border: "#a5b4fc" },
];

const LINE_OPTIONS: { key: LineStyle; label: string; desc: string }[] = [
  { key: "ruled", label: "Ruled",      desc: "Horizontal guide lines" },
  { key: "plain", label: "Plain",      desc: "No lines (blank box)" },
  { key: "graph", label: "Graph",      desc: "Grid (for calculations)" },
];

export function ExamPrefsSheet({ open, onClose }: Props) {
  const { prefs, save } = useStudentPrefs();
  const ep = prefs.examPrefs;

  const updateExam = (patch: Partial<typeof ep>) =>
    save({ examPrefs: { ...ep, ...patch } });

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-80 max-w-full overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle className="text-xl">Exam Paper Settings</SheetTitle>
          <p className="text-xs text-muted-foreground">
            Customise how your SPM exam paper looks.
          </p>
        </SheetHeader>

        {/* Font */}
        <section className="mb-6">
          <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Font Style
          </div>
          <div className="grid grid-cols-2 gap-2">
            {FONT_OPTIONS.map(({ key, label, sample }) => (
              <button
                key={key}
                onClick={() => updateExam({ font: key })}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl border-2 py-3 transition-all",
                  ep.font === key
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:border-primary/40",
                )}
              >
                <span
                  className="text-2xl font-bold"
                  style={{
                    fontFamily:
                      key === "serif"
                        ? '"Times New Roman", Times, Georgia, serif'
                        : "system-ui, Arial, sans-serif",
                  }}
                >
                  {sample}
                </span>
                <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Paper colour */}
        <section className="mb-6">
          <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Paper Colour
          </div>
          <div className="grid grid-cols-3 gap-2">
            {COLOUR_OPTIONS.map(({ key, label, bg, border }) => (
              <button
                key={key}
                onClick={() => updateExam({ paperColour: key })}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border-2 p-2 transition-all",
                  ep.paperColour === key
                    ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                    : "hover:scale-105",
                )}
                style={{ borderColor: border }}
              >
                <div
                  className="h-8 w-full rounded border"
                  style={{ backgroundColor: bg, borderColor: border }}
                />
                <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Answer line style */}
        <section className="mb-6">
          <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Answer Line Style
          </div>
          <div className="space-y-2">
            {LINE_OPTIONS.map(({ key, label, desc }) => (
              <button
                key={key}
                onClick={() => updateExam({ lineStyle: key })}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl border-2 px-3 py-2.5 text-left transition-all",
                  ep.lineStyle === key
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:border-primary/40",
                )}
              >
                <div>
                  <div className="text-sm font-semibold">{label}</div>
                  <div className="text-xs text-muted-foreground">{desc}</div>
                </div>
                {ep.lineStyle === key && (
                  <div className="h-3 w-3 rounded-full bg-primary" />
                )}
              </button>
            ))}
          </div>
        </section>

        {/* Show marks toggle */}
        <div className="mb-4 flex items-center justify-between rounded-xl border border-border bg-card/60 px-4 py-3">
          <div>
            <div className="text-sm font-semibold">Show Marks per Part</div>
            <div className="text-xs text-muted-foreground">
              e.g. [2 marks] next to each sub-part
            </div>
          </div>
          <Switch
            checked={ep.showMarks}
            onCheckedChange={(v) => updateExam({ showMarks: v })}
          />
        </div>

        {/* Bilingual labels toggle */}
        <div className="flex items-center justify-between rounded-xl border border-border bg-card/60 px-4 py-3">
          <div>
            <div className="text-sm font-semibold">Bilingual Headers</div>
            <div className="text-xs text-muted-foreground">
              Show BM + English section labels
            </div>
          </div>
          <Switch
            checked={ep.bilingualLabels}
            onCheckedChange={(v) => updateExam({ bilingualLabels: v })}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
