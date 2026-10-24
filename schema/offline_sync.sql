-- Offline app answer replay (applied to Supabase on 2026-10-18).
-- /submit_answer accepts client_attempt_id from the offline queue; a retry of the same queued
-- answer is recognised and not marked twice. source/model_version/provisional keep what the
-- device showed offline next to the server's final mark.
alter table public.event_logs add column if not exists client_attempt_id text;
alter table public.event_logs add column if not exists source text not null default 'online';
alter table public.event_logs add column if not exists model_version text;
alter table public.event_logs add column if not exists provisional jsonb;
create unique index if not exists event_logs_client_attempt_id on public.event_logs (client_attempt_id)
  where client_attempt_id is not null;
