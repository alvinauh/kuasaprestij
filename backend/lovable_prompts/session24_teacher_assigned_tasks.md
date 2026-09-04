# Session 24 — AI-Personalised Task Assignment from Flagged Students

Apply these changes to the KuasaPrestij frontend. Touch only:
- `src/components/FlaggedStudentCard.tsx`
- A new `src/components/teacher/AssignFromFlagModal.tsx` file
- `src/services/api.ts` (add one function)

Do not change `AssignmentsPanel`, `teacher.tsx`, the quiz flow, authentication, or any other screen.

---

## Context

The teacher dashboard already shows flagged students (students with persistent errors) in the Insights tab. The `FlaggedStudentCard` component expands to show root cause, intervention script, and a suggested activity.

**What's missing:** There is no way for the teacher to assign a task directly from that card. The teacher has to manually go to the "Assigned Tasks" tab and type everything by hand.

**The fix:** Add an "Assign Personalised Task" button at the bottom of the expanded `FlaggedStudentCard`. When clicked, it calls the backend AI endpoint to generate personalised task instructions based on the student's actual error data, then opens a modal pre-filled with that content for the teacher to review and submit.

---

## New backend endpoint

```
POST /teacher/generate_task
Body: { student_id: string, topic: string, subject: string }

Response:
{
  student_id: string,
  topic: string,
  subject: string,
  task_type: "quiz" | "lesson" | "practice",
  instructions: string,      // AI-written, personalised to their errors
  teacher_tip: string,       // short tip for the teacher
  error_context: string[],
  priority_score: number,
  current_mastery: number    // 0–100
}
```

The base URL is `https://178.105.130.105.nip.io:8443`.

---

## 1. Add function to `src/services/api.ts`

Add this alongside the existing assignment functions:

```ts
export interface GenerateTaskResponse {
  student_id: string;
  topic: string;
  subject: string;
  task_type: "quiz" | "lesson" | "practice";
  instructions: string;
  teacher_tip: string;
  error_context: string[];
  priority_score: number;
  current_mastery: number;
}

export async function generatePersonalisedTask(
  studentId: string,
  topic: string,
  subject: string,
): Promise<GenerateTaskResponse> {
  const res = await fetch("https://178.105.130.105.nip.io:8443/teacher/generate_task", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ student_id: studentId, topic, subject }),
  });
  if (!res.ok) throw new Error("Task generation failed");
  return res.json() as Promise<GenerateTaskResponse>;
}
```

---

## 2. Create `src/components/teacher/AssignFromFlagModal.tsx`

This modal is opened from `FlaggedStudentCard`. It calls the AI endpoint, shows the result for review, then submits to the existing `createAssignment` function.

```tsx
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
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
import { generatePersonalisedTask, createAssignment } from "@/services/api";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  studentId: string;
  topic: string;
  subject: string;
}

interface Classroom {
  id: string;
  name: string;
}

export function AssignFromFlagModal({ open, onOpenChange, studentId, topic, subject }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState<"loading" | "review" | "done">("loading");
  const [error, setError] = useState<string | null>(null);

  // Generated content
  const [taskType, setTaskType] = useState<string>("quiz");
  const [instructions, setInstructions] = useState("");
  const [teacherTip, setTeacherTip] = useState("");
  const [mastery, setMastery] = useState<number | null>(null);

  // Classroom picker
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [classroomId, setClassroomId] = useState("");
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const shortId = studentId.slice(0, 8).toUpperCase();

  // Load AI task and classrooms in parallel when modal opens
  useEffect(() => {
    if (!open) return;
    setStep("loading");
    setError(null);

    const loadClassrooms = supabase
      .from("classrooms")
      .select("id, name")
      .order("created_at", { ascending: false })
      .then(({ data }) => (data ?? []) as Classroom[]);

    const loadTask = generatePersonalisedTask(studentId, topic, subject);

    Promise.all([loadClassrooms, loadTask])
      .then(([cls, task]) => {
        setClassrooms(cls);
        if (cls.length > 0) setClassroomId(cls[0].id);
        setTaskType(task.task_type);
        setInstructions(task.instructions);
        setTeacherTip(task.teacher_tip);
        setMastery(task.current_mastery);
        setTitle(`${task.task_type === "lesson" ? "📖" : task.task_type === "quiz" ? "❓" : "🎯"} ${subject}: ${topic}`);
        setStep("review");
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to generate task");
        setStep("review");
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Reset when closed
  useEffect(() => {
    if (!open) {
      setStep("loading");
      setError(null);
      setInstructions("");
      setTeacherTip("");
      setDueAt("");
    }
  }, [open]);

  const handleAssign = async () => {
    if (!user || !classroomId || !title.trim()) return;
    setSubmitting(true);
    const res = await createAssignment({
      classroom_id: classroomId,
      teacher_id: user.id,
      title: title.trim(),
      instructions: instructions.trim() || undefined,
      subject: subject || undefined,
      topic: topic || undefined,
      form_level: 4,
      question_type: taskType === "quiz" ? "mcq" : undefined,
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
    });
    setSubmitting(false);
    if (!res.success) {
      toast.error(res.message);
      return;
    }
    toast.success(`Task assigned! Student ${shortId} will see it when they log in.`);
    setStep("done");
    onOpenChange(false);
  };

  const taskTypeBadge = (type: string) =>
    type === "lesson"
      ? "bg-purple-100 text-purple-800"
      : type === "quiz"
      ? "bg-blue-100 text-blue-800"
      : "bg-green-100 text-green-800";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign Personalised Task</DialogTitle>
          <DialogDescription>
            AI-generated task for Student {shortId} based on their error patterns in {subject} — {topic}.
          </DialogDescription>
        </DialogHeader>

        {step === "loading" && (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Analysing student errors…</p>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-4">
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            {/* Context chip */}
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Student:</span>
              <span className="font-medium">{shortId}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">Mastery:</span>
              <span className="font-medium">{mastery !== null ? `${mastery}%` : "—"}</span>
            </div>

            {/* Task type */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase">Task type</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${taskTypeBadge(taskType)}`}>
                {taskType === "lesson" ? "📖 Lesson" : taskType === "quiz" ? "❓ Quiz" : "🎯 Practice"}
              </span>
            </div>

            {/* Editable title */}
            <div className="space-y-1.5">
              <Label>Task title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            {/* Editable instructions */}
            <div className="space-y-1.5">
              <Label>Instructions for student <span className="text-muted-foreground font-normal">(edit if needed)</span></Label>
              <Textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={4}
                className="resize-none"
              />
            </div>

            {/* AI tip for teacher */}
            {teacherTip && (
              <p className="text-xs text-muted-foreground italic">
                💡 Teacher tip: {teacherTip}
              </p>
            )}

            {/* Classroom picker */}
            {classrooms.length > 0 && (
              <div className="space-y-1.5">
                <Label>Assign to classroom</Label>
                <select
                  value={classroomId}
                  onChange={(e) => setClassroomId(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {classrooms.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Optional due date */}
            <div className="space-y-1.5">
              <Label>Due date <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {step === "review" && (
            <Button
              onClick={handleAssign}
              disabled={submitting || !title.trim() || !classroomId || !!error}
              className="bg-gradient-primary shadow-glow hover:opacity-95"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Assign Task →"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

---

## 3. Update `src/components/FlaggedStudentCard.tsx`

Add the "Assign Personalised Task" button at the bottom of the expanded view, and wire it to the new modal.

The `FlaggedStudent` interface already has `student_id`, `topic`, and `error_category`. You also need `subject` — add it as an optional prop passed from `teacher.tsx` where `FlaggedStudentCard` is rendered. If no subject is available, fall back to an empty string.

**Changes to make:**

1. Import `AssignFromFlagModal` and `useState` for modal state:
```tsx
import { useState } from "react";
import { AssignFromFlagModal } from "@/components/teacher/AssignFromFlagModal";
```

2. Add `subject?: string` to the component props:
```tsx
export function FlaggedStudentCard({ student, subject = "" }: { student: FlaggedStudent; subject?: string })
```

3. Add modal state inside the component:
```tsx
const [assignOpen, setAssignOpen] = useState(false);
```

4. Add this button at the very bottom of the expanded section (after the existing `suggested_activity` block):
```tsx
<button
  onClick={() => setAssignOpen(true)}
  className="mt-1 w-full rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2 transition-colors"
>
  ✏️ Assign Personalised Task
</button>
```

5. Add the modal at the end of the component return, outside the main card div:
```tsx
<AssignFromFlagModal
  open={assignOpen}
  onOpenChange={setAssignOpen}
  studentId={student.student_id}
  topic={student.topic}
  subject={subject}
/>
```

---

## 4. Pass `subject` from `teacher.tsx`

In `teacher.tsx`, where `FlaggedStudentCard` is rendered inside the `flaggedStudents.map(...)`, find the weakest subject from `classMastery` to pass as the subject prop:

```tsx
{flaggedStudents.map((student, idx) => (
  <FlaggedStudentCard
    key={student.student_id || idx}
    student={student}
    subject={classMastery[0]?.subject ?? ""}
  />
))}
```

---

## Summary

- `FlaggedStudentCard` gains an "Assign Personalised Task" button when expanded
- Clicking it opens `AssignFromFlagModal`, which immediately calls the backend AI to generate personalised task instructions based on the student's real error data
- Teacher sees a pre-filled form they can edit, picks a classroom and optional due date, then assigns
- Task appears in the existing "Assigned Tasks" tab and in the student's task list when they log in
- No changes to `AssignmentsPanel`, the quiz flow, or any other screen
