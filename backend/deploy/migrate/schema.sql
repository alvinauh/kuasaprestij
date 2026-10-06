-- Cloud SQL schema for kuasaprestij-dr
-- Mirrors Supabase public schema. auth schema is a stub (real auth stays on Supabase).

-- ── Extensions ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Stub auth schema (profiles FK references auth.users) ──────────────────────
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- PostgREST reads sub from JWT claims; returns NULL if not set
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE
AS $$
  SELECT nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid;
$$;

-- ── PostgREST role (JWT claims role: g1_p1_user) ──────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'g1_p1_user') THEN
    CREATE ROLE g1_p1_user NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO g1_p1_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO g1_p1_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO g1_p1_user;
-- postgres (PostgREST connection user in Cloud SQL) must have membership to SET LOCAL ROLE
GRANT g1_p1_user TO postgres;

-- ── Tables (dependency order) ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  full_name text,
  role text DEFAULT 'student' CHECK (role = ANY (ARRAY['student','teacher','admin'])),
  school text,
  grade text,
  created_at timestamptz DEFAULT now(),
  preferences jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  grade_level text NOT NULL,
  active_subjects text[] DEFAULT '{}',
  external_id text UNIQUE,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.syllabus_embeddings (
  id bigserial PRIMARY KEY,
  content text,
  metadata jsonb,
  embedding vector(768),
  source_type text DEFAULT 'textbook'
);

CREATE TABLE IF NOT EXISTS public.generated_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  subject text NOT NULL,
  form_level integer NOT NULL,
  language text DEFAULT 'English',
  title text,
  dskp_code text,
  notes_content text,
  notes_json jsonb,
  created_at timestamptz DEFAULT now(),
  UNIQUE (topic, subject, form_level, language)
);

CREATE TABLE IF NOT EXISTS public.classrooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject text,
  invite_code text NOT NULL DEFAULT substring(gen_random_uuid()::text, 1, 8),
  teacher_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  theme text,
  wallpaper text,
  UNIQUE (invite_code)
);

CREATE TABLE IF NOT EXISTS public.quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid REFERENCES public.generated_lessons(id),
  topic text,
  questions_jsonb jsonb NOT NULL,
  difficulty_level text DEFAULT 'medium',
  question_type text DEFAULT 'mcq',
  num_questions integer,
  language text DEFAULT 'English',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.quiz_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  topic text NOT NULL,
  subject text NOT NULL,
  language text DEFAULT 'English',
  question_type text DEFAULT 'mcq',
  is_adaptive boolean DEFAULT false,
  lesson_id uuid REFERENCES public.generated_lessons(id),
  current_draft jsonb,
  answered_count integer DEFAULT 0,
  mastery_score numeric DEFAULT 0.0,
  status text DEFAULT 'active' CHECK (status = ANY (ARRAY['active','complete'])),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  prefetched_draft jsonb,
  wrong_count integer DEFAULT 0,
  streak integer DEFAULT 0,
  score integer DEFAULT 0,
  last_penalty_count integer DEFAULT -100
);

CREATE TABLE IF NOT EXISTS public.topic_anchors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text,
  topic text,
  mnemonic_lyrics text,
  audio_url text,
  anchor_question jsonb,
  created_at timestamptz DEFAULT now(),
  video_broll text,
  language text DEFAULT 'English',
  h5p_content jsonb,
  question_bank jsonb DEFAULT '[]'::jsonb,
  form_level integer DEFAULT 4,
  diagram_svg text,
  worked_example text,
  interactive_content jsonb,
  UNIQUE (topic, language, form_level)
);

CREATE TABLE IF NOT EXISTS public.dskp_mastery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id),
  curriculum_tag text NOT NULL,
  topic text NOT NULL,
  mastery_level float8 DEFAULT 0.0,
  last_assessed_at timestamptz,
  next_review_at timestamptz,
  UNIQUE (student_id, curriculum_tag, topic)
);

CREATE TABLE IF NOT EXISTS public.event_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id),
  topic text NOT NULL,
  kbat_level text NOT NULL,
  is_correct boolean NOT NULL,
  time_spent_seconds integer,
  diagnostic_tag text,
  created_at timestamptz DEFAULT timezone('utc', now()),
  error_category text,
  root_cause text,
  intervention text,
  subject text DEFAULT ''
);

CREATE TABLE IF NOT EXISTS public.media_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curriculum_tag text NOT NULL,
  topic text NOT NULL,
  media_type text NOT NULL,
  asset_url text NOT NULL,
  created_at timestamptz DEFAULT timezone('utc', now()),
  UNIQUE (curriculum_tag, topic, media_type)
);

CREATE TABLE IF NOT EXISTS public.student_daily_report (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  created_at timestamptz DEFAULT timezone('utc', now()),
  student_id uuid,
  student_name text,
  subject text NOT NULL,
  progress integer DEFAULT 0,
  class_average integer DEFAULT 0,
  topics_mastered text[] DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS public.chat_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  lesson_id uuid REFERENCES public.generated_lessons(id),
  role text NOT NULL CHECK (role = ANY (ARRAY['student','tutor'])),
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  session_id uuid REFERENCES public.quiz_sessions(id)
);

CREATE TABLE IF NOT EXISTS public.remediation_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  subject text NOT NULL,
  topic text NOT NULL,
  priority_score numeric DEFAULT 0.5,
  reason text,
  error_categories text[],
  root_causes text[],
  suggested_intervention text,
  status text DEFAULT 'active' CHECK (status = ANY (ARRAY['active','done'])),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (student_id, topic)
);

CREATE TABLE IF NOT EXISTS public.game_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  quiz_session_id uuid REFERENCES public.quiz_sessions(id),
  game_type text NOT NULL CHECK (game_type = ANY (ARRAY['catch_stars','dino_runner','flappy_bird'])),
  result text NOT NULL CHECK (result = ANY (ARRAY['win','loss'])),
  duration_ms integer,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid,
  quiz_id uuid REFERENCES public.quizzes(id),
  lesson_id uuid REFERENCES public.generated_lessons(id),
  test_score numeric,
  suggested_improvements text,
  raw_payload jsonb,
  status text DEFAULT 'pending' CHECK (status = ANY (ARRAY['pending','in_progress','processed','dismissed','no_action'])),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.classroom_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id uuid NOT NULL REFERENCES public.classrooms(id),
  student_id uuid NOT NULL REFERENCES auth.users(id),
  joined_at timestamptz DEFAULT now(),
  UNIQUE (classroom_id, student_id)
);

CREATE TABLE IF NOT EXISTS public.assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id uuid NOT NULL REFERENCES public.classrooms(id),
  teacher_id uuid NOT NULL REFERENCES auth.users(id),
  title text NOT NULL,
  instructions text,
  subject text,
  topic text,
  form_level integer,
  question_type text DEFAULT 'mcq',
  due_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.assigned_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  subject text,
  topic text,
  task_type text DEFAULT 'quiz',
  instructions text,
  teacher_note text,
  error_context text[],
  priority_score numeric,
  status text DEFAULT 'pending',
  assigned_at timestamptz DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  due_at timestamptz,
  session_id uuid,
  lesson_id uuid REFERENCES public.generated_lessons(id),
  quiz_id uuid
);

CREATE TABLE IF NOT EXISTS public.agent_traces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id uuid NOT NULL,
  node text NOT NULL,
  label text DEFAULT '',
  duration_ms float8,
  status text DEFAULT 'ok',
  provider text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.feedback_quality_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  result jsonb NOT NULL,
  scripts_analyzed integer,
  total_acts integer,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.app_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  level text DEFAULT 'error',
  message text NOT NULL,
  source text,
  url text,
  stack text,
  context jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.teacher_chat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid DEFAULT '00000000-0000-0000-0000-000000000001',
  thread_id uuid DEFAULT '00000000-0000-0000-0000-000000000001',
  role text NOT NULL CHECK (role = ANY (ARRAY['teacher','assistant'])),
  content text DEFAULT '',
  artifacts jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rph_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES auth.users(id),
  title text NOT NULL,
  mata_pelajaran text NOT NULL,
  tingkatan text NOT NULL,
  tarikh date,
  masa text,
  bilangan_murid integer,
  tema text,
  tajuk text NOT NULL,
  standard_kandungan text[],
  standard_pembelajaran text[],
  objektif text[],
  nilai_murni text[],
  elemen_merentas_kurikulum text[],
  bahan_bantu_mengajar text[],
  fasa_induksi_set jsonb,
  fasa_penyampaian jsonb,
  fasa_amali jsonb,
  fasa_penghasilan jsonb,
  fasa_penutup jsonb,
  impak text,
  catatan text,
  source_files text[],
  share_token uuid DEFAULT gen_random_uuid(),
  status text DEFAULT 'draft' CHECK (status = ANY (ARRAY['draft','complete'])),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.aita_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES auth.users(id),
  rph_id uuid REFERENCES public.rph_documents(id),
  title text NOT NULL,
  game_type text NOT NULL CHECK (game_type = ANY (ARRAY['flappy','dino','catch','connector','sentence','kahoot','wordsearch'])),
  config jsonb DEFAULT '{}'::jsonb,
  share_token uuid DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.aita_game_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.aita_games(id),
  classroom_id uuid,
  teacher_id uuid NOT NULL REFERENCES auth.users(id),
  due_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.aita_game_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.aita_games(id),
  student_id uuid,
  player_name text,
  score integer DEFAULT 0,
  completed_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rph_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rph_id uuid NOT NULL REFERENCES public.rph_documents(id),
  shared_by uuid NOT NULL REFERENCES auth.users(id),
  share_token uuid DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now()
);

-- ── Indexes ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_agent_traces_created_at ON public.agent_traces USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_traces_node ON public.agent_traces USING btree (node, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_traces_trace_id ON public.agent_traces USING btree (trace_id);
CREATE INDEX IF NOT EXISTS idx_app_errors_created ON public.app_errors USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assigned_tasks_status ON public.assigned_tasks USING btree (status);
CREATE INDEX IF NOT EXISTS idx_assigned_tasks_student ON public.assigned_tasks USING btree (student_id);
CREATE INDEX IF NOT EXISTS idx_assignments_classroom ON public.assignments USING btree (classroom_id);
CREATE INDEX IF NOT EXISTS idx_assignments_teacher ON public.assignments USING btree (teacher_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_student_lesson ON public.chat_history USING btree (student_id, lesson_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_history_student_session ON public.chat_history USING btree (student_id, session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_quality_audit_created ON public.feedback_quality_audit USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_scores_result ON public.game_scores USING btree (result, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_scores_student ON public.game_scores USING btree (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lessons_topic_subject ON public.generated_lessons USING btree (topic, subject, form_level);
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_student ON public.quiz_sessions USING btree (student_id, status);
CREATE INDEX IF NOT EXISTS idx_quizzes_lesson_id ON public.quizzes USING btree (lesson_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_question_type ON public.quizzes USING btree (question_type);
CREATE INDEX IF NOT EXISTS idx_remediation_student_status ON public.remediation_plans USING btree (student_id, status, priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_teacher_chat_thread ON public.teacher_chat USING btree (teacher_id, thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_topic_anchors_question_bank ON public.topic_anchors USING gin (question_bank);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON public.user_feedback USING btree (status);

-- pgvector HNSW index for semantic search (built after data load for speed)
CREATE INDEX IF NOT EXISTS syllabus_embeddings_embedding_idx
  ON public.syllabus_embeddings USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ── Functions ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.match_syllabus_embeddings(
  query_embedding vector,
  match_threshold double precision,
  match_count integer
)
RETURNS TABLE(id bigint, content text, metadata jsonb, similarity double precision)
LANGUAGE sql STABLE
AS $$
  SELECT
    syllabus_embeddings.id,
    syllabus_embeddings.content,
    syllabus_embeddings.metadata,
    1 - (syllabus_embeddings.embedding <=> query_embedding) AS similarity
  FROM syllabus_embeddings
  WHERE 1 - (syllabus_embeddings.embedding <=> query_embedding) > match_threshold
  ORDER BY syllabus_embeddings.embedding <=> query_embedding
  LIMIT match_count;
$$;

CREATE OR REPLACE FUNCTION public.match_syllabus(
  query_embedding vector,
  match_threshold double precision,
  match_count integer
)
RETURNS TABLE(id bigint, content text, metadata jsonb, similarity double precision)
LANGUAGE sql STABLE
AS $$
  SELECT
    syllabus_embeddings.id,
    syllabus_embeddings.content,
    syllabus_embeddings.metadata,
    1 - (syllabus_embeddings.embedding <=> query_embedding) AS similarity
  FROM syllabus_embeddings
  WHERE 1 - (syllabus_embeddings.embedding <=> query_embedding) > match_threshold
  ORDER BY syllabus_embeddings.embedding <=> query_embedding
  LIMIT match_count;
$$;

CREATE OR REPLACE FUNCTION public.increment_mastery(
  p_student_id uuid,
  p_topic text,
  p_subject text,
  p_delta double precision,
  p_last_assessed_at timestamptz,
  p_next_review_at timestamptz
)
RETURNS double precision
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  new_val FLOAT;
BEGIN
  INSERT INTO dskp_mastery (student_id, curriculum_tag, topic, mastery_level, last_assessed_at, next_review_at)
  VALUES (
    p_student_id, p_subject, p_topic,
    GREATEST(0.0, LEAST(1.0, p_delta)),
    p_last_assessed_at, p_next_review_at
  )
  ON CONFLICT (student_id, curriculum_tag, topic)
  DO UPDATE SET
    mastery_level    = GREATEST(0.0, LEAST(1.0, dskp_mastery.mastery_level + p_delta)),
    last_assessed_at = EXCLUDED.last_assessed_at,
    next_review_at   = EXCLUDED.next_review_at
  RETURNING mastery_level INTO new_val;
  RETURN new_val;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_teacher_or_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','teacher')
  );
$$;

-- ── Triggers ───────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS set_quiz_sessions_updated_at ON public.quiz_sessions;
CREATE TRIGGER set_quiz_sessions_updated_at
  BEFORE UPDATE ON public.quiz_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_remediation_updated_at ON public.remediation_plans;
CREATE TRIGGER set_remediation_updated_at
  BEFORE UPDATE ON public.remediation_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS update_rph_updated_at ON public.rph_documents;
CREATE TRIGGER update_rph_updated_at
  BEFORE UPDATE ON public.rph_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- platform_integrations + integration_staging (added 2026-09-18)
CREATE TABLE IF NOT EXISTS public.platform_integrations (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT        NOT NULL,
  connection_type   TEXT        NOT NULL DEFAULT 'rest',
  base_url          TEXT        NOT NULL DEFAULT '',
  api_key           TEXT        NOT NULL DEFAULT '',
  auth_header       TEXT        NOT NULL DEFAULT 'Authorization',
  auth_scheme       TEXT        NOT NULL DEFAULT 'Bearer',
  field_map         JSONB       NOT NULL DEFAULT '{}',
  db_host           TEXT,
  db_port           INTEGER,
  db_name           TEXT,
  db_user           TEXT,
  db_password       TEXT,
  db_query          TEXT,
  enabled           BOOLEAN     NOT NULL DEFAULT true,
  last_synced_at    TIMESTAMPTZ,
  last_sync_status  TEXT,
  last_sync_message TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.integration_staging (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID        NOT NULL REFERENCES public.platform_integrations(id) ON DELETE CASCADE,
  row_data       JSONB       NOT NULL,
  pulled_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integration_staging_integration_id
  ON public.integration_staging(integration_id);

CREATE TABLE IF NOT EXISTS public.api_keys (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  key_hash     TEXT        UNIQUE NOT NULL,
  key_prefix   TEXT        NOT NULL,
  scopes       JSONB       NOT NULL DEFAULT '["questions:read","games:embed"]'::jsonb,
  enabled      BOOLEAN     NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID        REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- ── 2026-10-05: teacher-edited copies + quiz scores (mirrors schema/teacher_edited_copies.sql
--    and schema/assigned_tasks_quiz_score.sql on Supabase). Idempotent: runs every sync.
ALTER TABLE public.generated_lessons
  ADD COLUMN IF NOT EXISTS owner_id UUID,
  ADD COLUMN IF NOT EXISTS source_lesson_id UUID,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS owner_id UUID,
  ADD COLUMN IF NOT EXISTS source_quiz_id UUID,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE public.assigned_tasks
  ADD COLUMN IF NOT EXISTS score INTEGER,
  ADD COLUMN IF NOT EXISTS max_score INTEGER,
  ADD COLUMN IF NOT EXISTS submitted_answers JSONB;
ALTER TABLE public.generated_lessons
  DROP CONSTRAINT IF EXISTS generated_lessons_topic_subject_form_level_language_key;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'generated_lessons_topic_subject_form_level_language_owner_key') THEN
    ALTER TABLE public.generated_lessons
      ADD CONSTRAINT generated_lessons_topic_subject_form_level_language_owner_key
      UNIQUE NULLS NOT DISTINCT (topic, subject, form_level, language, owner_id);
  END IF;
END $$;
-- PostgREST caches the schema; reload it so the new columns are queryable right away.
NOTIFY pgrst, 'reload schema';

-- ── 2026-10-05: columns added to Supabase earlier that never reached Cloud SQL
--    (found by migrate.py's skipped-column warnings; these tables were failing each night).
ALTER TABLE public.event_logs
  ADD COLUMN IF NOT EXISTS question_text TEXT,
  ADD COLUMN IF NOT EXISTS options_json JSONB,
  ADD COLUMN IF NOT EXISTS correct_answer TEXT,
  ADD COLUMN IF NOT EXISTS student_answer TEXT,
  ADD COLUMN IF NOT EXISTS feedback_text TEXT,
  ADD COLUMN IF NOT EXISTS question_type TEXT DEFAULT 'mcq',
  ADD COLUMN IF NOT EXISTS session_id UUID;
ALTER TABLE public.quiz_sessions
  ADD COLUMN IF NOT EXISTS seen_questions JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.feedback_quality_audit
  ADD COLUMN IF NOT EXISTS corpus_type TEXT DEFAULT 'teacher_scripts';
NOTIFY pgrst, 'reload schema';

-- ── 2026-10-06: Live Arena + AI Controller personalization (mirrors schema/classroom_live.sql,
--    classroom_arena.sql, arena_pins.sql, teacher_personalization.sql; columns copied from the
--    live Supabase tables). Without these the round sweeper logged 42P01 on Cloud Run.
--    No RLS/realtime here: Cloud Run's backend is the only client of Cloud SQL.
CREATE TABLE IF NOT EXISTS public.classroom_live_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL,
  question text NOT NULL,
  options jsonb,
  correct_answer text,
  question_type text NOT NULL DEFAULT 'mcq',
  subject text,
  topic text,
  object_lesson text,
  status text NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  kind text NOT NULL DEFAULT 'question',
  game text,
  duration_s integer,
  arena_id uuid
);
CREATE INDEX IF NOT EXISTS idx_cls_live_sessions_classroom_status ON public.classroom_live_sessions (classroom_id, status);
CREATE INDEX IF NOT EXISTS idx_cls_live_sessions_arena ON public.classroom_live_sessions (arena_id);

CREATE TABLE IF NOT EXISTS public.classroom_live_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  live_session_id uuid NOT NULL REFERENCES public.classroom_live_sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  student_name text,
  answer text NOT NULL,
  is_correct boolean NOT NULL DEFAULT false,
  answered_at timestamptz NOT NULL DEFAULT now(),
  points integer NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cls_live_answers_unique ON public.classroom_live_answers (live_session_id, student_id);
CREATE INDEX IF NOT EXISTS idx_cls_live_answers_session ON public.classroom_live_answers (live_session_id, answered_at);

CREATE TABLE IF NOT EXISTS public.classroom_live_keys (
  live_session_id uuid PRIMARY KEY REFERENCES public.classroom_live_sessions(id) ON DELETE CASCADE,
  correct_answer text
);

CREATE TABLE IF NOT EXISTS public.classroom_game_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  live_session_id uuid NOT NULL REFERENCES public.classroom_live_sessions(id) ON DELETE CASCADE,
  arena_id uuid,
  student_id uuid NOT NULL,
  student_name text,
  score integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (live_session_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_cls_game_scores_arena ON public.classroom_game_scores (arena_id);

CREATE TABLE IF NOT EXISTS public.arena_pins (
  pin text PRIMARY KEY CHECK (pin ~ '^[0-9]{6}$'),
  classroom_id uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  max_players integer CHECK (max_players >= 1 AND max_players <= 500)
);
CREATE INDEX IF NOT EXISTS idx_arena_pins_classroom ON public.arena_pins (classroom_id);

CREATE TABLE IF NOT EXISTS public.arena_pin_players (
  pin text NOT NULL REFERENCES public.arena_pins(pin) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pin, student_id)
);

CREATE OR REPLACE FUNCTION public.claim_arena_seat(p_pin text, p_student uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
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

CREATE TABLE IF NOT EXISTS public.teacher_profile (
  teacher_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  subjects text[] NOT NULL DEFAULT '{}',
  form_levels integer[] NOT NULL DEFAULT '{}',
  preferred_language text,
  teaching_style text,
  facts jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_learned_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.teacher_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  filename text NOT NULL,
  subject text,
  topic_hint text,
  chunk_count integer NOT NULL DEFAULT 0,
  char_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_teacher_materials_teacher ON public.teacher_materials (teacher_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.teacher_material_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES public.teacher_materials(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  embedding vector(768) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_teacher_material_chunks_teacher ON public.teacher_material_chunks (teacher_id);

CREATE OR REPLACE FUNCTION public.match_teacher_materials(p_teacher_id uuid, query_embedding vector, match_count integer DEFAULT 3)
 RETURNS TABLE(material_id uuid, filename text, content text, similarity double precision)
 LANGUAGE sql STABLE
AS $$
  select c.material_id, m.filename, c.content,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.teacher_material_chunks c
  join public.teacher_materials m on m.id = c.material_id
  where c.teacher_id = p_teacher_id
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
-- Tables created after the ALTER DEFAULT PRIVILEGES above inherit them; re-grant in case
-- this file runs as a different role than the one that set the defaults.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO g1_p1_user;
NOTIFY pgrst, 'reload schema';
