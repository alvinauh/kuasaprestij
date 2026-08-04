-- Feedback Quality audit results (see agents/feedback_quality.py).
-- One row per audit run: the full result blob + a couple of denormalised
-- columns for quick listing. Read/written by /admin/feedback_quality endpoints.
create table if not exists feedback_quality_audit (
  id uuid primary key default gen_random_uuid(),
  result jsonb not null,
  scripts_analyzed int,
  total_acts int,
  created_at timestamptz not null default now()
);

create index if not exists idx_feedback_quality_audit_created
  on feedback_quality_audit (created_at desc);
