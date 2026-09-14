import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  useStudentPrefs,
  THEMES,
  AVATARS,
  BANNERS,
  ACCOMMODATION_GROUPS,
  type ThemeKey,
  type FontSize,
} from "@/hooks/useStudentPrefs";
import { ChevronRight } from "lucide-react";

const AVATAR_BG_CYCLE = [
  "bg-violet-100",
  "bg-blue-100",
  "bg-emerald-100",
  "bg-amber-100",
  "bg-rose-100",
  "bg-cyan-100",
  "bg-orange-100",
  "bg-teal-100",
];

const THEME_OPTIONS: { key: ThemeKey; label: string; primary: string }[] = [
  { key: "purple", label: "Purple", primary: THEMES.purple["--primary"] },
  { key: "blue",   label: "Blue",   primary: THEMES.blue["--primary"] },
  { key: "green",  label: "Green",  primary: THEMES.green["--primary"] },
  { key: "orange", label: "Orange", primary: THEMES.orange["--primary"] },
  { key: "red",    label: "Red",    primary: THEMES.red["--primary"] },
];

const FONT_OPTIONS: { key: FontSize; label: string; size: string }[] = [
  { key: "sm", label: "A", size: "0.75rem" },
  { key: "md", label: "A", size: "0.875rem" },
  { key: "lg", label: "A", size: "1.05rem" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenExamPrefs?: () => void;
}

export function StudentSettingsSheet({ open, onClose, onOpenExamPrefs }: Props) {
  const { prefs, save, setAccommodation } = useStudentPrefs();

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-72 max-w-full overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle className="font-display text-xl">My Style</SheetTitle>
          <p className="text-xs text-muted-foreground">Saved automatically to this device.</p>
        </SheetHeader>

        {/* Avatar — 30 entries in 6-column grid */}
        <section className="mb-6">
          <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Avatar
          </div>
          <div className="grid grid-cols-6 gap-2">
            {AVATARS.map((emoji, idx) => (
              <button
                key={emoji}
                onClick={() => save({ avatar: emoji })}
                className={cn(
                  "grid h-12 w-12 place-items-center rounded-2xl text-2xl transition-all",
                  AVATAR_BG_CYCLE[idx % AVATAR_BG_CYCLE.length],
                  prefs.avatar === emoji
                    ? "ring-2 ring-primary scale-110 bg-primary/15"
                    : "hover:scale-105",
                )}
                aria-label={emoji}
              >
                {emoji}
              </button>
            ))}
          </div>
        </section>

        {/* Profile Banner — 10 swatches in 5-column grid */}
        <section className="mb-6">
          <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Profile Banner
          </div>
          <div className="grid grid-cols-5 gap-2">
            {BANNERS.map(({ key, label, gradient }) => (
              <button
                key={key}
                onClick={() => save({ banner: key })}
                title={label}
                style={{ background: gradient }}
                className={cn(
                  "h-7 w-10 rounded-lg transition-all",
                  prefs.banner === key
                    ? "ring-2 ring-primary ring-offset-1 scale-105"
                    : "opacity-75 hover:opacity-100 hover:scale-105",
                )}
                aria-label={label}
              />
            ))}
          </div>
        </section>

        {/* Accent Colour */}
        <section className="mb-6">
          <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Accent Colour
          </div>
          <div className="flex gap-3">
            {THEME_OPTIONS.map(({ key, label, primary }) => (
              <button
                key={key}
                onClick={() => save({ theme: key })}
                title={label}
                style={{ background: primary }}
                className={cn(
                  "h-9 w-9 rounded-full border-2 transition-all",
                  prefs.theme === key
                    ? "ring-2 ring-offset-2 ring-offset-background ring-white scale-115 border-white"
                    : "border-transparent opacity-70 hover:opacity-100 hover:scale-105",
                )}
              />
            ))}
          </div>
        </section>

        {/* Text Size */}
        <section className="mb-6">
          <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Text Size
          </div>
          <div className="flex gap-2">
            {FONT_OPTIONS.map(({ key, label, size }) => (
              <button
                key={key}
                onClick={() => save({ fontSize: key })}
                style={{ fontSize: size }}
                className={cn(
                  "h-10 flex-1 rounded-xl border-2 font-bold transition-all",
                  prefs.fontSize === key
                    ? "border-primary bg-primary/10 text-primary scale-105"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">Small · Medium · Large</p>
        </section>

        {/* Sound Effects */}
        <div className="mb-6 flex items-center justify-between rounded-xl border border-border bg-card/60 px-4 py-3">
          <div>
            <div className="text-sm font-semibold">Sound Effects</div>
            <div className="text-xs text-muted-foreground">Correct / wrong answer sounds</div>
          </div>
          <Switch
            checked={prefs.soundOn}
            onCheckedChange={(v) => save({ soundOn: v })}
          />
        </div>

        {/* Exam Mode */}
        <section className="mb-6">
          <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            SPM Exam Mode
          </div>
          <div className="rounded-xl border border-border bg-card/60 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-sm font-semibold">Exam Paper Layout</div>
                <div className="text-xs text-muted-foreground">
                  Replaces the game card with an SPM booklet format
                </div>
              </div>
              <Switch
                checked={prefs.examMode}
                onCheckedChange={(v) => save({ examMode: v })}
              />
            </div>
            {prefs.examMode && onOpenExamPrefs && (
              <button
                onClick={() => { onClose(); onOpenExamPrefs(); }}
                className="flex w-full items-center justify-between border-t border-border px-4 py-2.5 text-sm text-primary hover:bg-primary/5 transition"
              >
                <span>Customise exam paper</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </section>

        {/* Comfort & Accessibility */}
        <section className="mb-6">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Comfort &amp; Accessibility
          </div>
          <p className="mb-3 text-[10px] text-muted-foreground">
            Turn on whatever helps you learn best. You can change these any time.
          </p>
          <div className="space-y-4">
            {ACCOMMODATION_GROUPS.map(({ group, items }) => (
              <div key={group}>
                <div className="mb-2 text-[10px] font-semibold text-muted-foreground/80">{group}</div>
                <div className="rounded-xl border border-border bg-card/60 overflow-hidden divide-y divide-border">
                  {items.map(({ key, label, hint }) => (
                    <div key={key} className="flex items-center justify-between px-4 py-2.5">
                      <div className="pr-3">
                        <div className="text-sm font-semibold">{label}</div>
                        <div className="text-xs text-muted-foreground">{hint}</div>
                      </div>
                      <Switch
                        checked={prefs.accommodations[key]}
                        onCheckedChange={(v) => setAccommodation(key, v)}
                        aria-label={label}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* DB sync note */}
        <p className="text-xs text-muted-foreground text-center pb-2">
          ✓ Saved to your account
        </p>
      </SheetContent>
    </Sheet>
  );
}
