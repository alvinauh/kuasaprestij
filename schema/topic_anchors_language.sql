-- Migration: add language column to topic_anchors
-- Allows one cached anchor question per (topic, language) pair.
-- Run once in Supabase SQL Editor for project bvttqyyzmtlsddpzjpnk.

-- 1. Add language column; existing rows get 'English' as default.
ALTER TABLE topic_anchors
    ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'English';

-- 2. Drop the old unique constraint that covered only `topic`.
--    Supabase names it topic_anchors_topic_key by convention.
ALTER TABLE topic_anchors
    DROP CONSTRAINT IF EXISTS topic_anchors_topic_key;

-- 3. New composite unique constraint: one row per (topic, language).
ALTER TABLE topic_anchors
    ADD CONSTRAINT topic_anchors_topic_language_key UNIQUE (topic, language);
