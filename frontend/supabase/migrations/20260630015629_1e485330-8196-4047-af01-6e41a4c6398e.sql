DROP POLICY IF EXISTS "Classrooms: teacher inserts own" ON public.classrooms;
CREATE POLICY "Classrooms: teacher or admin inserts own" ON public.classrooms
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = teacher_id
  AND (public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin'))
);