-- =========================================================================
-- 0038_rep_range_and_workout_feedback.sql
--
-- Three training upgrades:
--   1. Provider prescribes a REP RANGE (reps_min..reps_max) per set instead of
--      a single number. The patient still logs the actual reps they did.
--   2. Per-session-exercise COACHING NOTE (session_exercises.coach_note),
--      editable in the session builder — distinct from the exercise-library
--      default note.
--   3. End-of-workout FEEDBACK: the patient records an RPE (1–10) and an
--      optional comment/question per (session, date). Stored in
--      session_feedback_logs; the comment is also pushed to the patient's
--      trainer as an in-app message (handled in app code).
--
-- Idempotent.
-- =========================================================================

-- ── 1. Rep range on prescribed sets ──────────────────────────────────────
alter table public.session_sets
  add column if not exists reps_min integer,
  add column if not exists reps_max integer;

-- Backfill the range from the existing single reps value.
update public.session_sets
  set reps_min = coalesce(reps_min, reps),
      reps_max = coalesce(reps_max, reps)
  where reps_min is null or reps_max is null;

-- ── 2. Per-session-exercise coaching note ────────────────────────────────
alter table public.session_exercises
  add column if not exists coach_note text;

-- ── 3. Post-workout feedback (RPE + comment) ─────────────────────────────
create table if not exists public.session_feedback_logs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null references public.session_library(id) on delete cascade,
  log_date date not null,
  rpe integer,                      -- 1–10 rate of perceived exertion
  comment text,                     -- optional note/question to the trainer
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (patient_id, session_id, log_date)
);

create index if not exists session_feedback_logs_patient_date_idx
  on public.session_feedback_logs (patient_id, log_date);
create index if not exists session_feedback_logs_session_idx
  on public.session_feedback_logs (session_id);
create index if not exists session_feedback_logs_clinic_idx
  on public.session_feedback_logs (clinic_id);

-- ── RLS: patient writes own; patient or clinic clinician reads ────────────
alter table public.session_feedback_logs enable row level security;

drop policy if exists "feedback read self or clinic clinician" on public.session_feedback_logs;
create policy "feedback read self or clinic clinician"
  on public.session_feedback_logs
  for select
  using (
    patient_id = auth.uid()
    or (
      public.current_user_role() = 'clinician'
      and clinic_id = public.current_user_clinic()
    )
  );

drop policy if exists "feedback write self" on public.session_feedback_logs;
create policy "feedback write self"
  on public.session_feedback_logs
  for all
  using (patient_id = auth.uid())
  with check (patient_id = auth.uid());

-- ── Care-team restrictive policy (mirrors migration 0032) ────────────────
drop policy if exists "ct_restrict" on public.session_feedback_logs;
create policy "ct_restrict" on public.session_feedback_logs
  as restrictive for all to authenticated
  using ( patient_id = public.current_user_id()
          or public.clinician_can_access_patient(patient_id) )
  with check ( patient_id = public.current_user_id()
          or public.clinician_can_access_patient(patient_id) );
