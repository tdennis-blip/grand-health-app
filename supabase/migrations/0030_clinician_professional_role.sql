-- =========================================================================
-- 0030_clinician_professional_role.sql
-- Add a descriptive professional role (e.g. "Physician", "Nurse
-- Practitioner", "Dietitian") to clinician_profiles, editable by the
-- provider on their own profile. Display only. Idempotent.
-- =========================================================================

alter table public.clinician_profiles
  add column if not exists professional_role text;
