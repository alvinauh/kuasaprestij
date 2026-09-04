-- Add preferences column to profiles for cross-device student pref sync
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferences jsonb DEFAULT '{}'::jsonb;

-- Allow students to update their own preferences
CREATE POLICY IF NOT EXISTS "Users can update own preferences"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
