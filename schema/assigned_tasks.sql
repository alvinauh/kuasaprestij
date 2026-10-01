-- Teacher-assigned personalised tasks
-- Run this in Supabase SQL editor once.

CREATE TABLE IF NOT EXISTS assigned_tasks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id      UUID NOT NULL,
    teacher_note    TEXT,                          -- optional message from teacher to student
    subject         TEXT NOT NULL,
    topic           TEXT NOT NULL,
    task_type       TEXT NOT NULL DEFAULT 'quiz',  -- 'quiz' | 'lesson' | 'practice'
    instructions    TEXT NOT NULL,                 -- AI-generated personalised guidance
    error_context   JSONB DEFAULT '[]',            -- error_categories that motivated this task
    priority_score  FLOAT DEFAULT 0.5,             -- inherited from remediation_plans
    status          TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'in_progress' | 'completed'
    assigned_at     TIMESTAMPTZ DEFAULT NOW(),
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    session_id      UUID                           -- linked quiz_session when student starts
);

CREATE INDEX IF NOT EXISTS idx_assigned_tasks_student ON assigned_tasks (student_id, status);
CREATE INDEX IF NOT EXISTS idx_assigned_tasks_status  ON assigned_tasks (status, assigned_at DESC);
