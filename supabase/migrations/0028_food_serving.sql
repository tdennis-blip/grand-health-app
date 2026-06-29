-- =========================================================================
-- 0028_food_serving.sql
-- Capture a food's natural serving so the logger can offer common units
-- (e.g. "1 container (170 g)") instead of only raw grams. Nutrients stay
-- per-100g; serving_size_g is just the grams-per-serving for unit conversion.
-- Idempotent.
-- =========================================================================

alter table public.foods
  add column if not exists serving_size_g numeric(8,2);   -- grams in one serving

alter table public.foods
  add column if not exists serving_label text;            -- e.g. "1 container (170 g)"
