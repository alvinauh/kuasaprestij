/**
 * Command Centre editors: edit an AI-generated quiz or slide deck, then send it to classes.
 * Saving a shared AI item creates the teacher's own copy (the backend returns its id),
 * so the original cached deck/quiz other teachers use is never changed.
 */
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  distributeContent,
  saveLessonEdits,
  saveQuizEdits,
  type Lesson,
  type LessonSlide,
  type QuizQuestion,
  type QuizRecord,
} from "@/services/api";

function move<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

function RowTools({ i, n, onMove, onDelete }: {
  i: number; n: number; onMove: (dir: -1 | 1) => void; onDelete: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" disabled={i === 0}
        onClick={() => onMove(-1)} aria-label="Move up"><ArrowUp className="h-3.5 w-3.5" /></Button>
      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" disabled={i === n - 1}
        onClick={() => onMove(1)} aria-label="Move down"><ArrowDown className="h-3.5 w-3.5" /></Button>
      <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive" disabled={n <= 1}
        onClick={onDelete} aria-label="Delete"><Trash2 className="h-3.5 w-3.5" /></Button>
    </div>
  );
}

// ── Quiz editor ──────────────────────────────────────────────────────────────

export function QuizEditorDialog({ quiz, onClose, onSaved }: {
  quiz: QuizRecord | null;
  onClose: () => void;
  onSaved: (quizId: string, topic: string, andSend: boolean) => void;
}) {
  const [topic, setTopic] = useState("");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [saving, setSaving] = useState(false);
  const qType = quiz?.question_type ?? "mcq";

  useEffect(() => {
    if (!quiz) return;
    setTopic(quiz.topic ?? "");
    setQuestions((quiz.questions_jsonb ?? []).map((q) => ({ ...q, options: q.options ? [...q.options] : q.options })));
  }, [quiz]);

  const setQ = (i: number, patch: Partial<QuizQuestion>) =>
    setQuestions((qs) => qs.map((q, k) => (k === i ? { ...q, ...patch } : q)));

  const setOption = (i: number, oi: number, text: string) =>
    setQuestions((qs) => qs.map((q, k) => {
      if (k !== i) return q;
      const options = [...(q.options ?? [])];
      const wasCorrect = options[oi] === q.correct_answer;
      options[oi] = text;
      // Keep the correct mark on the option being retyped.
      return { ...q, options, correct_answer: wasCorrect ? text : q.correct_answer };
    }));

  const addQuestion = () =>
    setQuestions((qs) => [...qs, qType === "mcq"
      ? { question: "", question_type: "mcq", options: ["", "", "", ""], correct_answer: "" }
      : { question: "", question_type: qType, model_answer: "" }]);

  async function save(andSend: boolean) {
    if (!quiz) return;
    setSaving(true);
    try {
      const res = await saveQuizEdits(quiz.id, topic, questions);
      toast.success(res.copied ? "Saved as your own copy" : "Quiz saved");
      onSaved(res.quiz_id, topic, andSend);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the quiz");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!quiz} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-base">Edit quiz</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Your changes are saved as your own copy. Other teachers keep the original.
          </p>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="quiz-topic">Title / topic</Label>
          <Input id="quiz-topic" value={topic} onChange={(e) => setTopic(e.target.value)} />
        </div>

        <ol className="space-y-4">
          {questions.map((q, i) => (
            <li key={i} className="space-y-2 rounded-xl border border-border bg-card/50 p-3">
              <div className="flex items-start gap-2">
                <span className="mt-2 text-sm font-bold text-primary">{i + 1}.</span>
                <Textarea value={q.question} rows={2} placeholder="Question"
                  onChange={(e) => setQ(i, { question: e.target.value })} />
                <RowTools i={i} n={questions.length}
                  onMove={(d) => setQuestions((qs) => move(qs, i, d))}
                  onDelete={() => setQuestions((qs) => qs.filter((_, k) => k !== i))} />
              </div>

              {(q.question_type ?? qType) === "mcq" ? (
                <div className="space-y-1.5 pl-5">
                  <p className="text-[11px] text-muted-foreground">Tick the correct answer.</p>
                  {(q.options ?? []).map((opt, oi) => {
                    const isCorrect = !!opt && opt === q.correct_answer;
                    return (
                      <div key={oi} className="flex items-center gap-2">
                        <button type="button" onClick={() => opt && setQ(i, { correct_answer: opt })}
                          className={cn(
                            "grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-bold",
                            isCorrect ? "border-success bg-success text-white" : "border-border text-muted-foreground",
                          )}
                          aria-label={`Mark option ${String.fromCharCode(65 + oi)} correct`}>
                          {String.fromCharCode(65 + oi)}
                        </button>
                        <Input value={opt} onChange={(e) => setOption(i, oi, e.target.value)}
                          className={cn(isCorrect && "border-success/60")} />
                        <Button type="button" size="icon" variant="ghost" className="h-7 w-7"
                          disabled={(q.options ?? []).length <= 2}
                          onClick={() => setQ(i, {
                            options: (q.options ?? []).filter((_, k) => k !== oi),
                            correct_answer: isCorrect ? "" : q.correct_answer,
                          })}
                          aria-label="Remove option"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    );
                  })}
                  {(q.options ?? []).length < 6 && (
                    <Button type="button" size="sm" variant="ghost" className="h-7 text-xs"
                      onClick={() => setQ(i, { options: [...(q.options ?? []), ""] })}>
                      <Plus className="h-3 w-3" /> Option
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-1 pl-5">
                  <Label className="text-xs">Model answer</Label>
                  <Textarea rows={2} value={q.model_answer ?? q.model_essay ?? ""}
                    onChange={(e) => setQ(i, q.model_essay !== undefined
                      ? { model_essay: e.target.value } : { model_answer: e.target.value })} />
                </div>
              )}
            </li>
          ))}
        </ol>

        <Button type="button" variant="outline" size="sm" onClick={addQuestion} className="w-fit">
          <Plus className="h-4 w-4" /> Add question
        </Button>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="outline" onClick={() => void save(false)} disabled={saving || questions.length === 0}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
          </Button>
          <Button onClick={() => void save(true)} disabled={saving || questions.length === 0}>
            <Send className="h-4 w-4" /> Save &amp; send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Slide editor ─────────────────────────────────────────────────────────────

export function SlideEditorDialog({ lesson, onClose, onSaved }: {
  lesson: Lesson | null;
  onClose: () => void;
  onSaved: (lessonId: string, title: string, andSend: boolean) => void;
}) {
  const [title, setTitle] = useState("");
  // Bullets are edited as one-per-line text and split on save.
  const [slides, setSlides] = useState<(LessonSlide & { bulletText: string })[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!lesson) return;
    setTitle(lesson.title ?? lesson.topic ?? "");
    setSlides((lesson.slides ?? []).map((s) => ({ ...s, bulletText: (s.bullets ?? []).join("\n") })));
  }, [lesson]);

  const setS = (i: number, patch: Partial<LessonSlide & { bulletText: string }>) =>
    setSlides((ss) => ss.map((s, k) => (k === i ? { ...s, ...patch } : s)));

  async function save(andSend: boolean) {
    if (!lesson?.id) return;
    setSaving(true);
    try {
      const out: LessonSlide[] = slides.map(({ bulletText, ...s }) => ({
        ...s,
        bullets: bulletText.split("\n").map((b) => b.trim()).filter(Boolean),
      }));
      const res = await saveLessonEdits(lesson.id, title, out);
      toast.success(res.copied ? "Saved as your own copy" : "Slides saved");
      onSaved(res.lesson_id, title, andSend);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the slides");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!lesson} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-base">Edit slides</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Your changes are saved as your own copy. Other teachers keep the original.
          </p>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="deck-title">Deck title</Label>
          <Input id="deck-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        {slides.length === 0 && (
          <p className="text-sm text-muted-foreground">This lesson has no slides yet. Add one below.</p>
        )}

        <ol className="space-y-4">
          {slides.map((s, i) => (
            <li key={i} className="space-y-2 rounded-xl border border-border bg-card/50 p-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-primary">Slide {i + 1}</span>
                {s.layout && <span className="text-[10px] uppercase text-muted-foreground">{s.layout}</span>}
                <div className="ml-auto">
                  <RowTools i={i} n={slides.length}
                    onMove={(d) => setSlides((ss) => move(ss, i, d))}
                    onDelete={() => setSlides((ss) => ss.filter((_, k) => k !== i))} />
                </div>
              </div>
              <Input value={s.title ?? ""} placeholder="Slide title" onChange={(e) => setS(i, { title: e.target.value })} />
              <div className="space-y-1">
                <Label className="text-xs">Points (one per line)</Label>
                <Textarea rows={Math.max(3, s.bulletText.split("\n").length)} value={s.bulletText}
                  onChange={(e) => setS(i, { bulletText: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Speaker notes (optional)</Label>
                <Textarea rows={2} value={s.notes ?? ""} onChange={(e) => setS(i, { notes: e.target.value })} />
              </div>
            </li>
          ))}
        </ol>

        <Button type="button" variant="outline" size="sm" className="w-fit"
          onClick={() => setSlides((ss) => [...ss, { layout: "concept", title: "", bullets: [], bulletText: "" }])}>
          <Plus className="h-4 w-4" /> Add slide
        </Button>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="outline" onClick={() => void save(false)} disabled={saving || slides.length === 0}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
          </Button>
          <Button onClick={() => void save(true)} disabled={saving || slides.length === 0}>
            <Send className="h-4 w-4" /> Save &amp; send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Send to classes ──────────────────────────────────────────────────────────

export interface SendTarget {
  kind: "lesson" | "quiz";
  id: string;
  topic: string;
  subject?: string;
}

export function SendToClassDialog({ target, onClose, onSent }: {
  target: SendTarget | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const [classes, setClasses] = useState<{ id: string; name: string; subject: string | null }[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [instructions, setInstructions] = useState("");
  const [due, setDue] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!target) return;
    setPicked([]);
    setInstructions("");
    setDue("");
    setClasses(null);
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { data } = await supabase.from("classrooms").select("id, name, subject")
        .eq("teacher_id", auth.user?.id ?? "").order("name");
      setClasses(data ?? []);
    })();
  }, [target]);

  async function send() {
    if (!target) return;
    setSending(true);
    try {
      const res = await distributeContent({
        kind: target.kind,
        content_id: target.id,
        classroom_ids: picked,
        subject: target.subject,
        instructions,
        due_at: due ? new Date(`${due}T23:59:00`).toISOString() : null,
      });
      toast.success(res.message);
      onSent();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o && !sending) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-base">
            Send {target?.kind === "lesson" ? "slides" : "quiz"} to students
          </DialogTitle>
          <p className="truncate text-xs text-muted-foreground">{target?.topic}</p>
        </DialogHeader>

        <div className="space-y-2">
          <Label>Classes</Label>
          {classes === null ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading classes…
            </div>
          ) : classes.length === 0 ? (
            <p className="text-sm text-muted-foreground">You have no classes yet. Create one in the Classrooms tab.</p>
          ) : (
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
              {classes.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/50">
                  <Checkbox checked={picked.includes(c.id)}
                    onCheckedChange={(v) => setPicked((p) => (v ? [...p, c.id] : p.filter((x) => x !== c.id)))} />
                  <span className="font-medium">{c.name}</span>
                  {c.subject && <span className="text-xs text-muted-foreground">{c.subject}</span>}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="send-instr">Message to students (optional)</Label>
          <Textarea id="send-instr" rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="send-due">Due date (optional)</Label>
          <Input id="send-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button onClick={() => void send()} disabled={sending || picked.length === 0}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
