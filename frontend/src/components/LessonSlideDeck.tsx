import { useEffect, useMemo, useState } from "react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  Presentation,
  Lightbulb,
  Target,
  Sigma,
  FlaskConical,
  AlertTriangle,
  CheckCircle2,
  Image as ImageIcon,
  Mic,
} from "lucide-react";
import type { Lesson, LessonSlide, LessonSlideLayout } from "@/services/api";

interface Props {
  open: boolean;
  onClose: () => void;
  lesson: Lesson | null;
  subject?: string;
  topic?: string;
}

const LAYOUT_META: Record<
  LessonSlideLayout,
  { icon: typeof Lightbulb; accent: string; label: string }
> = {
  title: { icon: Presentation, accent: "from-primary/30 via-primary/10 to-transparent", label: "Title" },
  objectives: { icon: Target, accent: "from-sky-500/25 via-sky-500/10 to-transparent", label: "Objectives" },
  concept: { icon: Lightbulb, accent: "from-primary/25 via-primary/5 to-transparent", label: "Concept" },
  formula: { icon: Sigma, accent: "from-violet-500/25 via-violet-500/10 to-transparent", label: "Formula" },
  example: { icon: FlaskConical, accent: "from-emerald-500/25 via-emerald-500/10 to-transparent", label: "Example" },
  mistakes: { icon: AlertTriangle, accent: "from-amber-500/25 via-amber-500/10 to-transparent", label: "Common Mistakes" },
  recap: { icon: CheckCircle2, accent: "from-teal-500/25 via-teal-500/10 to-transparent", label: "Recap" },
};

/**
 * Derive a usable deck from a lesson's markdown when the agent didn't author
 * an explicit `slides` array (older cached lessons). Splits notes_markdown on
 * `##` headings — each heading becomes a slide, its bullet/paragraph lines the points.
 */
function deriveSlidesFromNotes(lesson: Lesson): LessonSlide[] {
  const slides: LessonSlide[] = [];
  slides.push({
    layout: "title",
    title: lesson.title || "Lesson",
    subtitle: lesson.summary,
    bullets: [],
  });

  const md = lesson.notes_markdown ?? "";
  const sections = md.split(/\n(?=##\s)/g);
  for (const section of sections) {
    const lines = section.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    const headingLine = lines[0].replace(/^#+\s*/, "").trim();
    const heading = headingLine || "Notes";
    const bullets = lines
      .slice(1)
      .map((l) => l.replace(/^[-*+]\s*/, "").replace(/^\d+\.\s*/, "").replace(/[#*_`]/g, "").trim())
      .filter(Boolean)
      .slice(0, 6);
    if (bullets.length === 0 && !headingLine) continue;
    slides.push({ layout: "concept", title: heading, bullets });
  }

  if (lesson.worked_example) {
    slides.push({
      layout: "example",
      title: "Worked Example",
      bullets: lesson.worked_example
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 8),
    });
  }

  // Fallback single slide if markdown produced nothing.
  if (slides.length === 1 && lesson.key_terms?.length) {
    slides.push({
      layout: "concept",
      title: "Key Terms",
      bullets: lesson.key_terms.map((k) => `${k.term} — ${k.definition}`).slice(0, 6),
    });
  }
  return slides;
}

export function LessonSlideDeck({ open, onClose, lesson, subject, topic }: Props) {
  const [index, setIndex] = useState(0);
  const [showNotes, setShowNotes] = useState(false);

  const slides: LessonSlide[] = useMemo(() => {
    if (!lesson) return [];
    if (lesson.slides && lesson.slides.length > 0) return lesson.slides;
    return deriveSlidesFromNotes(lesson);
  }, [lesson]);

  // Reset to first slide whenever a different lesson opens.
  useEffect(() => {
    setIndex(0);
  }, [lesson, open]);

  const count = slides.length;
  const go = (delta: number) =>
    setIndex((i) => Math.min(Math.max(i + delta, 0), Math.max(count - 1, 0)));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "PageDown") go(1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, count]);

  const slide = slides[index];
  const meta = LAYOUT_META[slide?.layout ?? "concept"] ?? LAYOUT_META.concept;
  const Icon = meta.icon;
  const isTitle = slide?.layout === "title";
  const hasImage = !!slide?.image_url;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl overflow-hidden p-0">
        {count === 0 || !slide ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            No slides available for this lesson yet.
          </div>
        ) : (
          <div className="flex flex-col">
            {/* Slide canvas — 16:9 */}
            <div className="relative aspect-[16/9] w-full overflow-hidden bg-card">
              {/* Title slide: full-bleed hero image behind the text */}
              {isTitle && hasImage && (
                <>
                  <img src={slide.image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-background/30" />
                </>
              )}
              <div className={`absolute inset-0 bg-gradient-to-br ${meta.accent}`} />

              <div className="relative flex h-full flex-col p-8 sm:p-12">
                {/* eyebrow */}
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Icon className="h-4 w-4 text-primary-glow" />
                  <span>{meta.label}</span>
                  <span className="text-muted-foreground/50">· {subject || topic}</span>
                </div>

                {isTitle ? (
                  <div className="flex flex-1 flex-col justify-center">
                    <h1 className="font-display text-4xl font-bold leading-tight sm:text-5xl">
                      {slide.title}
                    </h1>
                    {slide.subtitle && (
                      <p className="mt-4 max-w-2xl text-lg text-muted-foreground">{slide.subtitle}</p>
                    )}
                  </div>
                ) : (
                  <div className="mt-4 flex flex-1 gap-6 overflow-hidden">
                    {/* Text column */}
                    <div className={`flex flex-col overflow-hidden ${hasImage ? "flex-1" : "w-full"}`}>
                      <h2 className="font-display text-2xl font-bold leading-snug sm:text-3xl">
                        {slide.title}
                      </h2>
                      {slide.subtitle && (
                        <p className="mt-1 text-base text-muted-foreground">{slide.subtitle}</p>
                      )}
                      <ul className="mt-5 space-y-3 overflow-y-auto pr-2">
                        {(slide.bullets ?? []).map((b, i) => (
                          <li key={i} className="flex items-start gap-3 text-lg leading-relaxed sm:text-xl">
                            <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary-glow" />
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Image column */}
                    {hasImage && (
                      <div className="hidden w-2/5 shrink-0 sm:block">
                        <figure className="h-full overflow-hidden rounded-2xl border border-border/60">
                          <img
                            src={slide.image_url}
                            alt={slide.visual || slide.title || ""}
                            className="h-full w-full object-cover"
                          />
                        </figure>
                      </div>
                    )}
                  </div>
                )}

                {/* Fallback caption only when there's no real image */}
                {!hasImage && slide.visual && (
                  <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground/80">
                    <ImageIcon className="h-3.5 w-3.5" />
                    <span className="italic">Visual: {slide.visual}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Speaker notes */}
            {showNotes && slide.notes && (
              <div className="border-t border-border/60 bg-muted/40 px-6 py-3 text-sm text-muted-foreground">
                <span className="mr-2 font-semibold text-foreground">Say:</span>
                {slide.notes}
              </div>
            )}

            {/* Controls */}
            <div className="flex items-center justify-between border-t border-border/60 px-4 py-3">
              <div className="flex items-center gap-1.5">
                {slides.map((_, i) => (
                  <button
                    key={i}
                    aria-label={`Go to slide ${i + 1}`}
                    onClick={() => setIndex(i)}
                    className={`h-1.5 rounded-full transition-all ${
                      i === index ? "w-6 bg-primary-glow" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60"
                    }`}
                  />
                ))}
              </div>

              <div className="flex items-center gap-2">
                {slide.notes && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowNotes((s) => !s)}
                    className={showNotes ? "text-primary-glow" : "text-muted-foreground"}
                  >
                    <Mic className="mr-1.5 h-4 w-4" />
                    Notes
                  </Button>
                )}
                <span className="tabular-nums text-xs text-muted-foreground">
                  {index + 1} / {count}
                </span>
                <Button variant="outline" size="icon" onClick={() => go(-1)} disabled={index === 0} aria-label="Previous slide">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => go(1)} disabled={index === count - 1} aria-label="Next slide">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
