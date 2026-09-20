-- student_management.sql
-- Apply in Supabase SQL Editor
-- Enables: teacher/admin manual student enrollment, profile editing, student search

-- ─────────────────────────────────────────────
-- 1. Teacher INSERT on classroom_members
--    Teachers can enroll any student into their own classrooms directly
--    (reuses existing is_classroom_teacher helper)
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Members: teacher inserts into own classroom" ON public.classroom_members;
CREATE POLICY "Members: teacher inserts into own classroom" ON public.classroom_members
  FOR INSERT TO authenticated
  WITH CHECK (public.is_classroom_teacher(classroom_id, auth.uid()));

-- ─────────────────────────────────────────────
-- 2. Admin SELECT / INSERT / DELETE on classroom_members
--    (uses has_role which reads user_roles, no circular dependency)
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Members: admin reads all" ON public.classroom_members;
CREATE POLICY "Members: admin reads all" ON public.classroom_members
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Members: admin inserts" ON public.classroom_members;
CREATE POLICY "Members: admin inserts" ON public.classroom_members
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Members: admin deletes" ON public.classroom_members;
CREATE POLICY "Members: admin deletes" ON public.classroom_members
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ─────────────────────────────────────────────
-- 3. Admin UPDATE + admin SELECT on profiles
--    UPDATE uses has_role (user_roles table, no circular dependency)
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Profiles: admin reads all" ON public.profiles;
CREATE POLICY "Profiles: admin reads all" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Profiles: admin updates" ON public.profiles;
CREATE POLICY "Profiles: admin updates" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ─────────────────────────────────────────────
-- 4. Teacher UPDATE on profiles (school + grade only, for their students)
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Profiles: teacher updates members" ON public.profiles;
CREATE POLICY "Profiles: teacher updates members" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.classroom_members cm
      JOIN public.classrooms c ON c.id = cm.classroom_id
      WHERE cm.student_id = profiles.id AND c.teacher_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────
-- 5. search_students_by_name RPC
--    SECURITY DEFINER so teachers (who cannot read all profiles) can search
--    Returns only students (role = 'student'), 20 results max
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.search_students_by_name(_query text)
RETURNS TABLE(id uuid, full_name text, school text, grade text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.school, p.grade
  FROM public.profiles p
  WHERE p.role = 'student'
    AND (
      _query = ''
      OR lower(p.full_name) LIKE '%' || lower(trim(_query)) || '%'
    )
  ORDER BY p.full_name
  LIMIT 20;
$$;

REVOKE EXECUTE ON FUNCTION public.search_students_by_name(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.search_students_by_name(text) TO authenticated;

-- ─────────────────────────────────────────────
-- 6. admin_update_profile RPC
--    Admins can update full_name, school, and grade on any profile
--    Validates caller is admin via user_roles (no circular dependency)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_update_profile(
  _target_user uuid,
  _full_name    text,
  _school       text,
  _grade        text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin_only';
  END IF;

  UPDATE public.profiles
  SET
    full_name = CASE WHEN trim(_full_name) <> '' THEN trim(_full_name) ELSE full_name END,
    school    = NULLIF(trim(_school), ''),
    grade     = NULLIF(trim(_grade), ''),
    updated_at = now()
  WHERE id = _target_user;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_update_profile(uuid, text, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_update_profile(uuid, text, text, text) TO authenticated;
