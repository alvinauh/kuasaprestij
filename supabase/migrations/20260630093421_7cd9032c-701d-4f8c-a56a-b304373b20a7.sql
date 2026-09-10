-- Allow teachers (and admins) to view classroom_members for classrooms they own
DROP POLICY IF EXISTS "Teachers can view members in their classrooms" ON public.classroom_members;
CREATE POLICY "Teachers can view members in their classrooms"
ON public.classroom_members FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.classrooms c
    WHERE c.id = classroom_members.classroom_id
      AND c.teacher_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- Also allow teachers to view profiles of students in their classrooms (so names show up)
DROP POLICY IF EXISTS "Teachers can view profiles of their students" ON public.profiles;
CREATE POLICY "Teachers can view profiles of their students"
ON public.profiles FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.classroom_members cm
    JOIN public.classrooms c ON c.id = cm.classroom_id
    WHERE cm.student_id = profiles.id
      AND c.teacher_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin'::app_role)
);