-- =========================================================================
-- 0041_hr_zones_patient_unique.sql
--
-- The original UNIQUE (clinic_id, zone_key) on hr_zones predates patient-
-- specific zones (migration 0040). It blocks a patient from having their own
-- z1..z5 because the clinic's GENERIC zones already occupy those keys in the
-- same clinic — every seed/generate/add of a patient zone hit a 23505 dup-key.
--
-- Replace it with owner-scoped partial unique indexes:
--   · generic zones: unique per (clinic, zone_key)         [patient_id IS NULL]
--   · patient zones: unique per (patient, zone_key)        [patient_id NOT NULL]
--
-- Idempotent.
-- =========================================================================

alter table public.hr_zones drop constraint if exists hr_zones_clinic_id_zone_key_key;

create unique index if not exists hr_zones_generic_key_uniq
  on public.hr_zones (clinic_id, zone_key)
  where patient_id is null;

create unique index if not exists hr_zones_patient_key_uniq
  on public.hr_zones (patient_id, zone_key)
  where patient_id is not null;
