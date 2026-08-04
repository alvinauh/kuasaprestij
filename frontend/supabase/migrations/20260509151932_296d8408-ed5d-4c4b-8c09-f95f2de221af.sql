
-- Enum for roles
CREATE TYPE public.app_role AS ENUM ('student', 'teacher', 'admin');

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  role public.app_role NOT NULL DEFAULT 'student',
  school TEXT,
  grade TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles: read own" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Profiles: update own" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Profiles: insert own" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- user_roles table (separate to prevent privilege escalation)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User roles: read own" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Security definer role check
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Classrooms
CREATE TABLE public.classrooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject TEXT,
  invite_code TEXT NOT NULL UNIQUE DEFAULT lower(substr(md5(random()::text), 1, 8)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.classrooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Classrooms: teacher reads own" ON public.classrooms
  FOR SELECT TO authenticated USING (auth.uid() = teacher_id);
CREATE POLICY "Classrooms: teacher inserts own" ON public.classrooms
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = teacher_id AND public.has_role(auth.uid(), 'teacher'));
CREATE POLICY "Classrooms: teacher updates own" ON public.classrooms
  FOR UPDATE TO authenticated USING (auth.uid() = teacher_id);
CREATE POLICY "Classrooms: teacher deletes own" ON public.classrooms
  FOR DELETE TO authenticated USING (auth.uid() = teacher_id);

-- Classroom members
CREATE TABLE public.classroom_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(classroom_id, student_id)
);
ALTER TABLE public.classroom_members ENABLE ROW LEVEL SECURITY;

-- Helper to check if a classroom belongs to current teacher
CREATE OR REPLACE FUNCTION public.is_classroom_teacher(_classroom_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.classrooms WHERE id = _classroom_id AND teacher_id = _user_id)
$$;

CREATE POLICY "Members: teacher reads classroom members" ON public.classroom_members
  FOR SELECT TO authenticated USING (
    auth.uid() = student_id OR public.is_classroom_teacher(classroom_id, auth.uid())
  );
CREATE POLICY "Members: student inserts self" ON public.classroom_members
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = student_id);
CREATE POLICY "Members: teacher deletes from own classroom" ON public.classroom_members
  FOR DELETE TO authenticated USING (public.is_classroom_teacher(classroom_id, auth.uid()));

-- Allow teachers to read profiles of their classroom members
CREATE POLICY "Profiles: teacher reads members" ON public.profiles
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.classroom_members cm
      JOIN public.classrooms c ON c.id = cm.classroom_id
      WHERE cm.student_id = profiles.id AND c.teacher_id = auth.uid()
    )
  );

-- Auto-create profile + role on signup using user metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _role public.app_role;
BEGIN
  _role := COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'student');
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
