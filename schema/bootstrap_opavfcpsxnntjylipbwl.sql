-- Bootstrap migration for opavfcpsxnntjylipbwl
-- Run once in: supabase.com/dashboard/project/opavfcpsxnntjylipbwl/editor
-- Safe to re-run (IF NOT EXISTS / OR REPLACE / DROP IF EXISTS).

-- ── 1. Enum ────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('student', 'teacher', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 2. Profiles table ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT NOT NULL DEFAULT '',
  role        public.app_role NOT NULL DEFAULT 'student',
  school      TEXT,
  grade       TEXT,
  preferences JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ── 3. RLS policies for profiles ─────────────────────────────
DROP POLICY IF EXISTS "profiles_select_own"        ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_admin"       ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own"         ON public.profiles;
DROP POLICY IF EXISTS "Profiles: read own"          ON public.profiles;
DROP POLICY IF EXISTS "Profiles: update own"        ON public.profiles;
DROP POLICY IF EXISTS "Profiles: insert own"        ON public.profiles;
DROP POLICY IF EXISTS "Profiles: teacher reads members" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own preferences" ON public.profiles;

CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- NOTE: no self-referencing teacher policy here — it causes infinite recursion in Supabase.
-- Teachers reading student profiles is handled via the classrooms join path.

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ── 4. handle_new_user trigger (security-hardened) ───────────
-- Role is HARDCODED to 'student'. Promotion must go through admin.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, school, grade)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'student',
    NEW.raw_user_meta_data->>'school',
    NEW.raw_user_meta_data->>'grade'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Prevent role self-escalation via UPDATE
CREATE OR REPLACE FUNCTION public.prevent_role_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.role <> OLD.role THEN
    RAISE EXCEPTION 'Role changes must go through an administrator.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_role_self_update ON public.profiles;
CREATE TRIGGER block_role_self_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (NEW.role IS DISTINCT FROM OLD.role)
  EXECUTE FUNCTION public.prevent_role_self_update();

-- ── 5. Admin role-promotion function ─────────────────────────
CREATE OR REPLACE FUNCTION public.promote_user_role(target_user_id UUID, new_role TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF new_role NOT IN ('student', 'teacher', 'admin') THEN
    RAISE EXCEPTION 'Invalid role: %', new_role;
  END IF;
  UPDATE public.profiles SET role = new_role::public.app_role WHERE id = target_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.promote_user_role(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- ── 6. Classrooms ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.classrooms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  subject     TEXT,
  invite_code TEXT NOT NULL UNIQUE DEFAULT lower(substr(md5(gen_random_uuid()::text), 1, 8)),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

-- ── 7. Classroom members ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.classroom_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  student_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(classroom_id, student_id)
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

-- ── 8. join_classroom_by_code RPC ────────────────────────────
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
