-- ─────────────────────────────────────────────────────────────────────────────
-- remediation_plans  (AI-generated per-student topic priority queue)
-- Run once in Supabase SQL Editor for project bvttqyyzmtlsddpzjpnk
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS remediation_plans (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id            UUID NOT NULL,
    subject               TEXT NOT NULL,
    topic                 TEXT NOT NULL,
    priority_score        NUMERIC(5,3) NOT NULL DEFAULT 0.5,
    reason                TEXT,
    error_categories      TEXT[],          -- e.g. ['conceptual_error', 'calculation_error']
    root_causes           TEXT[],          -- short phrases from event_logs.root_cause
    suggested_intervention TEXT,           -- Gemini-generated intervention text
    status                TEXT NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'done')),
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_remediation_student_status
    ON remediation_plans (student_id, status, priority_score DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_remediation_student_topic
    ON remediation_plans (student_id, topic);

-- Reuse set_updated_at() if already defined (lessons_quiz.sql); create if missing.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS remediation_plans_updated_at ON remediation_plans;
CREATE TRIGGER remediation_plans_updated_at
    BEFORE UPDATE ON remediation_plans
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS: students see only their own plan rows; teacher/admin see all.
ALTER TABLE remediation_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "student_own_plan" ON remediation_plans
    FOR ALL USING (auth.uid() = student_id);

CREATE POLICY "teacher_admin_all_plans" ON remediation_plans
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role IN ('teacher', 'admin')
        )
    );
