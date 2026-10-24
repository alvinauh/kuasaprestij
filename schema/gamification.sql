-- Gamification columns for quiz_sessions
-- Adds wrong_count, streak, and score tracking per session

ALTER TABLE quiz_sessions
  ADD COLUMN IF NOT EXISTS wrong_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streak      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS score       INTEGER NOT NULL DEFAULT 0,
  -- 1-based question number at which the last penalty game was triggered.
  -- Used to enforce a one-question cooldown between penalty games (see /submit_answer).
  ADD COLUMN IF NOT EXISTS last_penalty_count INTEGER NOT NULL DEFAULT -100;
