-- ══════════════════════════════════════════════════════════════
-- KuasaPrestij — Pending Migrations (sections 2–7)
-- Project: bvttqyyzmtlsddpzjpnk
-- Date: 2026-07-05
-- Section 1 (topic_anchors form_level constraint) already applied — omitted.
-- All statements are safe to re-run (IF NOT EXISTS / OR REPLACE / DROP IF EXISTS).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────
-- 2. topic_anchors: diagram_svg column
--    Stores AI-generated SVG diagrams (seeded by seed_diagrams.py)
-- ─────────────────────────────────────────────
ALTER TABLE topic_anchors
    ADD COLUMN IF NOT EXISTS diagram_svg text;


-- ─────────────────────────────────────────────
-- 3. quiz_sessions: gamification columns
--    wrong_count, streak, score per session
-- ─────────────────────────────────────────────
ALTER TABLE quiz_sessions
    ADD COLUMN IF NOT EXISTS wrong_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS streak      INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS score       INTEGER NOT NULL DEFAULT 0;


-- ─────────────────────────────────────────────
-- 4. game_scores: penalty mini-game results
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS game_scores (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id       UUID NOT NULL,
    quiz_session_id  UUID REFERENCES quiz_sessions(id) ON DELETE SET NULL,
    game_type        TEXT NOT NULL CHECK (game_type IN ('catch_stars', 'dino_runner', 'flappy_bird')),
    result           TEXT NOT NULL CHECK (result IN ('win', 'loss')),
    duration_ms      INTEGER,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_scores_student ON game_scores (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_scores_result   ON game_scores (result, created_at DESC);

ALTER TABLE game_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "students_own_game_scores" ON game_scores;
CREATE POLICY "students_own_game_scores" ON game_scores
    FOR ALL USING (
        student_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role IN ('teacher', 'admin')
        )
    );


-- ─────────────────────────────────────────────
-- 5. increment_mastery(): atomic mastery update
--    Eliminates TOCTOU race on concurrent /submit_answer calls
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_mastery(
    p_student_id       UUID,
    p_topic            TEXT,
    p_subject          TEXT,
    p_delta            FLOAT,
    p_last_assessed_at TIMESTAMPTZ,
    p_next_review_at   TIMESTAMPTZ
) RETURNS FLOAT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_val FLOAT;
BEGIN
    INSERT INTO dskp_mastery (student_id, curriculum_tag, topic, mastery_level, last_assessed_at, next_review_at)
    VALUES (
        p_student_id,
        p_subject,
        p_topic,
        GREATEST(0.0, LEAST(1.0, p_delta)),
        p_last_assessed_at,
        p_next_review_at
    )
    ON CONFLICT (student_id, curriculum_tag, topic)
    DO UPDATE SET
        mastery_level    = GREATEST(0.0, LEAST(1.0, dskp_mastery.mastery_level + p_delta)),
        last_assessed_at = EXCLUDED.last_assessed_at,
        next_review_at   = EXCLUDED.next_review_at
    RETURNING mastery_level INTO new_val;
    RETURN new_val;
END;
$$;

-- Allow feedback loop to claim rows with 'in_progress' status
ALTER TABLE user_feedback DROP CONSTRAINT IF EXISTS user_feedback_status_check;
ALTER TABLE user_feedback ADD CONSTRAINT user_feedback_status_check
    CHECK (status IN ('pending', 'in_progress', 'processed', 'dismissed'));


-- ─────────────────────────────────────────────
-- 6. classrooms + classroom_members RLS
--    + join_classroom_by_code() RPC
--    Fixes: invite-link joins not appearing in teacher panel
-- ─────────────────────────────────────────────
ALTER TABLE public.classrooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "classrooms_select_teacher" ON public.classrooms;
DROP POLICY IF EXISTS "classrooms_select_admin"   ON public.classrooms;
DROP POLICY IF EXISTS "classrooms_insert_teacher" ON public.classrooms;
DROP POLICY IF EXISTS "classrooms_update_teacher" ON public.classrooms;
DROP POLICY IF EXISTS "classrooms_delete_teacher" ON public.classrooms;
DROP POLICY IF EXISTS "classrooms_select_student" ON public.classrooms;

CREATE POLICY "classrooms_select_teacher" ON public.classrooms
    FOR SELECT USING (teacher_id = auth.uid());

CREATE POLICY "classrooms_select_admin" ON public.classrooms
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    );

CREATE POLICY "classrooms_insert_teacher" ON public.classrooms
    FOR INSERT WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "classrooms_update_teacher" ON public.classrooms
    FOR UPDATE USING (teacher_id = auth.uid());

CREATE POLICY "classrooms_delete_teacher" ON public.classrooms
    FOR DELETE USING (teacher_id = auth.uid());

CREATE POLICY "classrooms_select_student" ON public.classrooms
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.classroom_members cm
            WHERE cm.classroom_id = id AND cm.student_id = auth.uid()
        )
    );

ALTER TABLE public.classroom_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cm_select_own"     ON public.classroom_members;
DROP POLICY IF EXISTS "cm_select_teacher" ON public.classroom_members;
DROP POLICY IF EXISTS "cm_select_admin"   ON public.classroom_members;
DROP POLICY IF EXISTS "cm_insert_own"     ON public.classroom_members;
DROP POLICY IF EXISTS "cm_delete_own"     ON public.classroom_members;

CREATE POLICY "cm_select_own" ON public.classroom_members
    FOR SELECT USING (student_id = auth.uid());

CREATE POLICY "cm_select_teacher" ON public.classroom_members
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.classrooms c
            WHERE c.id = classroom_id AND c.teacher_id = auth.uid()
        )
    );

CREATE POLICY "cm_select_admin" ON public.classroom_members
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    );

CREATE POLICY "cm_insert_own" ON public.classroom_members
    FOR INSERT WITH CHECK (student_id = auth.uid());

CREATE POLICY "cm_delete_own" ON public.classroom_members
    FOR DELETE USING (student_id = auth.uid());

CREATE OR REPLACE FUNCTION public.join_classroom_by_code(_code TEXT)
RETURNS TABLE(classroom_id UUID, classroom_name TEXT, already_member BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_classroom_id   UUID;
    v_classroom_name TEXT;
    v_already        BOOLEAN;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    SELECT id, name INTO v_classroom_id, v_classroom_name
    FROM public.classrooms
    WHERE invite_code = _code
    LIMIT 1;

    IF v_classroom_id IS NULL THEN
        RAISE EXCEPTION 'invalid_code';
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM public.classroom_members cm
        WHERE cm.classroom_id = v_classroom_id AND cm.student_id = auth.uid()
    ) INTO v_already;

    IF NOT v_already THEN
        INSERT INTO public.classroom_members (classroom_id, student_id)
        VALUES (v_classroom_id, auth.uid())
        ON CONFLICT DO NOTHING;
    END IF;

    RETURN QUERY SELECT v_classroom_id, v_classroom_name, v_already;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.join_classroom_by_code(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.join_classroom_by_code(TEXT) TO authenticated;


-- ─────────────────────────────────────────────
-- 7. assignments + assigned_tasks tables + RLS
--    assignments    = class-wide tasks (teacher → whole class)
--    assigned_tasks = AI-personalised tasks (teacher → individual student)
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

CREATE POLICY "assignments_select_teacher" ON public.assignments
    FOR SELECT USING (teacher_id = auth.uid());

CREATE POLICY "assignments_insert_teacher" ON public.assignments
    FOR INSERT WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "assignments_delete_teacher" ON public.assignments
    FOR DELETE USING (teacher_id = auth.uid());

CREATE POLICY "assignments_select_student" ON public.assignments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.classroom_members cm
            WHERE cm.classroom_id = assignments.classroom_id
              AND cm.student_id = auth.uid()
        )
    );

CREATE POLICY "assignments_select_admin" ON public.assignments
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    );

CREATE TABLE IF NOT EXISTS public.assigned_tasks (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subject        TEXT,
    topic          TEXT,
    task_type      TEXT NOT NULL DEFAULT 'quiz',
    instructions   TEXT,
    teacher_note   TEXT,
    error_context  TEXT[],
    priority_score NUMERIC,
    status         TEXT NOT NULL DEFAULT 'pending',
    assigned_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at     TIMESTAMPTZ,
    completed_at   TIMESTAMPTZ,
    due_at         TIMESTAMPTZ,
    session_id     UUID
);

ALTER TABLE public.assigned_tasks
    ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_assigned_tasks_student ON public.assigned_tasks(student_id);
CREATE INDEX IF NOT EXISTS idx_assigned_tasks_status  ON public.assigned_tasks(status);

ALTER TABLE public.assigned_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "atasks_select_own"     ON public.assigned_tasks;
DROP POLICY IF EXISTS "atasks_select_teacher" ON public.assigned_tasks;
DROP POLICY IF EXISTS "atasks_update_own"     ON public.assigned_tasks;

CREATE POLICY "atasks_select_own" ON public.assigned_tasks
    FOR SELECT USING (student_id = auth.uid());

CREATE POLICY "atasks_select_teacher" ON public.assigned_tasks
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('teacher', 'admin'))
    );

CREATE POLICY "atasks_update_own" ON public.assigned_tasks
    FOR UPDATE USING (student_id = auth.uid());
