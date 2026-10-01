-- Link an assigned task to the concrete artifact it delivers.
-- Before this, assigned_tasks carried only topic/subject TEXT, so a teacher-generated
-- slide deck (generated_lessons row) or quiz could never be opened by the student —
-- "slides generated but not distributed". These nullable FKs close that gap.
-- Additive + reversible: `alter table assigned_tasks drop column lesson_id, drop column quiz_id;`

alter table public.assigned_tasks
  add column if not exists lesson_id uuid references public.generated_lessons(id) on delete set null,
  add column if not exists quiz_id   uuid;

comment on column public.assigned_tasks.lesson_id is
  'When task_type=lesson, the generated_lessons deck the student opens. NULL for topic-only tasks.';
comment on column public.assigned_tasks.quiz_id is
  'Optional quiz artifact backing a quiz/practice task.';
