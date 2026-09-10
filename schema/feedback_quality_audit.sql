-- Feedback Quality audit results (see agents/feedback_quality.py).
-- One row per audit run: the full result blob + a couple of denormalised
-- columns for quick listing. Read/written by /admin/feedback_quality endpoints.
-- corpus_type: 'teacher_scripts' (default) or 'chat' (student-AI dialogue audit).
create table if not exists feedback_quality_audit (
  id uuid primary key default gen_random_uuid(),
  result jsonb not null,
  scripts_analyzed int,
  total_acts int,
  corpus_type text not null default 'teacher_scripts',
  created_at timestamptz not null default now()
);

-- Migration: add corpus_type if running against an existing table.
alter table feedback_quality_audit
  add column if not exists corpus_type text not null default 'teacher_scripts';

create index if not exists idx_feedback_quality_audit_created
  on feedback_quality_audit (created_at desc);
