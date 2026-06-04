-- Migration 0018: Replace Supabase auth.uid() with app-set session variables.
--
-- Before this migration the two helper functions called Supabase's
-- auth.uid() which only works when Supabase Auth injects the JWT into the
-- Postgres session. On plain RDS (or any non-Supabase Postgres) we set the
-- session variables ourselves in every DB connection wrapper before running
-- queries.
--
-- The app sets these two settings at the start of every transaction:
--   SET LOCAL app.current_user_id   = '<cognito-sub-uuid>';
--   SET LOCAL app.current_user_role = 'clinician' | 'patient';
--   SET LOCAL app.current_clinic_id = '<clinic-uuid>';
--
-- All existing RLS policies that call current_user_role() or
-- current_user_clinic() continue to work unchanged — only the helper
-- function bodies change.

-- ── Helper functions ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_user_role', true), '');
$$;

CREATE OR REPLACE FUNCTION public.current_user_clinic()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_clinic_id', true), '')::uuid;
$$;

-- ── Re-create any policies that directly called auth.uid() ───────────────────
-- (Policies that already went through current_user_id() / current_user_role()
--  / current_user_clinic() don't need changes — the helpers do the translation.)

-- profiles: patients read their own row; clinicians read everyone in their clinic.
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (
    id = public.current_user_id()
    OR (public.current_user_role() = 'clinician' AND clinic_id = public.current_user_clinic())
  );

DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
CREATE POLICY "profiles_update_self" ON public.profiles
  FOR UPDATE USING (id = public.current_user_id());

-- patient_profiles
DROP POLICY IF EXISTS "patient_profiles_select" ON public.patient_profiles;
CREATE POLICY "patient_profiles_select" ON public.patient_profiles
  FOR SELECT USING (
    id = public.current_user_id()
    OR (public.current_user_role() = 'clinician' AND clinic_id = public.current_user_clinic())
  );

DROP POLICY IF EXISTS "patient_profiles_update_self" ON public.patient_profiles;
CREATE POLICY "patient_profiles_update_self" ON public.patient_profiles
  FOR UPDATE USING (id = public.current_user_id());

-- medication_dose_logs: patient writes own; clinician writes for their clinic.
DROP POLICY IF EXISTS "dose_logs_insert" ON public.medication_dose_logs;
CREATE POLICY "dose_logs_insert" ON public.medication_dose_logs
  FOR INSERT WITH CHECK (
    (public.current_user_role() = 'patient' AND patient_id = public.current_user_id())
    OR (public.current_user_role() = 'clinician' AND clinic_id = public.current_user_clinic())
  );

DROP POLICY IF EXISTS "dose_logs_delete" ON public.medication_dose_logs;
CREATE POLICY "dose_logs_delete" ON public.medication_dose_logs
  FOR DELETE USING (
    (public.current_user_role() = 'patient' AND patient_id = public.current_user_id())
    OR (public.current_user_role() = 'clinician' AND clinic_id = public.current_user_clinic())
  );

-- messages: sender can insert their own messages.
DROP POLICY IF EXISTS "messages_insert" ON public.messages;
CREATE POLICY "messages_insert" ON public.messages
  FOR INSERT WITH CHECK (sender_id = public.current_user_id());

DROP POLICY IF EXISTS "messages_update_read" ON public.messages;
CREATE POLICY "messages_update_read" ON public.messages
  FOR UPDATE USING (recipient_id = public.current_user_id());

-- food_log_entries
DROP POLICY IF EXISTS "food_log_entries_insert" ON public.food_log_entries;
CREATE POLICY "food_log_entries_insert" ON public.food_log_entries
  FOR INSERT WITH CHECK (
    patient_id = public.current_user_id()
    OR (public.current_user_role() = 'clinician' AND clinic_id = public.current_user_clinic())
  );

-- food_favorites
DROP POLICY IF EXISTS "food_favorites_all" ON public.food_favorites;
CREATE POLICY "food_favorites_all" ON public.food_favorites
  FOR ALL USING (patient_id = public.current_user_id());
