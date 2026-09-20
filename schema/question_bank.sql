-- Adds a question bank array to topic_anchors so Q2/Q3 can be served from cache
-- without any Gemini call. The bank grows organically as questions get generated.
-- Run once in Supabase SQL editor.

ALTER TABLE topic_anchors
ADD COLUMN IF NOT EXISTS question_bank jsonb DEFAULT '[]'::jsonb;

-- Optional: index to speed up NULL checks
CREATE INDEX IF NOT EXISTS idx_topic_anchors_question_bank
  ON topic_anchors USING gin (question_bank);
