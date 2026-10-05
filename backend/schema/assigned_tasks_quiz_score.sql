-- Quiz score on the task a student completed (first attempt counts; retakes don't overwrite).
alter table public.assigned_tasks
  add column if not exists score integer,
  add column if not exists max_score integer,
  add column if not exists submitted_answers jsonb;
