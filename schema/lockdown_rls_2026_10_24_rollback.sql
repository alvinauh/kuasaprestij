-- Rollback for lockdown_rls_2026_10_24.sql (re-opens anonymous access; emergency use only).
do $$
declare t text;
begin
  foreach t in array array[
    'chat_history','feedback_quality_audit','generated_lessons','llm_call_logs','media_cache',
    'question_skips','quiz_sessions','quizzes','student_perks','students','syllabus_embeddings',
    'teacher_chat','topic_anchors','user_feedback'
  ] loop
    execute format('alter table public.%I disable row level security', t);
    execute format('grant all on public.%I to anon, authenticated', t);
  end loop;
end $$;
grant all on public.classroom_live_sessions_public to anon, authenticated;
grant all on public.student_coin_balance to anon, authenticated;
