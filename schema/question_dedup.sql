-- Prevent question repetition within and across sessions.
-- Run in Supabase SQL Editor.

-- 1. Track which questions a student has seen in this session.
ALTER TABLE quiz_sessions
    ADD COLUMN IF NOT EXISTS seen_questions JSONB DEFAULT '[]'::jsonb;

-- 2. Store the actual question text on every event_log row so cross-session
--    history can exclude previously seen questions from the generator.
ALTER TABLE event_logs
    ADD COLUMN IF NOT EXISTS question_text TEXT;
