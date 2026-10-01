-- google_classroom.sql
-- Apply in Supabase SQL Editor after student_management.sql

-- ─────────────────────────────────────────────
-- 1. Store Google OAuth tokens per teacher
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.google_tokens (
  user_id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token  TEXT NOT NULL,
  refresh_token TEXT,
  token_expiry  TIMESTAMPTZ,
  scopes        TEXT[],
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.google_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "google_tokens_own" ON public.google_tokens;
CREATE POLICY "google_tokens_own" ON public.google_tokens
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "google_tokens_admin" ON public.google_tokens;
CREATE POLICY "google_tokens_admin" ON public.google_tokens
  USING (public.has_role(auth.uid(), 'admin'));

-- ─────────────────────────────────────────────
-- 2. Link a KuasaPrestij classroom to a Google Classroom course
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.classroom_google_links (
  classroom_id         UUID PRIMARY KEY REFERENCES public.classrooms(id) ON DELETE CASCADE,
  google_course_id     TEXT NOT NULL,
  google_course_name   TEXT,
  google_coursework_id TEXT,
  linked_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_synced_at       TIMESTAMPTZ
);
ALTER TABLE public.classroom_google_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gcl_teacher" ON public.classroom_google_links;
CREATE POLICY "gcl_teacher" ON public.classroom_google_links
  USING (
    EXISTS (
      SELECT 1 FROM public.classrooms c
      WHERE c.id = classroom_id AND c.teacher_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "gcl_admin" ON public.classroom_google_links;
CREATE POLICY "gcl_admin" ON public.classroom_google_links
  USING (public.has_role(auth.uid(), 'admin'));
