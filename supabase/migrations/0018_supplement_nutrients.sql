-- =========================================================================
-- 0018_supplement_nutrients.sql
--
-- Add per-dose nutrient columns to medications so supplement contributions
-- can be included in the patient diet micronutrient summary.
--
-- Values represent the amount delivered per single dose (not per 100g).
-- They are nullable — left null for medications where nutrient data is
-- irrelevant, and for supplements where the clinician hasn't entered them yet.
-- =========================================================================

alter table public.medications
  add column if not exists vitamin_d_iu   numeric,
  add column if not exists vitamin_b12_ug numeric,
  add column if not exists iron_mg        numeric,
  add column if not exists magnesium_mg   numeric,
  add column if not exists calcium_mg     numeric,
  add column if not exists potassium_mg   numeric,
  add column if not exists sodium_mg      numeric,
  add column if not exists omega3_mg      numeric;
