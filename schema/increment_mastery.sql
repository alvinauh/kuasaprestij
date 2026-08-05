-- Atomic mastery increment — eliminates TOCTOU race when two /submit_answer
-- calls arrive simultaneously for the same student+topic.
--
-- Apply in Supabase SQL Editor before deploying the matching orchestrator.py change.

CREATE OR REPLACE FUNCTION increment_mastery(
    p_student_id      UUID,
    p_topic           TEXT,
    p_subject         TEXT,
    p_delta           FLOAT,
    p_last_assessed_at TIMESTAMPTZ,
    p_next_review_at  TIMESTAMPTZ
) RETURNS FLOAT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_val FLOAT;
BEGIN
    INSERT INTO dskp_mastery (student_id, curriculum_tag, topic, mastery_level, last_assessed_at, next_review_at)
    VALUES (
        p_student_id,
        p_subject,
        p_topic,
        GREATEST(0.0, LEAST(1.0, p_delta)),
        p_last_assessed_at,
        p_next_review_at
    )
    ON CONFLICT (student_id, curriculum_tag, topic)
    DO UPDATE SET
        mastery_level      = GREATEST(0.0, LEAST(1.0, dskp_mastery.mastery_level + p_delta)),
        last_assessed_at   = EXCLUDED.last_assessed_at,
        next_review_at     = EXCLUDED.next_review_at
    RETURNING mastery_level INTO new_val;
    RETURN new_val;
END;
$$;

-- Allow 'in_progress' status for feedback rows claimed by the feedback loop agent.
ALTER TABLE user_feedback DROP CONSTRAINT IF EXISTS user_feedback_status_check;
ALTER TABLE user_feedback ADD CONSTRAINT user_feedback_status_check
    CHECK (status IN ('pending', 'in_progress', 'processed', 'dismissed'));
