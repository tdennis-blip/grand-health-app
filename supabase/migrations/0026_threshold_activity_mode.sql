-- =========================================================================
-- 0026_threshold_activity_mode.sql
-- Add a third diet activity mode: 'threshold'.
--
--   'static'    -> goal = rmr * activity_multiplier            + deficit
--   'dynamic'   -> goal = rmr * base_multiplier + credited     + deficit
--                  credited = round(active_kcal * credit_pct/100)
--   'threshold' -> goal = rmr * activity_multiplier + excess   + deficit
--                  threshold = rmr * (activity_multiplier - 1)  (activity the
--                              multiplier already assumes)
--                  excess    = max(0, active_kcal - threshold)
--                  i.e. only add calories burned ABOVE what the multiplier
--                  already bakes in; below threshold => no adjustment.
--   active_kcal comes from the wearable for the day, else a MET estimate
--   from the day's scheduled sessions.
--
-- Idempotent.
-- =========================================================================

alter table public.diet_plans drop constraint if exists diet_plans_activity_mode_chk;
alter table public.diet_plans
  add constraint diet_plans_activity_mode_chk
  check (activity_mode in ('static', 'dynamic', 'threshold'));
