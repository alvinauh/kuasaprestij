-- Teacher-writable student profiles (for setting accessibility/comfort accommodations)
-- =====================================================================================
-- Adds an UPDATE RLS policy so a teacher may update the profile row of any student who
-- is a member of a classroom the teacher owns. Needed for Phase A of the special-needs
-- accommodation_profile (a teacher can toggle a student's accommodations).
--
-- Safety:
--   * References only classrooms + classroom_members (NOT profiles) -> no recursive-RLS trap.
--   * Role changes remain blocked by the existing block_role_self_update trigger and the
--     admin-only promote_user_role() RPC (a teacher cannot escalate a student to teacher/admin).
--   * RLS is row-level (not column-level); a teacher managing their own students may also edit
--     that student's name/grade/school. This is acceptable within a classroom-management role.
--   * The frontend uses UPDATE (not upsert) so no INSERT policy is required.
--
-- Idempotent: safe to re-run.

DROP POLICY IF EXISTS "profiles_update_student_by_teacher" ON public.profiles;

CREATE POLICY "profiles_update_student_by_teacher" ON public.profiles
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.classrooms c
      JOIN public.classroom_members cm ON cm.classroom_id = c.id
      WHERE c.teacher_id = auth.uid()
        AND cm.student_id = profiles.id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.classrooms c
      JOIN public.classroom_members cm ON cm.classroom_id = c.id
      WHERE c.teacher_id = auth.uid()
        AND cm.student_id = profiles.id
    )
  );
