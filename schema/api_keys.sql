-- api_keys — generated keys that let external platforms pull data from KuasaPrestij.
-- Run once in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS api_keys (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  key_hash     TEXT        NOT NULL UNIQUE,   -- SHA-256 of the raw key (never store raw)
  key_prefix   TEXT        NOT NULL,          -- first 10 chars for display/identification
  scopes       TEXT[]      NOT NULL DEFAULT '{}',
  created_by   UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  enabled      BOOLEAN     NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_only" ON api_keys;
CREATE POLICY "service_role_only" ON api_keys
  USING (auth.role() = 'service_role');
