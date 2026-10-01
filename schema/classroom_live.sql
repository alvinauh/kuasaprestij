-- classroom_live_sessions: one row per live quiz broadcast by a teacher.
-- Students read this (minus correct_answer) via classroom_live_sessions_public.
CREATE TABLE IF NOT EXISTS classroom_live_sessions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id    UUID        NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  teacher_id      UUID        NOT NULL,
  question        TEXT        NOT NULL,
  options         JSONB,
  correct_answer  TEXT,
  question_type   TEXT        NOT NULL DEFAULT 'mcq',
  subject         TEXT,
  topic           TEXT,
  object_lesson   TEXT,
  status          TEXT        NOT NULL DEFAULT 'active',  -- active | complete
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMPTZ
);

-- classroom_live_answers: one row per student answer in a live session.
CREATE TABLE IF NOT EXISTS classroom_live_answers (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  live_session_id UUID        NOT NULL REFERENCES classroom_live_sessions(id) ON DELETE CASCADE,
  student_id      UUID        NOT NULL,
  student_name    TEXT,
  answer          TEXT        NOT NULL,
  is_correct      BOOLEAN     NOT NULL DEFAULT FALSE,
  answered_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cls_live_sessions_classroom_status
  ON classroom_live_sessions(classroom_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cls_live_answers_unique
  ON classroom_live_answers(live_session_id, student_id);
CREATE INDEX IF NOT EXISTS idx_cls_live_answers_session
  ON classroom_live_answers(live_session_id, answered_at);

-- View that strips correct_answer so students can read safely via Realtime.
CREATE OR REPLACE VIEW classroom_live_sessions_public AS
SELECT id, classroom_id, teacher_id, question, options, question_type,
       subject, topic, object_lesson, status, started_at, ended_at
FROM classroom_live_sessions;

-- Enable Supabase Realtime on both tables.
ALTER PUBLICATION supabase_realtime ADD TABLE classroom_live_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE classroom_live_answers;

-- RLS
ALTER TABLE classroom_live_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE classroom_live_answers  ENABLE ROW LEVEL SECURITY;

-- Teachers: full control over their own live sessions.
CREATE POLICY "teacher_manage_live_sessions"
  ON classroom_live_sessions FOR ALL
  USING  (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

-- Students: read sessions for classrooms they belong to.
CREATE POLICY "student_read_live_sessions"
  ON classroom_live_sessions FOR SELECT
  USING (
    classroom_id IN (
      SELECT classroom_id FROM classroom_members WHERE student_id = auth.uid()
    )
  );

-- Students: insert their own answer.
CREATE POLICY "student_insert_live_answers"
  ON classroom_live_answers FOR INSERT
  WITH CHECK (student_id = auth.uid());

-- Everyone: read all answers for sessions they can access.
CREATE POLICY "read_live_answers"
  ON classroom_live_answers FOR SELECT
  USING (
    live_session_id IN (
      SELECT id FROM classroom_live_sessions
      WHERE teacher_id = auth.uid()
         OR classroom_id IN (
              SELECT classroom_id FROM classroom_members WHERE student_id = auth.uid()
            )
    )
  );
