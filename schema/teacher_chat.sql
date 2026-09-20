-- Teacher AI controller chat memory.
-- Backs the /teacher/chat orchestrator: stores the running conversation between a
-- teacher and the AI controller, plus any artifacts (generated lessons/quizzes,
-- assigned task ids) produced during a turn so the frontend can re-render them and
-- the agent can remember what it already did.
create table if not exists public.teacher_chat (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default '00000000-0000-0000-0000-000000000001',
  thread_id  uuid not null default '00000000-0000-0000-0000-000000000001',
  role text not null check (role in ('teacher','assistant')),
  content text not null default '',
  artifacts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_teacher_chat_thread
  on public.teacher_chat (teacher_id, thread_id, created_at);
