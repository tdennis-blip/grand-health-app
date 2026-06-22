-- =========================================================================
-- 0021_wearable_bedtime.sql
-- Store the night's bedtime + wake time from the wearable's sleep record so
-- the patient Sleep screen can show "to bed / woke up" times.
--
-- Stored as text in ISO-8601 WITH the device's local UTC offset
-- (e.g. 2026-06-21T23:14:00-06:00) so we can display the local clock time
-- without timezone math.
--
-- Idempotent.
-- =========================================================================

alter table public.wearable_daily_metrics
  add column if not exists bedtime_start text;  -- went to bed (ISO w/ offset)

alter table public.wearable_daily_metrics
  add column if not exists bedtime_end text;    -- woke up (ISO w/ offset)
