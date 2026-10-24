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

-- Player limit per game PIN (2026-10-06). NULL = no limit. Every student who joins
-- with the PIN (guest Quick Join or signed-in enroll) takes one seat; rejoining is free.
ALTER TABLE arena_pins ADD COLUMN IF NOT EXISTS max_players INT CHECK (max_players BETWEEN 1 AND 500);
CREATE TABLE IF NOT EXISTS arena_pin_players (
  pin        TEXT NOT NULL REFERENCES arena_pins(pin) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (pin, student_id)
);
ALTER TABLE arena_pin_players ENABLE ROW LEVEL SECURITY;  -- no policies: service role only

-- Locks the PIN row so a whole class joining at once can't overshoot the limit.
CREATE OR REPLACE FUNCTION claim_arena_seat(p_pin TEXT, p_student UUID) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  lim INT;
BEGIN
  SELECT max_players INTO lim FROM arena_pins WHERE pin = p_pin AND expires_at > NOW() FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF EXISTS (SELECT 1 FROM arena_pin_players WHERE pin = p_pin AND student_id = p_student) THEN RETURN TRUE; END IF;
  IF lim IS NOT NULL AND (SELECT COUNT(*) FROM arena_pin_players WHERE pin = p_pin) >= lim THEN RETURN FALSE; END IF;
  INSERT INTO arena_pin_players (pin, student_id) VALUES (p_pin, p_student);
  RETURN TRUE;
END $$;
REVOKE EXECUTE ON FUNCTION claim_arena_seat(TEXT, UUID) FROM PUBLIC, anon, authenticated;
NOTIFY pgrst, 'reload schema';
