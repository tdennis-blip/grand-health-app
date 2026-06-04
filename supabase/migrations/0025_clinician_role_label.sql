-- 0025_clinician_role_label.sql
-- Adds a display role label to clinician_profiles (e.g. "MD", "NP",
-- "Manager", "Personal Trainer") shown in the UI next to the clinician's name.

alter table public.clinician_profiles
  add column if not exists role_label text default null;
