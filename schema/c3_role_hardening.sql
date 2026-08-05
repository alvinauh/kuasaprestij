-- C3 Security Fix: Role privilege escalation hardening
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- Frontend Supabase project: bvttqyyzmtlsddpzjpnk

-- ─────────────────────────────────────────────
-- 1. Fix handle_new_user() — always assign role='student' regardless of
--    what the signup form sends in raw_user_meta_data.
--    Teacher/admin role must be promoted via admin action only.
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'student'   -- HARDCODED: never trust client-supplied role
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Ensure the trigger is wired up (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ─────────────────────────────────────────────
-- 2. Admin-only role promotion function
--    Only a service_role or postgres superuser can call this.
--    Usage: SELECT promote_user_role('<user_uuid>', 'teacher');
-- ─────────────────────────────────────────────
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
  UPDATE public.profiles SET role = new_role WHERE id = target_user_id;
END;
$$;

-- Revoke public execute so only service_role/postgres can call it
REVOKE EXECUTE ON FUNCTION public.promote_user_role(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.promote_user_role(UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.promote_user_role(UUID, TEXT) FROM authenticated;


-- ─────────────────────────────────────────────
-- 3. RLS: profiles table
--    - Users can read their own profile
--    - Users can update their own profile (but NOT the role column)
--    - Admins can read all profiles
-- ─────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own"   ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own"   ON public.profiles;

CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_select_admin" ON public.profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'teacher')
    )
  );

-- Allow users to update their own profile but block role changes via a column check trigger
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Trigger to prevent self-promotion via UPDATE
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


-- ─────────────────────────────────────────────
-- 4. RLS: student_daily_report view (teacher/admin only)
--    Protects the class-wide report used by /teacher_insights.
-- ─────────────────────────────────────────────
-- If student_daily_report is a VIEW, wrap it in a security barrier view or
-- add an RLS-equivalent function check. Views don't support RLS directly —
-- use a security-definer function or restrict via the underlying tables.

-- For the underlying event_logs table (students see only their own rows):
ALTER TABLE public.event_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_logs_select_own"    ON public.event_logs;
DROP POLICY IF EXISTS "event_logs_select_teacher" ON public.event_logs;
DROP POLICY IF EXISTS "event_logs_insert_own"    ON public.event_logs;

CREATE POLICY "event_logs_select_own" ON public.event_logs
  FOR SELECT USING (student_id = auth.uid());

CREATE POLICY "event_logs_select_teacher" ON public.event_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('teacher', 'admin')
    )
  );

CREATE POLICY "event_logs_insert_own" ON public.event_logs
  FOR INSERT WITH CHECK (student_id = auth.uid());


-- ─────────────────────────────────────────────
-- 5. RLS: dskp_mastery (students see only their own mastery)
-- ─────────────────────────────────────────────
ALTER TABLE public.dskp_mastery ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mastery_select_own"    ON public.dskp_mastery;
DROP POLICY IF EXISTS "mastery_select_teacher" ON public.dskp_mastery;
DROP POLICY IF EXISTS "mastery_upsert_own"    ON public.dskp_mastery;

CREATE POLICY "mastery_select_own" ON public.dskp_mastery
  FOR SELECT USING (student_id = auth.uid());

CREATE POLICY "mastery_select_teacher" ON public.dskp_mastery
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('teacher', 'admin')
    )
  );

CREATE POLICY "mastery_upsert_own" ON public.dskp_mastery
  FOR ALL USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());
