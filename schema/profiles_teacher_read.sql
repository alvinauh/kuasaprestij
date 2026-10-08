-- Let a teacher read the profiles of students in their own classes.
-- profiles_admin_read.sql narrowed SELECT to "own row" + admins, which left teachers
-- unable to read their students' names: My Classrooms showed every student as
-- "Student" (the roster reads profiles from the browser, under RLS). Teachers could
-- still UPDATE those rows (profiles_update_student_by_teacher), just not read them.
--
-- SECURITY DEFINER like is_admin(): the check reads classrooms/classroom_members
-- without their RLS, so a policy on profiles can never recurse through them.

create or replace function public.is_my_student(p_student_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.classroom_members cm
    join public.classrooms c on c.id = cm.classroom_id
    where cm.student_id = p_student_id and c.teacher_id = auth.uid()
  );
$$;

revoke all on function public.is_my_student(uuid) from public, anon;
grant execute on function public.is_my_student(uuid) to authenticated;

drop policy if exists profiles_select_student_by_teacher on public.profiles;
create policy profiles_select_student_by_teacher on public.profiles
  for select to authenticated
  using (public.is_my_student(id));
