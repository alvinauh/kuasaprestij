-- Repoint student-id foreign keys from the legacy `students` table to `profiles(id)`.
--
-- WHY: dskp_mastery.student_id and event_logs.student_id had FKs to a near-empty
-- legacy `students` table (a Lovable-migration leftover), while real users live in
-- `profiles` (which references auth.users). This caused "answer checking unavailable"
-- 500s because logged-in users had no `students` row. Repointing to `profiles(id)`
-- gives one source of truth and lets us drop the backend band-aid that upserts into
-- `students` before every mastery write.
--
-- SAFE TO RUN: introspection on 2026-07-10 showed the ONLY student_id not present in
-- profiles is the failsafe/test UUID 00000000-0000-0000-0000-000000000001 (used by the
-- app's "undefined student" failsafe, CLAUDE.md rule 6). Step 1 seeds a valid profile
-- for it so the failsafe keeps working; no real-user rows are affected and nothing is
-- deleted. All real users (profiles=auth.users) already satisfy the new constraint.
--
-- Run in the Supabase SQL Editor (project opavfcpsxnntjylipbwl). Idempotent.

BEGIN;

-- 1) Ensure the failsafe/test student exists in auth.users + profiles so the new
--    FK to profiles(id) is satisfied for the failsafe UUID.
INSERT INTO auth.users (id, instance_id, aud, role, email, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'test-student@kuasaprestij.local', now(), now()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, full_name, role, grade)
VALUES ('00000000-0000-0000-0000-000000000001', 'Test Student', 'student', 'form 4')
ON CONFLICT (id) DO NOTHING;

-- 2) dskp_mastery.student_id  ->  profiles(id)
ALTER TABLE public.dskp_mastery DROP CONSTRAINT IF EXISTS dskp_mastery_student_id_fkey;
ALTER TABLE public.dskp_mastery
  ADD CONSTRAINT dskp_mastery_student_id_fkey
  FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 3) event_logs.student_id  ->  profiles(id)
ALTER TABLE public.event_logs DROP CONSTRAINT IF EXISTS event_logs_student_id_fkey;
ALTER TABLE public.event_logs
  ADD CONSTRAINT event_logs_student_id_fkey
  FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

COMMIT;

-- After this is applied and verified, the `students` table can be dropped and the
-- ensure_student upsert in agents/orchestrator.py:mastery_updater_node removed.
-- Optional cleanup (run separately once confident):
--   DROP TABLE IF EXISTS public.students CASCADE;
