-- KuasaPrestij: generated_lessons + quizzes tables
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New Query)

-- ─────────────────────────────────────────────
-- 1. generated_lessons
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS generated_lessons (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic       TEXT NOT NULL,
    subject     TEXT NOT NULL,
    form_level  INTEGER NOT NULL,
    language    TEXT NOT NULL DEFAULT 'English',
    title       TEXT,
    dskp_code   TEXT,
    notes_content TEXT,           -- full Markdown notes
    notes_json  JSONB,            -- structured notes object
    created_at  TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE (topic, subject, form_level, language)
);

-- Index for lookup by topic + subject
CREATE INDEX IF NOT EXISTS idx_lessons_topic_subject
    ON generated_lessons (topic, subject, form_level);

-- ─────────────────────────────────────────────
-- 2. quizzes
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quizzes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id       UUID REFERENCES generated_lessons(id) ON DELETE SET NULL,
    topic           TEXT,
    questions_jsonb JSONB NOT NULL,   -- array of question objects
    difficulty_level TEXT NOT NULL DEFAULT 'medium',
    question_type   TEXT NOT NULL DEFAULT 'mcq',   -- 'mcq' | 'short_answer' | 'essay'
    num_questions   INTEGER,
    language        TEXT DEFAULT 'English',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quizzes_lesson_id ON quizzes (lesson_id);

-- ─────────────────────────────────────────────
-- 3. user_feedback  (for feedback_loop.py)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_feedback (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id            UUID,
    quiz_id               UUID REFERENCES quizzes(id) ON DELETE SET NULL,
    lesson_id             UUID REFERENCES generated_lessons(id) ON DELETE SET NULL,
    test_score            NUMERIC(4,2),          -- 0.00–1.00
    suggested_improvements TEXT,
    raw_payload           JSONB,                 -- full Lovable request body
    status                TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'dismissed')),
    created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_status ON user_feedback (status);

-- ─────────────────────────────────────────────
-- 4. quiz_sessions  (for session resume)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quiz_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id      UUID NOT NULL,
    topic           TEXT NOT NULL,
    subject         TEXT NOT NULL,
    language        TEXT NOT NULL DEFAULT 'English',
    question_type   TEXT NOT NULL DEFAULT 'mcq',
    is_adaptive     BOOLEAN NOT NULL DEFAULT FALSE,
    lesson_id       UUID REFERENCES generated_lessons(id) ON DELETE SET NULL,
    current_draft   JSONB,              -- current unanswered question; NULL after student submits
    answered_count  INTEGER NOT NULL DEFAULT 0,
    mastery_score   NUMERIC(5,3) NOT NULL DEFAULT 0.0,
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'complete')),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quiz_sessions_student ON quiz_sessions (student_id, status);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS quiz_sessions_updated_at ON quiz_sessions;
CREATE TRIGGER quiz_sessions_updated_at
    BEFORE UPDATE ON quiz_sessions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────
-- 5. chat_history  (for chat_agent.py)
-- ─────────────────────────────────────────────
-- Chat history is grounded on EITHER a lesson (lesson mode) OR a quiz session
-- (question-feed mode). Exactly one anchor must be present.
CREATE TABLE IF NOT EXISTS chat_history (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id  UUID NOT NULL,
    lesson_id   UUID REFERENCES generated_lessons(id) ON DELETE CASCADE,
    session_id  UUID REFERENCES quiz_sessions(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('student', 'tutor')),
    content     TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chat_history_context_present
        CHECK (lesson_id IS NOT NULL OR session_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_chat_history_student_lesson
    ON chat_history (student_id, lesson_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_history_student_session
    ON chat_history (student_id, session_id, created_at);

-- ─────────────────────────────────────────────
-- MIGRATIONS (run against existing deployments)
-- ─────────────────────────────────────────────
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS question_type TEXT NOT NULL DEFAULT 'mcq';
CREATE INDEX IF NOT EXISTS idx_quizzes_question_type ON quizzes (question_type);

-- Applied 2026-07-13: allow chat_history to anchor on a quiz session (question-feed tutor).
ALTER TABLE chat_history ALTER COLUMN lesson_id DROP NOT NULL;
ALTER TABLE chat_history ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES quiz_sessions(id) ON DELETE CASCADE;
ALTER TABLE chat_history DROP CONSTRAINT IF EXISTS chat_history_context_present;
ALTER TABLE chat_history ADD CONSTRAINT chat_history_context_present
    CHECK (lesson_id IS NOT NULL OR session_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_chat_history_student_session
    ON chat_history (student_id, session_id, created_at);
