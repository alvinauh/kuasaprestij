-- students_external_fields.sql
-- Run once in Supabase SQL Editor.
-- Adds external_id + metadata columns to students for MoE/external connector imports.

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS external_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS metadata    JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_students_external_id ON students(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_students_metadata_source ON students USING gin(metadata);
