-- 2026-10-24 — close anonymous access to backend-only tables.
-- Audit found 13 tables + 2 views in `public` with RLS off and ALL privileges granted to
-- `anon` (the public key shipped in the web app): anyone could read AND edit students,
-- quiz sessions, chat history, answer keys (topic_anchors), feedback, LLM logs.
-- The FastAPI backend uses the service_role key, which bypasses RLS, so enabling RLS with no
-- policies + revoking the grants only removes access for browsers. The web app reads none of
-- these directly except topic_anchors (offline question pack), which now goes through
-- get_offline_pack() below.

do $$
declare t text;
begin
  foreach t in array array[
    'chat_history','feedback_quality_audit','generated_lessons','llm_call_logs','media_cache',
    'question_skips','quiz_sessions','quizzes','student_perks','students','syllabus_embeddings',
    'teacher_chat','topic_anchors','user_feedback'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

revoke all on public.classroom_live_sessions_public from anon, authenticated;
revoke all on public.student_coin_balance from anon, authenticated;

-- Offline question pack: signed-in users only, logged, throttled.
create table if not exists public.offline_pack_downloads (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  subjects text[],
  created_at timestamptz not null default now()
);
alter table public.offline_pack_downloads enable row level security;
revoke all on public.offline_pack_downloads from anon, authenticated;
create index if not exists offline_pack_downloads_user_time
  on public.offline_pack_downloads (user_id, created_at desc);

create or replace function public.get_offline_pack(p_subjects text[] default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  recent int;
  result jsonb;
begin
  if uid is null then
    raise exception 'Sign in to download the question pack' using errcode = '28000';
  end if;

  select count(*) into recent from offline_pack_downloads
   where user_id = uid and created_at > now() - interval '24 hours';
  if recent >= 6 then
    raise exception 'Download limit reached (6 per day). Try again tomorrow.' using errcode = '54000';
  end if;
  insert into offline_pack_downloads (user_id, subjects) values (uid, p_subjects);

  select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]'::jsonb) into result
  from (
    select id, subject, topic, language, form_level, anchor_question, question_bank,
           mnemonic_lyrics, worked_example
      from topic_anchors
     where p_subjects is null or lower(subject) = any (select lower(s) from unnest(p_subjects) s)
  ) r;
  return result;
end $$;

revoke all on function public.get_offline_pack(text[]) from public, anon;
grant execute on function public.get_offline_pack(text[]) to authenticated;
