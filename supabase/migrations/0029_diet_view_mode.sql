-- =========================================================================
-- 0029_diet_view_mode.sql
-- Per-patient diet screen mode:
--   'tracking' (default) — full food logging + progress.
--   'targets'            — calm "targets only" view: daily goal, protein,
--                          fiber, macros; logging tucked away.
-- Patient-controlled (not a protected column, so patient self-update works).
-- Idempotent.
-- =========================================================================

alter table public.patient_profiles
  add column if not exists diet_view_mode text not null default 'tracking';

alter table public.patient_profiles drop constraint if exists patient_profiles_diet_view_mode_chk;
alter table public.patient_profiles
  add constraint patient_profiles_diet_view_mode_chk
  check (diet_view_mode in ('tracking', 'targets'));
