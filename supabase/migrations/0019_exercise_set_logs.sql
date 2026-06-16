-- =========================================================================
-- 0019_exercise_set_logs.sql
-- Patient-logged ACTUAL performance per prescribed set.
--
-- The clinician sets prescribed reps/weight in session_sets. When a patient
-- performs a session, they log what they actually did here — one row per
-- (patient, set, date). Clinicians in the clinic can read these.
--
-- Idempotent.
-- =========================================================================

create table if not exists public.exercise_set_logs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null references public.session_library(id) on delete cascade,
  set_id uuid not null references public.session_sets(id) on delete cascade,
  log_date date not null,
  actual_reps integer,
  actual_weight integer,
  done boolean not null default true,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (patient_id, set_id, log_date)
);

create index if not exists exercise_set_logs_patient_date_idx
  on public.exercise_set_logs (patient_id, log_date);
create index if not exists exercise_set_logs_session_idx
  on public.exercise_set_logs (session_id);
create index if not exists exercise_set_logs_clinic_idx
  on public.exercise_set_logs (clinic_id);

-- ── RLS: patient writes own; patient or clinic clinician reads ─────────────
alter table public.exercise_set_logs enable row level security;

drop policy if exists "set_logs read self or clinic clinician" on public.exercise_set_logs;
create policy "set_logs read self or clinic clinician"
  on public.exercise_set_logs
  for select
  using (
    patient_id = auth.uid()
    or (
      public.current_user_role() = 'clinician'
      and clinic_id = public.current_user_clinic()
    )
  );

drop policy if exists "set_logs write self" on public.exercise_set_logs;
create policy "set_logs write self"
  on public.exercise_set_logs
  for all
  using (patient_id = auth.uid())
  with check (patient_id = auth.uid());
