-- assignments table RLS + assigned_tasks additions
-- Apply in Supabase SQL Editor

-- ─────────────────────────────────────────────
-- 1. assignments table — create if missing, then RLS
--    Class-wide tasks created by teachers
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assignments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id  UUID NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  teacher_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  instructions  TEXT,
  subject       TEXT,
  topic         TEXT,
  form_level    INTEGER,
  question_type TEXT DEFAULT 'mcq',
  due_at        TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assignments_classroom ON public.assignments(classroom_id);
CREATE INDEX IF NOT EXISTS idx_assignments_teacher   ON public.assignments(teacher_id);

ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "assignments_select_teacher" ON public.assignments;
DROP POLICY IF EXISTS "assignments_insert_teacher" ON public.assignments;
DROP POLICY IF EXISTS "assignments_delete_teacher" ON public.assignments;
DROP POLICY IF EXISTS "assignments_select_student" ON public.assignments;
DROP POLICY IF EXISTS "assignments_select_admin"   ON public.assignments;

-- Teachers manage their own assignments
CREATE POLICY "assignments_select_teacher" ON public.assignments
  FOR SELECT USING (teacher_id = auth.uid());

CREATE POLICY "assignments_insert_teacher" ON public.assignments
  FOR INSERT WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "assignments_delete_teacher" ON public.assignments
  FOR DELETE USING (teacher_id = auth.uid());

-- Students see assignments for classrooms they belong to
CREATE POLICY "assignments_select_student" ON public.assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.classroom_members cm
      WHERE cm.classroom_id = assignments.classroom_id
        AND cm.student_id = auth.uid()
    )
  );

-- Admins see all
CREATE POLICY "assignments_select_admin" ON public.assignments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );


-- ─────────────────────────────────────────────
-- 2. assigned_tasks — create if missing, then RLS
--    Individual AI-personalised tasks from backend
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assigned_tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject         TEXT,
  topic           TEXT,
  task_type       TEXT NOT NULL DEFAULT 'quiz',
  instructions    TEXT,
  teacher_note    TEXT,
  error_context   TEXT[],
  priority_score  NUMERIC,
  status          TEXT NOT NULL DEFAULT 'pending',
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  due_at          TIMESTAMPTZ,
  session_id      UUID
);

CREATE INDEX IF NOT EXISTS idx_assigned_tasks_student ON public.assigned_tasks(student_id);
CREATE INDEX IF NOT EXISTS idx_assigned_tasks_status  ON public.assigned_tasks(status);

ALTER TABLE public.assigned_tasks
  ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;

ALTER TABLE public.assigned_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "atasks_select_own"     ON public.assigned_tasks;
DROP POLICY IF EXISTS "atasks_select_teacher" ON public.assigned_tasks;
DROP POLICY IF EXISTS "atasks_select_admin"   ON public.assigned_tasks;
DROP POLICY IF EXISTS "atasks_update_own"     ON public.assigned_tasks;

-- Students see their own tasks
CREATE POLICY "atasks_select_own" ON public.assigned_tasks
  FOR SELECT USING (student_id = auth.uid());

-- Teachers see all (no teacher_id column — teachers own the whole dataset)
CREATE POLICY "atasks_select_teacher" ON public.assigned_tasks
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('teacher', 'admin'))
  );

-- Students can update their own tasks (status transitions: start/complete)
CREATE POLICY "atasks_update_own" ON public.assigned_tasks
  FOR UPDATE USING (student_id = auth.uid());
