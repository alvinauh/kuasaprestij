-- 1. Admin role infrastructure: promote the first user to admin and gate admin-only access

-- Promote first user to admin: replace handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _role public.app_role;
  _is_first boolean;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO _is_first;

  IF _is_first THEN
    _role := 'admin';
  ELSE
    _role := COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'student');
  END IF;

  INSERT INTO public.profiles (id, full_name, role, school, grade)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    _role,
    NEW.raw_user_meta_data->>'school',
    NEW.raw_user_meta_data->>'grade'
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role);
  RETURN NEW;
END;
$$;

-- Ensure trigger exists (no-op if already present under a different name)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

-- 2. Admin-scoped policies on existing tables

-- profiles: admin can read & update all
CREATE POLICY "Profiles: admin reads all"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Profiles: admin updates all"
  ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- classrooms: admin sees & deletes all
CREATE POLICY "Classrooms: admin reads all"
  ON public.classrooms FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Classrooms: admin deletes all"
  ON public.classrooms FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- user_roles: admin can read & write all (use security-definer fns from server)
CREATE POLICY "User roles: admin reads all"
  ON public.user_roles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "User roles: admin inserts"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "User roles: admin deletes"
  ON public.user_roles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- classroom_members: admin reads all
CREATE POLICY "Members: admin reads all"
  ON public.classroom_members FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3. app_errors table for the error log viewer
CREATE TABLE public.app_errors (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  level text NOT NULL DEFAULT 'error',
  message text NOT NULL,
  source text,
  url text,
  stack text,
  context jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.app_errors TO authenticated;
GRANT INSERT ON public.app_errors TO anon;
GRANT ALL ON public.app_errors TO service_role;

ALTER TABLE public.app_errors ENABLE ROW LEVEL SECURITY;

-- Anyone (signed-in or anon) may insert their own error report
CREATE POLICY "App errors: anyone can log"
  ON public.app_errors FOR INSERT TO authenticated, anon
  WITH CHECK (true);

-- Only admins can read
CREATE POLICY "App errors: admin reads"
  ON public.app_errors FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_app_errors_created_at ON public.app_errors (created_at DESC);

-- 4. Helper: admin updates a user's role atomically
CREATE OR REPLACE FUNCTION public.admin_set_user_role(_target_user uuid, _new_role public.app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _target_user;
  INSERT INTO public.user_roles (user_id, role) VALUES (_target_user, _new_role);
  UPDATE public.profiles SET role = _new_role, updated_at = now() WHERE id = _target_user;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_role(uuid, public.app_role) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, public.app_role) TO authenticated;