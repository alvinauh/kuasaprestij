-- integration_direct_db.sql
-- Run once in Supabase SQL Editor.
-- Adds direct-TCP (Postgres) connector support + staging table.

-- 1. New columns on platform_integrations
ALTER TABLE platform_integrations
  ADD COLUMN IF NOT EXISTS connection_type TEXT NOT NULL DEFAULT 'rest',
  ADD COLUMN IF NOT EXISTS db_host        TEXT,
  ADD COLUMN IF NOT EXISTS db_port        INTEGER,
  ADD COLUMN IF NOT EXISTS db_name        TEXT,
  ADD COLUMN IF NOT EXISTS db_user        TEXT,
  ADD COLUMN IF NOT EXISTS db_password    TEXT,
  ADD COLUMN IF NOT EXISTS db_query       TEXT;

-- 2. Staging table — holds rows pulled via a direct-TCP connector
CREATE TABLE IF NOT EXISTS integration_staging (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID        NOT NULL REFERENCES platform_integrations(id) ON DELETE CASCADE,
  row_data       JSONB       NOT NULL,
  pulled_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE integration_staging ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_only" ON integration_staging;
CREATE POLICY "service_role_only" ON integration_staging
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_integration_staging_integration_id
  ON integration_staging(integration_id);
