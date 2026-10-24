-- Question History Audit: store full question snapshot on each event_log row
-- so students and teachers can audit every question served and how it was answered.
-- Run in Supabase SQL Editor (or PostgREST proxy).

ALTER TABLE event_logs
    ADD COLUMN IF NOT EXISTS options_json    JSONB,
    ADD COLUMN IF NOT EXISTS correct_answer  TEXT,
    ADD COLUMN IF NOT EXISTS student_answer  TEXT,
    ADD COLUMN IF NOT EXISTS feedback_text   TEXT,
    ADD COLUMN IF NOT EXISTS question_type   TEXT DEFAULT 'mcq',
    ADD COLUMN IF NOT EXISTS session_id      UUID REFERENCES quiz_sessions(id) ON DELETE SET NULL;

-- Fast lookup for the student history overlay (most recent first per student).
CREATE INDEX IF NOT EXISTS idx_event_logs_student_created
    ON event_logs (student_id, created_at DESC);

-- Subject/topic filter used by the teacher audit view.
CREATE INDEX IF NOT EXISTS idx_event_logs_student_subject_topic
    ON event_logs (student_id, subject, topic, created_at DESC);
