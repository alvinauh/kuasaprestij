-- G2: Penalty mini-game result persistence
-- Apply in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS game_scores (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id       UUID NOT NULL,
    quiz_session_id  UUID REFERENCES quiz_sessions(id) ON DELETE SET NULL,
    game_type        TEXT NOT NULL CHECK (game_type IN ('catch_stars', 'dino_runner', 'flappy_bird')),
    result           TEXT NOT NULL CHECK (result IN ('win', 'loss')),
    duration_ms      INTEGER,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_scores_student ON game_scores (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_scores_result   ON game_scores (result, created_at DESC);

-- RLS: students see only their own rows; teachers/admins see all
ALTER TABLE game_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "students_own_game_scores" ON game_scores
    FOR ALL USING (
        student_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role IN ('teacher', 'admin')
        )
    );
