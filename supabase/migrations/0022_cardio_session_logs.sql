-- =========================================================================
-- 0022_cardio_session_logs.sql
-- Patient-logged completion + actual minutes for cardio sessions (zone2 /
-- vo2max), which have no per-set rows. One row per (patient, session, date).
-- Clinicians in the clinic can read these.
--
-- Mirrors 0019_exercise_set_logs (RLS: patient writes own, clinic clinician
-- reads). Idempotent.
-- =========================================================================

create table if not exists public.cardio_session_logs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null references public.session_library(id) on delete cascade,
  log_date date not null,
  actual_minutes integer,
  done boolean not null default true,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (patient_id, session_id, log_date)
);

create index if not exists cardio_session_logs_patient_date_idx
  on public.cardio_session_logs (patient_id, log_date);
create index if not exists cardio_session_logs_session_idx
  on public.cardio_session_logs (session_id);
create index if not exists cardio_session_logs_clinic_idx
  on public.cardio_session_logs (clinic_id);

-- ── RLS: patient writes own; patient or clinic clinician reads ─────────────
alter table public.cardio_session_logs enable row level security;

drop policy if exists "cardio_logs read self or clinic clinician" on public.cardio_session_logs;
create policy "cardio_logs read self or clinic clinician"
  on public.cardio_session_logs
  for select
  using (
    patient_id = auth.uid()
    or (
      public.current_user_role() = 'clinician'
      and clinic_id = public.current_user_clinic()
    )
  );

drop policy if exists "cardio_logs write self" on public.cardio_session_logs;
create policy "cardio_logs write self"
  on public.cardio_session_logs
  for all
  using (patient_id = auth.uid())
  with check (patient_id = auth.uid());
