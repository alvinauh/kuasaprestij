-- ── Perk & Coin Economy ─────────────────────────────────────────────────────
-- Apply in Supabase SQL Editor.

-- Append-only coin ledger. Never UPDATE/DELETE rows — balance is always SUM().
CREATE TABLE IF NOT EXISTS coin_transactions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount     INTEGER     NOT NULL,
  reason     TEXT        NOT NULL,  -- 'correct_answer'|'game_win'|'mastery_milestone'|'daily_streak'|'perk_purchase'|'purchase_refund'
  meta       JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coin_tx_student_time ON coin_transactions(student_id, created_at DESC);

-- Live balance view — backend reads this via student_coin_balance table.
CREATE OR REPLACE VIEW student_coin_balance AS
  SELECT student_id,
         COALESCE(SUM(amount), 0)::INTEGER AS balance
  FROM coin_transactions
  GROUP BY student_id;

-- Perk inventory — one row per (student, perk_type), upserted on purchase.
CREATE TABLE IF NOT EXISTS student_perks (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  perk_type    TEXT        NOT NULL,
  quantity     INTEGER     NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, perk_type)
);

-- Skip log — teacher visibility for question_skips.
CREATE TABLE IF NOT EXISTS question_skips (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_id TEXT,
  topic      TEXT,
  subject    TEXT,
  skipped_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS skip_student_time ON question_skips(student_id, skipped_at DESC);

-- RLS (service-role key used by backend bypasses these; these guard direct frontend reads)
ALTER TABLE coin_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "student_own_coins"  ON coin_transactions  USING (student_id = auth.uid());

ALTER TABLE student_perks      ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "student_own_perks"  ON student_perks       USING (student_id = auth.uid());

ALTER TABLE question_skips     ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "student_own_skips"  ON question_skips      USING (student_id = auth.uid());
