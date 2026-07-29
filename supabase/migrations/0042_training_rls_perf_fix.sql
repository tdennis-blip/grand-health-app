-- =========================================================================
-- 0042_training_rls_perf_fix.sql
--
-- Migration 0040 added care-team RLS policies on the training CHILD tables
-- (session_exercises, session_sets, program_days) whose predicates do
-- `EXISTS (SELECT ... FROM session_library ...)`. Because session_library
-- ITSELF has RLS, every child row re-evaluates a nested policy chain
-- (child → session_library → its policies → clinician_can_access_patient …).
-- On the session editor (which reads these child tables) this nested
-- evaluation explodes into a multi-minute query that hangs the request —
-- the page times out with no error logged.
--
-- Fix: drop the 0040-added child-table policies. Access is still gated:
--   · Clinicians: the original 0004 clinic-scoped policies (simple, fast).
--   · Patients: the original 0005 assigned-program read policies.
--   · The PARENT tables (session_library / program_library / hr_zones) keep
--     their 0040 care-team restriction, which is the real visibility gate
--     (you can't discover a patient-specific session without reading the
--     parent, which is still scoped).
--
-- Trade-off: a patient can no longer read the exercises/sets of an ad-hoc
-- GENERIC session that isn't in their assigned program (the "pick extras"
-- picker). Revisit later via a SECURITY DEFINER helper that avoids nested RLS.
--
-- Idempotent.
-- =========================================================================

drop policy if exists "ct_restrict_patient_owned" on public.session_exercises;
drop policy if exists "ct_restrict_patient_owned" on public.session_sets;
drop policy if exists "ct_restrict_patient_owned" on public.program_days;

drop policy if exists "patient reads session_exercises own or generic" on public.session_exercises;
drop policy if exists "patient reads session_sets own or generic" on public.session_sets;
drop policy if exists "patient reads program_days own or generic" on public.program_days;
