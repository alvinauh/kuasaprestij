import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { generateLesson, type Lesson } from "@/services/api";

interface Props {
  open: boolean;
  onClose: () => void;
  lesson: Lesson | null;
  subject: string;
  topic: string;
  language: string;
  formLevel?: number;
  onLessonUpdate?: (lesson: Lesson) => void;
}

export function LessonNotesModal({ open, onClose, lesson, subject, topic, language, formLevel = 4, onLessonUpdate }: Props) {
  const [override, setOverride] = useState<Lesson | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const setCurrent = setOverride;

  useEffect(() => {
    // Reset regen override whenever incoming lesson identity changes
    setOverride(null);
  }, [lesson]);

  // Auto-fetch when modal opens and no lesson is cached yet
  useEffect(() => {
    if (!open || lesson?.notes_markdown || override || regenerating) return;
    setRegenerating(true);
    generateLesson(topic, subject, language?.toLowerCase().startsWith("ms") ? "Bahasa Melayu" : "English", formLevel)
      .then((fresh) => {
        setCurrent(fresh);
        onLessonUpdate?.(fresh);
      })
      .catch((e) => console.error("[LessonNotes] auto-fetch failed:", e))
      .finally(() => setRegenerating(false));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const active = override ?? lesson;


  const isMs = language?.toLowerCase().startsWith("ms");
  const labels = isMs
    ? {
        notes: "Nota",
        terms: "Istilah Penting",
        example: "Contoh",
        mindmap: "Peta Minda",
        regenerate: "Jana Semula",
        regenerating: "Menjana...",
        empty: "Nota sedang disediakan. Semak semula selepas jawapan pertama anda.",
        noExample: "Tiada contoh tersedia.",
        noTerms: "Tiada istilah tersedia.",
        noMindmap: "Tiada peta minda tersedia.",
      }
    : {
        notes: "Notes",
        terms: "Key Terms",
        example: "Example",
        mindmap: "Mind Map",
        regenerate: "Regenerate",
        regenerating: "Regenerating...",
        empty: "Notes are being prepared. Check back after your first answer.",
        noExample: "No worked example available yet.",
        noTerms: "No key terms available yet.",
        noMindmap: "No mind map available yet.",
      };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const fresh = await generateLesson(topic, subject, isMs ? "Bahasa Melayu" : "English", formLevel);
      setCurrent(fresh);
      onLessonUpdate?.(fresh);
    } catch (e) {
      console.error("[LessonNotes] regenerate failed:", e);
    } finally {
      setRegenerating(false);
    }
  };

  const hasNotes = !!active && typeof active.notes_markdown === "string" && active.notes_markdown.trim().length > 0;
  const title = active?.title || topic || (isMs ? "Pelajaran" : "Lesson");

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{title}</DialogTitle>
          {active?.summary && (
            <p className="text-sm text-muted-foreground">{active.summary}</p>
          )}
        </DialogHeader>

        {!hasNotes ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {regenerating ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {isMs ? "Menjana nota..." : "Generating notes…"}
              </span>
            ) : labels.empty}
          </div>
        ) : (
          <Tabs defaultValue="notes" className="mt-2">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="notes">{labels.notes}</TabsTrigger>
              <TabsTrigger value="terms">{labels.terms}</TabsTrigger>
              <TabsTrigger value="example">{labels.example}</TabsTrigger>
              <TabsTrigger value="mindmap">{labels.mindmap}</TabsTrigger>
            </TabsList>

            <TabsContent value="notes" className="mt-4">
              <div className="prose prose-invert max-w-none rounded-2xl border border-border/60 bg-card/60 p-5 text-sm leading-relaxed [&_h1]:font-display [&_h1]:text-xl [&_h2]:font-display [&_h2]:text-lg [&_h2]:mt-4 [&_h3]:font-semibold [&_h3]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1">
                <ReactMarkdown>{active!.notes_markdown!}</ReactMarkdown>
              </div>
            </TabsContent>

            <TabsContent value="terms" className="mt-4">
              {active?.key_terms && active.key_terms.length > 0 ? (
                <ul className="space-y-3 rounded-2xl border border-border/60 bg-card/60 p-5">
                  {active.key_terms.map((kt, i) => (
                    <li key={i} className="text-sm leading-relaxed">
                      <span className="font-semibold text-primary-glow">{kt.term}</span>
                      <span className="text-muted-foreground"> — {kt.definition}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">{labels.noTerms}</p>
              )}
            </TabsContent>

            <TabsContent value="example" className="mt-4">
              {active?.worked_example ? (
                <pre className="whitespace-pre-wrap rounded-2xl border border-border/60 bg-card/60 p-5 text-sm leading-relaxed font-sans">
                  {active.worked_example}
                </pre>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">{labels.noExample}</p>
              )}
            </TabsContent>

            <TabsContent value="mindmap" className="mt-4">
              {active?.mindmap && active.mindmap.branches && active.mindmap.branches.length > 0 ? (
                <div className="rounded-2xl border border-border/60 bg-card/60 p-5">
                  {active.mindmap.root && (
                    <div className="mb-4 inline-block rounded-full bg-primary/20 px-4 py-2 text-sm font-semibold text-primary-glow">
                      {active.mindmap.root}
                    </div>
                  )}
                  <div className="space-y-3 pl-3">
                    {active.mindmap.branches.map((b, i) => (
                      <div key={i} className="border-l-2 border-primary/40 pl-4">
                        <div className="font-semibold text-foreground">{b.label}</div>
                        {b.children && b.children.length > 0 && (
                          <ul className="mt-1 space-y-1 pl-4 text-sm text-muted-foreground">
                            {b.children.map((c, j) => (
                              <li key={j} className="list-disc">{c}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">{labels.noMindmap}</p>
              )}
            </TabsContent>
          </Tabs>
        )}

        <div className="mt-4 flex justify-end">
          <Button
            onClick={handleRegenerate}
            disabled={regenerating}
            variant="outline"
            size="sm"
          >
            {regenerating ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{labels.regenerating}</>
            ) : (
              <><RefreshCw className="mr-2 h-4 w-4" />{labels.regenerate}</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
