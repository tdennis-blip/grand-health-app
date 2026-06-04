-- =========================================================================
-- 0019_dietary_preferences.sql
--
-- Patient-editable dietary preferences used to give the AI diet planner
-- context: allergies, restrictions, cuisine preferences, foods to avoid.
-- =========================================================================

alter table public.patient_profiles
  add column if not exists dietary_preferences text;
