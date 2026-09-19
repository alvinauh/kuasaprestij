
-- Join classroom by invite code (security definer bypasses classroom read restriction)
CREATE OR REPLACE FUNCTION public.join_classroom_by_code(_code text)
RETURNS TABLE(classroom_id uuid, classroom_name text, already_member boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _cls record;
  _exists boolean;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT id, name INTO _cls FROM public.classrooms
   WHERE lower(invite_code) = lower(trim(_code)) LIMIT 1;

  IF _cls.id IS NULL THEN
    RAISE EXCEPTION 'invalid_code';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.classroom_members
     WHERE classroom_id = _cls.id AND student_id = _uid
  ) INTO _exists;

  IF NOT _exists THEN
    INSERT INTO public.classroom_members(classroom_id, student_id)
    VALUES (_cls.id, _uid);
  END IF;

  RETURN QUERY SELECT _cls.id, _cls.name, _exists;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_classroom_by_code(text) TO authenticated;

-- Assignments table
CREATE TABLE public.assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  instructions text,
  subject text,
  topic text,
  form_level int,
  question_type text DEFAULT 'mcq',
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignments TO authenticated;
GRANT ALL ON public.assignments TO service_role;

ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Assignments: teacher manages own classroom"
  ON public.assignments FOR ALL TO authenticated
  USING (auth.uid() = teacher_id OR is_classroom_teacher(classroom_id, auth.uid()) OR has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = teacher_id OR is_classroom_teacher(classroom_id, auth.uid()) OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Assignments: student reads own classroom assignments"
  ON public.assignments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.classroom_members m
     WHERE m.classroom_id = assignments.classroom_id AND m.student_id = auth.uid()
  ));

CREATE INDEX assignments_classroom_idx ON public.assignments(classroom_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_assignments_updated_at
  BEFORE UPDATE ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
