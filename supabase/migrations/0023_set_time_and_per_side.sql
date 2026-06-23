-- =========================================================================
-- 0023_set_time_and_per_side.sql
-- · Per-set target time (seconds) → drives a countdown timer on the patient app.
-- · Per-exercise unilateral flag → patient logs Left and Right separately.
-- · Patient-logged actual seconds, and a `side` dimension on set logs.
--
-- Idempotent.
-- =========================================================================

-- Per-set prescribed duration (NULL = untimed set).
alter table public.session_sets
  add column if not exists duration_seconds integer;

-- Mark an exercise as unilateral (done per side).
alter table public.exercise_library
  add column if not exists per_side boolean not null default false;

-- Patient-logged actual time + which side the log is for.
alter table public.exercise_set_logs
  add column if not exists actual_seconds integer;

-- 'na' for normal sets; 'left' / 'right' for per-side exercises. NOT NULL with a
-- default so it participates cleanly in the uniqueness constraint below.
alter table public.exercise_set_logs
  add column if not exists side text not null default 'na';

alter table public.exercise_set_logs drop constraint if exists exercise_set_logs_side_chk;
alter table public.exercise_set_logs
  add constraint exercise_set_logs_side_chk check (side in ('na', 'left', 'right'));

-- Replace the old (patient, set, date) uniqueness with one that includes side,
-- so a patient can log Left and Right for the same set on the same day.
alter table public.exercise_set_logs
  drop constraint if exists exercise_set_logs_patient_id_set_id_log_date_key;
alter table public.exercise_set_logs
  drop constraint if exists exercise_set_logs_patient_set_date_side_key;
alter table public.exercise_set_logs
  add constraint exercise_set_logs_patient_set_date_side_key
  unique (patient_id, set_id, log_date, side);
