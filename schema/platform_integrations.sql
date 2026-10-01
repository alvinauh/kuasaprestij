-- platform_integrations — flexible API connector config (admin-only)
-- Run once in the Supabase SQL Editor (same as agent_traces.sql pattern).

CREATE TABLE IF NOT EXISTS platform_integrations (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT        NOT NULL,
  base_url         TEXT        NOT NULL,
  api_key          TEXT        NOT NULL DEFAULT '',
  auth_header      TEXT        NOT NULL DEFAULT 'Authorization',
  auth_scheme      TEXT        NOT NULL DEFAULT 'Bearer',
  field_map        JSONB       NOT NULL DEFAULT '{}',
  enabled          BOOLEAN     NOT NULL DEFAULT true,
  last_synced_at   TIMESTAMPTZ,
  last_sync_status TEXT,
  last_sync_message TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only the service role (backend) can read/write this table.
ALTER TABLE platform_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_only" ON platform_integrations;
CREATE POLICY "service_role_only" ON platform_integrations
  USING (auth.role() = 'service_role');

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_platform_integrations_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_platform_integrations_updated_at ON platform_integrations;
CREATE TRIGGER trg_platform_integrations_updated_at
  BEFORE UPDATE ON platform_integrations
  FOR EACH ROW EXECUTE FUNCTION update_platform_integrations_updated_at();
