-- =========================================================================
-- 0020_activity_aware_calories.sql
-- Make the daily calorie target optionally responsive to exercise.
--
-- Two modes per diet plan:
--   'static'  (default, legacy)  -> TDEE = rmr_value * activity_multiplier
--   'dynamic'                    -> TDEE = rmr_value * base_multiplier
--                                          + credited active calories
--     credited = round(active_kcal * activity_credit_pct / 100)
--     active_kcal comes from the wearable for the day, else a MET estimate
--     from the day's scheduled sessions.
--
-- Idempotent.
-- =========================================================================

-- ── diet_plans: activity mode + base multiplier + credit % ────────────────
alter table public.diet_plans
  add column if not exists activity_mode text not null default 'static';

alter table public.diet_plans
  add column if not exists base_multiplier numeric(3,2) not null default 1.20;

alter table public.diet_plans
  add column if not exists activity_credit_pct integer not null default 50;

-- Guardrails (drop-then-add so the migration is re-runnable).
alter table public.diet_plans drop constraint if exists diet_plans_activity_mode_chk;
alter table public.diet_plans
  add constraint diet_plans_activity_mode_chk
  check (activity_mode in ('static', 'dynamic'));

alter table public.diet_plans drop constraint if exists diet_plans_activity_credit_pct_chk;
alter table public.diet_plans
  add constraint diet_plans_activity_credit_pct_chk
  check (activity_credit_pct between 0 and 100);

-- ── wearable_daily_metrics: burned-calorie columns ────────────────────────
alter table public.wearable_daily_metrics
  add column if not exists active_kcal integer;   -- exercise/movement calories

alter table public.wearable_daily_metrics
  add column if not exists total_kcal integer;    -- active + resting (provider total)

-- ── session_library: optional MET override (NULL -> per-kind default in app)
alter table public.session_library
  add column if not exists met numeric(3,1);
