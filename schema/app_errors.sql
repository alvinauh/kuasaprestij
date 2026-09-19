-- Frontend error log. Written by src/lib/log-app-error.ts (global error +
-- unhandledrejection handlers); read by the Admin Console "Error Log" tab.
-- Intent: anyone (signed-in or anon) may INSERT; only admins may SELECT.

create table if not exists public.app_errors (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid,
  level      text not null default 'error',
  message    text not null,
  source     text,
  url        text,
  stack      text,
  context    jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_app_errors_created on public.app_errors (created_at desc);

alter table public.app_errors enable row level security;

-- Anyone may log an error (anon + authenticated).
drop policy if exists app_errors_insert_any on public.app_errors;
create policy app_errors_insert_any on public.app_errors
  for insert to anon, authenticated
  with check (true);

-- Only admins may read the log.
drop policy if exists app_errors_select_admin on public.app_errors;
create policy app_errors_select_admin on public.app_errors
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
