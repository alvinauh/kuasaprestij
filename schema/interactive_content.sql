-- Lean interactive-question blob column on topic_anchors.
-- Replaces the bloated H5P blob (h5p_content) for frontend consumption.
-- Dual-written alongside h5p_content during the transition; see agents/orchestrator.py
-- (_build_interactive_blob) and app/main.py (serves `interactive`, converting legacy
-- h5p_content via _h5p_to_lean when interactive_content is absent).
--
-- Shape:
--   { video_url, audio_url, audio_end_sec, question, options[], mcq_start_sec,
--     drag: { sentence, distractors[], start_sec, end_sec } | null }

ALTER TABLE public.topic_anchors
  ADD COLUMN IF NOT EXISTS interactive_content JSONB;
