-- Teacher-edited copies of AI-generated slides and quizzes (Command Centre editor).
-- A lesson row with owner_id NULL is the shared cached deck (one per topic/subject/form/language);
-- a teacher's edit is saved as their own copy (owner_id = teacher) so it never changes the
-- deck other teachers and students get from the cache. One copy per teacher per deck key.

alter table public.generated_lessons
  add column if not exists owner_id uuid references public.profiles(id) on delete cascade,
  add column if not exists source_lesson_id uuid references public.generated_lessons(id) on delete set null,
  add column if not exists updated_at timestamptz;

alter table public.generated_lessons
  drop constraint if exists generated_lessons_topic_subject_form_level_language_key;
-- NULLS NOT DISTINCT keeps exactly one shared (owner_id NULL) row per key, as before.
alter table public.generated_lessons
  add constraint generated_lessons_topic_subject_form_level_language_owner_key
  unique nulls not distinct (topic, subject, form_level, language, owner_id);

alter table public.quizzes
  add column if not exists owner_id uuid references public.profiles(id) on delete cascade,
  add column if not exists source_quiz_id uuid references public.quizzes(id) on delete set null,
  add column if not exists updated_at timestamptz;

create index if not exists quizzes_owner_id_idx on public.quizzes(owner_id) where owner_id is not null;
