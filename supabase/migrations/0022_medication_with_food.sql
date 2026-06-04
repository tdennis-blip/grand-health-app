-- 0022_medication_with_food.sql
-- Adds a per-medication "with food" flag so clinicians can mark whether
-- the medication should be taken with food at the medication level.

alter table medications
  add column if not exists with_food boolean default null;
