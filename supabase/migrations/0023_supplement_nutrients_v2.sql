-- 0023_supplement_nutrients_v2.sql
-- Add DHA, EPA, creatine, CoQ10, and fiber to medications.
-- omega3_mg is retained (not dropped) to preserve any existing data.

alter table public.medications
  add column if not exists dha_mg       numeric,
  add column if not exists epa_mg       numeric,
  add column if not exists creatine_mg  numeric,
  add column if not exists coq10_mg     numeric,
  add column if not exists fiber_g      numeric;
