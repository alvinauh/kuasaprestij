import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Loader2, AlertTriangle } from "lucide-react";
import { generateStudyPack, type StudyPack } from "@/lib/study-pack.functions";

interface Props {
  open: boolean;
  onClose: () => void;
  question: string;
  conceptNote: string;
  subject: string;
  topic: string;
  language: string;
}

export function StudyPackModal({ open, onClose, question, conceptNote, subject, topic, language }: Props) {
  const generate = useServerFn(generateStudyPack);
  const [pack, setPack] = useState<StudyPack | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slideIdx, setSlideIdx] = useState(0);

  const isMs = language?.toLowerCase().startsWith("ms");
  const labels = isMs
    ? { title: "Pek Pembelajaran", mind: "Peta Minda", slides: "Slaid", notes: "Nota Penting", loading: "Menjana...", retry: "Cuba Semula", error: "Gagal menjana. Sila cuba lagi." }
    : { title: "Study Pack", mind: "Mind Map", slides: "Slides", notes: "Key Notes", loading: "Generating...", retry: "Retry", error: "Generation failed. Please try again." };

  const run = async () => {
    setLoading(true);
    setError(null);
    setPack(null);
    setSlideIdx(0);
    try {
      const res = await generate({ data: { question, conceptNote, subject, topic, language } });
      setPack(res);
    } catch (e) {
      console.error("[StudyPack] error:", e);
      setError(labels.error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && !pack && !loading) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{labels.title}</DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="space-y-3 py-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {labels.loading}
            </div>
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-5/6" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-start gap-3 py-6">
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" /> {error}
            </div>
            <Button onClick={run} size="sm">{labels.retry}</Button>
          </div>
        )}

        {pack && !loading && (
          <Tabs defaultValue="mind" className="mt-2">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="mind">{labels.mind}</TabsTrigger>
              <TabsTrigger value="slides">{labels.slides}</TabsTrigger>
              <TabsTrigger value="notes">{labels.notes}</TabsTrigger>
            </TabsList>

            <TabsContent value="mind" className="mt-4">
              <div className="rounded-2xl border border-border/60 bg-card/60 p-5">
                <div className="mb-4 inline-block rounded-full bg-primary/20 px-4 py-2 text-sm font-semibold text-primary-glow">
                  {pack.mindMap.root}
                </div>
                <div className="space-y-3 pl-3">
                  {pack.mindMap.branches.map((b, i) => (
                    <div key={i} className="border-l-2 border-primary/40 pl-4">
                      <div className="font-semibold text-foreground">{b.label}</div>
                      {b.children && b.children.length > 0 && (
                        <ul className="mt-1 space-y-1 pl-4 text-sm text-muted-foreground">
                          {b.children.map((c, j) => (
                            <li key={j} className="list-disc">{c.label}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="slides" className="mt-4">
              <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-card/80 to-card/40 p-6 min-h-[280px] flex flex-col">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">
                  {slideIdx + 1} / {pack.slides.length}
                </div>
                <h3 className="mt-2 font-display text-2xl font-semibold">{pack.slides[slideIdx].title}</h3>
                <ul className="mt-4 flex-1 space-y-2">
                  {pack.slides[slideIdx].bullets.map((b, i) => (
                    <li key={i} className="flex gap-2 text-sm leading-relaxed">
                      <span className="text-primary-glow">•</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex items-center justify-between">
                  <Button variant="ghost" size="sm" onClick={() => setSlideIdx((i) => Math.max(0, i - 1))} disabled={slideIdx === 0}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="flex gap-1">
                    {pack.slides.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setSlideIdx(i)}
                        className={`h-1.5 w-6 rounded-full transition ${i === slideIdx ? "bg-primary" : "bg-border"}`}
                      />
                    ))}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSlideIdx((i) => Math.min(pack.slides.length - 1, i + 1))} disabled={slideIdx === pack.slides.length - 1}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="notes" className="mt-4">
              <ul className="space-y-2 rounded-2xl border border-border/60 bg-card/60 p-5">
                {pack.notes.map((n, i) => (
                  <li key={i} className="flex gap-3 text-sm leading-relaxed">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary-glow">
                      {i + 1}
                    </span>
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
