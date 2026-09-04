-- Classroom RLS + join_classroom_by_code RPC
-- Apply in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- Fixes: students joining via invite link not appearing in teacher's classroom panel

-- ─────────────────────────────────────────────
-- 1. RLS: classrooms
--    - Teachers/admins see and manage their own classrooms
--    - Students see classrooms they belong to (needed for assignment lookup)
-- ─────────────────────────────────────────────
ALTER TABLE public.classrooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "classrooms_select_teacher" ON public.classrooms;
DROP POLICY IF EXISTS "classrooms_select_admin"   ON public.classrooms;
DROP POLICY IF EXISTS "classrooms_insert_teacher" ON public.classrooms;
DROP POLICY IF EXISTS "classrooms_update_teacher" ON public.classrooms;
DROP POLICY IF EXISTS "classrooms_delete_teacher" ON public.classrooms;
DROP POLICY IF EXISTS "classrooms_select_student" ON public.classrooms;

-- Teachers see only their own classrooms
CREATE POLICY "classrooms_select_teacher" ON public.classrooms
  FOR SELECT USING (teacher_id = auth.uid());

-- Admins see all
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

-- Students see classrooms they're a member of (needed for assignment fetch)
CREATE POLICY "classrooms_select_student" ON public.classrooms
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.classroom_members cm
      WHERE cm.classroom_id = id AND cm.student_id = auth.uid()
    )
  );


-- ─────────────────────────────────────────────
-- 2. RLS: classroom_members
--    - Students see their own memberships
--    - Teachers see members of classrooms they own
--    - Admins see all
-- ─────────────────────────────────────────────
ALTER TABLE public.classroom_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cm_select_own"     ON public.classroom_members;
DROP POLICY IF EXISTS "cm_select_teacher" ON public.classroom_members;
DROP POLICY IF EXISTS "cm_select_admin"   ON public.classroom_members;
DROP POLICY IF EXISTS "cm_insert_own"     ON public.classroom_members;
DROP POLICY IF EXISTS "cm_delete_own"     ON public.classroom_members;

-- Students see their own rows
CREATE POLICY "cm_select_own" ON public.classroom_members
  FOR SELECT USING (student_id = auth.uid());

-- Teachers see rows for classrooms they own
CREATE POLICY "cm_select_teacher" ON public.classroom_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.classrooms c
      WHERE c.id = classroom_id AND c.teacher_id = auth.uid()
    )
  );

-- Admins see all
CREATE POLICY "cm_select_admin" ON public.classroom_members
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Students can insert their own membership (belt-and-suspenders; RPC handles it too)
CREATE POLICY "cm_insert_own" ON public.classroom_members
  FOR INSERT WITH CHECK (student_id = auth.uid());

-- Students can leave a classroom
CREATE POLICY "cm_delete_own" ON public.classroom_members
  FOR DELETE USING (student_id = auth.uid());


-- ─────────────────────────────────────────────
-- 3. join_classroom_by_code — SECURITY DEFINER so it bypasses RLS on insert
--    Called by students; inserts a classroom_members row as the DB owner
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.join_classroom_by_code(_code TEXT)
RETURNS TABLE(classroom_id UUID, classroom_name TEXT, already_member BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_classroom_id  UUID;
  v_classroom_name TEXT;
  v_already       BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT id, name
    INTO v_classroom_id, v_classroom_name
    FROM public.classrooms
   WHERE invite_code = _code
   LIMIT 1;

  IF v_classroom_id IS NULL THEN
    RAISE EXCEPTION 'invalid_code';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.classroom_members cm
     WHERE cm.classroom_id = v_classroom_id
       AND cm.student_id   = auth.uid()
  ) INTO v_already;

  IF NOT v_already THEN
    INSERT INTO public.classroom_members (classroom_id, student_id)
    VALUES (v_classroom_id, auth.uid())
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN QUERY SELECT v_classroom_id, v_classroom_name, v_already;
END;
$$;

-- Grant execute to authenticated users only
REVOKE EXECUTE ON FUNCTION public.join_classroom_by_code(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.join_classroom_by_code(TEXT) TO authenticated;
