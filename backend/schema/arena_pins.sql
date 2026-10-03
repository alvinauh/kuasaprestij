-- Live Arena game PINs (2026-10-03): short 6-digit codes a projector can show,
-- issued when the teacher opens Live Arena and expiring after a few hours, so
-- the permanent class invite code no longer has to be the way into a game.
CREATE TABLE IF NOT EXISTS arena_pins (
  pin          TEXT PRIMARY KEY CHECK (pin ~ '^[0-9]{6}$'),
  classroom_id UUID NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_arena_pins_classroom ON arena_pins(classroom_id);
ALTER TABLE arena_pins ENABLE ROW LEVEL SECURITY;  -- no policies: service role only
