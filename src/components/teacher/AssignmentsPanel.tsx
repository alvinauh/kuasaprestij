import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2, ClipboardList, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  fetchAssignmentsForTeacher,
  createAssignment,
  deleteAssignment,
  fetchTeacherAiTasks,
  type Assignment,
  type AiTask,
} from "@/services/api";
import { toast } from "sonner";

interface Classroom {
  id: string;
  name: string;
  subject: string | null;
}

export function AssignmentsPanel() {
  const { user } = useAuth();
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [aiTasks, setAiTasks] = useState<AiTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    setAiError(null);
    try {
      const { data: cls, error: e1 } = await supabase
        .from("classrooms")
        .select("id, name, subject")
        .order("created_at", { ascending: false });
      if (e1) throw e1;
      setClassrooms((cls ?? []) as Classroom[]);
      // Load the two sources independently: an AI-task backend outage must not blank
      // out the teacher-created assignments (and vice versa).
      const [tasksRes, aiRes] = await Promise.allSettled([
        fetchAssignmentsForTeacher(user.id),
        fetchTeacherAiTasks(),
      ]);
      if (tasksRes.status === "fulfilled") setAssignments(tasksRes.value);
      else setError(tasksRes.reason instanceof Error ? tasksRes.reason.message : "Failed to load assignments");
      if (aiRes.status === "fulfilled") setAiTasks(aiRes.value);
      else setAiError("Couldn't reach the AI-tasks service — showing none. Try refreshing.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load assignments");
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const classroomName = (id: string) => classrooms.find((c) => c.id === id)?.name ?? "—";

  // Unified feed: manual classroom assignments (assignments table) + AI-personalised
  // per-student tasks (assigned_tasks table), tagged by source and sorted newest-first.
  // AI-controller output lands here too, so it no longer hides in a separate section.
  type MergedItem =
    | { kind: "manual"; id: string; ts: number; data: Assignment }
    | { kind: "ai"; id: string; ts: number; data: AiTask };
  const merged = useMemo<MergedItem[]>(() => {
    const m: MergedItem[] = assignments.map((a) => ({
      kind: "manual",
      id: a.id,
      ts: a.created_at ? new Date(a.created_at).getTime() : 0,
      data: a,
    }));
    const ai: MergedItem[] = aiTasks.map((t) => ({
      kind: "ai",
      id: t.id,
      ts: t.assigned_at ? new Date(t.assigned_at).getTime() : 0,
      data: t,
    }));
    return [...m, ...ai].sort((x, y) => y.ts - x.ts);
  }, [assignments, aiTasks]);

  const handleDelete = async (id: string) => {
    const res = await deleteAssignment(id);
    if (res.success) {
      toast.success("Assignment deleted");
      void load();
    } else toast.error(res.message);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold">Assigned Tasks</h2>
          <p className="text-sm text-muted-foreground">
            {merged.length} task{merged.length === 1 ? "" : "s"} — classroom assignments and AI-personalised tasks
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => void refresh()}
            disabled={refreshing || loading}
            className="rounded-xl"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button
            onClick={() => setShowCreate(true)}
            disabled={classrooms.length === 0}
            className="rounded-xl bg-gradient-primary shadow-glow hover:opacity-95"
          >
            <Plus className="h-4 w-4" /> New task
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}
      {aiError && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" /> {aiError}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : merged.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/40 p-10 text-center">
          <ClipboardList className="mx-auto h-8 w-8 text-muted-foreground" />
          <h3 className="mt-3 font-display text-lg font-semibold">No tasks yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {classrooms.length === 0
              ? "Create a classroom, then assign tasks — or use the AI Controller to assign personalised tasks."
              : "Create a task with \"New task\", or use the AI Controller to assign personalised tasks to students."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {merged.map((item) =>
            item.kind === "manual" ? (
              <div
                key={item.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border bg-card p-5 shadow-card"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Classroom
                    </span>
                    <h3 className="font-display text-base font-semibold">{item.data.title}</h3>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {classroomName(item.data.classroom_id)}
                    </span>
                    {item.data.subject && (
                      <span className="text-xs text-muted-foreground">{item.data.subject}</span>
                    )}
                    {item.data.topic && (
                      <span className="text-xs text-muted-foreground">· {item.data.topic}</span>
                    )}
                    {item.data.form_level && (
                      <span className="text-xs text-muted-foreground">· Form {item.data.form_level}</span>
                    )}
                  </div>
                  {item.data.instructions && (
                    <p className="mt-2 text-sm text-muted-foreground">{item.data.instructions}</p>
                  )}
                  {item.data.due_at && (
                    <p className="mt-2 text-xs text-warning">
                      Due {new Date(item.data.due_at).toLocaleString()}
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleDelete(item.data.id)}
                  className="rounded-lg text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div
                key={item.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border bg-card p-5 shadow-card"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                      AI · {item.data.student_name ?? "Student"}
                    </span>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                      {item.data.task_type}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                        item.data.status === "completed"
                          ? "bg-success/10 text-success"
                          : item.data.status === "in_progress"
                            ? "bg-warning/10 text-warning"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {item.data.status.replace("_", " ")}
                    </span>
                    {item.data.subject && (
                      <span className="text-xs text-muted-foreground">{item.data.subject}</span>
                    )}
                    {item.data.topic && (
                      <span className="text-xs text-muted-foreground">· {item.data.topic}</span>
                    )}
                  </div>
                  {item.data.instructions && (
                    <p className="mt-2 text-sm text-muted-foreground">{item.data.instructions}</p>
                  )}
                  {item.data.teacher_note && (
                    <p className="mt-1 text-xs italic text-muted-foreground">{item.data.teacher_note}</p>
                  )}
                </div>
                {item.data.assigned_at && (
                  <span className="text-xs text-muted-foreground">
                    {new Date(item.data.assigned_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            ),
          )}
        </div>
      )}

      <CreateAssignmentDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        classrooms={classrooms}
        onCreated={() => {
          setShowCreate(false);
          void load();
        }}
      />
    </div>
  );
}

function CreateAssignmentDialog({
  open,
  onOpenChange,
  classrooms,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  classrooms: Classroom[];
  onCreated: () => void;
}) {
  const { user } = useAuth();
  const [classroomId, setClassroomId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [formLevel, setFormLevel] = useState<string>("4");
  const [questionType, setQuestionType] = useState<string>("mcq");
  const [dueAt, setDueAt] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && classrooms.length > 0 && !classroomId) setClassroomId(classrooms[0].id);
    if (!open) {
      setTitle("");
      setInstructions("");
      setSubject("");
      setTopic("");
      setDueAt("");
      setError(null);
    }
  }, [open, classrooms, classroomId]);

  const handleCreate = async () => {
    if (!user || !classroomId || !title.trim()) return;
    setSubmitting(true);
    setError(null);
    const res = await createAssignment({
      classroom_id: classroomId,
      teacher_id: user.id,
      title: title.trim(),
      instructions: instructions.trim() || undefined,
      subject: subject.trim() || undefined,
      topic: topic.trim() || undefined,
      form_level: Number(formLevel) || undefined,
      question_type: questionType,
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
    });
    setSubmitting(false);
    if (!res.success) {
      setError(res.message);
      return;
    }
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New assigned task</DialogTitle>
          <DialogDescription>
            Students in the selected classroom will see this under "Assigned Tasks" when they log in.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Classroom</Label>
            <select
              value={classroomId}
              onChange={(e) => setClassroomId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {classrooms.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Practice: Forces & Motion" />
          </div>
          <div className="space-y-1.5">
            <Label>Instructions (optional)</Label>
            <Textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="What should students focus on?"
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Physics" />
            </div>
            <div className="space-y-1.5">
              <Label>Topic</Label>
              <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Forces" />
            </div>
            <div className="space-y-1.5">
              <Label>Form Level</Label>
              <select
                value={formLevel}
                onChange={(e) => setFormLevel(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="4">Form 4</option>
                <option value="5">Form 5</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Question Type</Label>
              <select
                value={questionType}
                onChange={(e) => setQuestionType(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="mcq">MCQ</option>
                <option value="short_answer">Short Answer</option>
                <option value="essay">Essay</option>
                <option value="listening">Listening</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Due date (optional)</Label>
            <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={submitting || !title.trim() || !classroomId}
            className="bg-gradient-primary shadow-glow hover:opacity-95"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
