-- H5P Interactive Video integration
-- Adds h5p_content JSONB column to topic_anchors.
-- Run in Supabase SQL Editor (project bvttqyyzmtlsddpzjpnk) before deploying the backend.
-- Safe to re-run (IF NOT EXISTS guard).

ALTER TABLE topic_anchors
    ADD COLUMN IF NOT EXISTS h5p_content JSONB;

COMMENT ON COLUMN topic_anchors.h5p_content IS
    'H5P Interactive Video content blob. video.files[0].path = Pexels B-roll. '
    'assets.interactions[0] = TTS mnemonic audio (plays 0→8s). '
    'assets.interactions[1] = MCQ overlay (appears at 8s, pause=true). '
    'Correct answers are excluded — grading is done server-side via /submit_answer.';
