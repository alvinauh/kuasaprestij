-- Migration: add form_level column to topic_anchors
-- Fixes F4 vs F5 collision for topics with identical names across forms
-- (e.g. KOMSAS: Prosa Tradisional, Literature: Poetry).
-- Run once in Supabase SQL Editor for the backend project (opavfcpsxnntjylipbwl).

-- 1. Add form_level; existing rows default to Form 4.
ALTER TABLE topic_anchors
    ADD COLUMN IF NOT EXISTS form_level INTEGER NOT NULL DEFAULT 4;

-- 2. Drop the old (topic, language) unique constraint.
ALTER TABLE topic_anchors
    DROP CONSTRAINT IF EXISTS topic_anchors_topic_language_key;

-- 3. New composite unique constraint: one row per (topic, language, form_level).
ALTER TABLE topic_anchors
    ADD CONSTRAINT topic_anchors_topic_language_form_key
    UNIQUE (topic, language, form_level);
