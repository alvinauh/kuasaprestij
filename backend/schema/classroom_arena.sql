-- Live Arena (2026-10-02): multi-round classroom competition with SEPARATE
-- question points and game points. Builds on schema/classroom_live.sql.
ALTER TABLE classroom_live_sessions ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'question';  -- question | game
ALTER TABLE classroom_live_sessions ADD COLUMN IF NOT EXISTS game TEXT;
ALTER TABLE classroom_live_sessions ADD COLUMN IF NOT EXISTS duration_s INT;
ALTER TABLE classroom_live_sessions ADD COLUMN IF NOT EXISTS arena_id UUID;
CREATE INDEX IF NOT EXISTS idx_cls_live_sessions_arena ON classroom_live_sessions(arena_id);
ALTER TABLE classroom_live_answers ADD COLUMN IF NOT EXISTS points INT NOT NULL DEFAULT 0;

-- Answer keys live apart from the broadcast row: students can SELECT (and get
-- Realtime payloads of) classroom_live_sessions, so the key must not be there.
CREATE TABLE IF NOT EXISTS classroom_live_keys (
  live_session_id UUID PRIMARY KEY REFERENCES classroom_live_sessions(id) ON DELETE CASCADE,
  correct_answer  TEXT
);
ALTER TABLE classroom_live_keys ENABLE ROW LEVEL SECURITY;  -- no policies: service role only
INSERT INTO classroom_live_keys (live_session_id, correct_answer)
  SELECT id, correct_answer FROM classroom_live_sessions WHERE correct_answer IS NOT NULL
  ON CONFLICT DO NOTHING;
UPDATE classroom_live_sessions SET correct_answer = NULL WHERE correct_answer IS NOT NULL;

-- Game-round scores (best run per student per round), kept apart from question points.
CREATE TABLE IF NOT EXISTS classroom_game_scores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  live_session_id UUID NOT NULL REFERENCES classroom_live_sessions(id) ON DELETE CASCADE,
  arena_id        UUID,
  student_id      UUID NOT NULL,
  student_name    TEXT,
  score           INT  NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (live_session_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_cls_game_scores_arena ON classroom_game_scores(arena_id);
ALTER TABLE classroom_game_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_game_scores" ON classroom_game_scores;
CREATE POLICY "read_game_scores" ON classroom_game_scores FOR SELECT USING (
  EXISTS (SELECT 1 FROM classroom_live_sessions s
          JOIN classrooms c ON c.id = s.classroom_id
          WHERE s.id = classroom_game_scores.live_session_id
            AND (c.teacher_id = auth.uid()
                 OR EXISTS (SELECT 1 FROM classroom_members m
                            WHERE m.classroom_id = c.id AND m.student_id = auth.uid())))
);
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE classroom_game_scores;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE VIEW classroom_live_sessions_public AS
SELECT id, classroom_id, teacher_id, question, options, question_type,
       subject, topic, object_lesson, status, started_at, ended_at,
       kind, game, duration_s, arena_id
FROM classroom_live_sessions;

-- Answers are marked and written only by the backend (service role). A direct
-- student INSERT could self-award is_correct/points, so the policy is removed.
DROP POLICY IF EXISTS "student_insert_live_answers" ON classroom_live_answers;
