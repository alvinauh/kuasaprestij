-- Let admins read ALL profiles (for the Admin Console "Users" tab).
-- profiles previously had only profiles_select_own (auth.uid() = id), so an
-- admin's session could see only its own row → the console showed 1 user.
--
-- The admin check uses a SECURITY DEFINER function so its lookup bypasses RLS —
-- a policy on profiles that SELECTed profiles directly would recurse infinitely.

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles
  for select to authenticated
  using (public.is_admin());
