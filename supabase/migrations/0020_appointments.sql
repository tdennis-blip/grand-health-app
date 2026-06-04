-- =========================================================================
-- 0020_appointments.sql
--
-- Appointments table. Clinicians create and manage appointments for their
-- patients. Patients can read their own. No patient writes — scheduling
-- goes through the clinical team.
--
-- pre_appointment_instructions: free-text prep notes (fasting, no caffeine,
--   wear comfortable clothing, bring labs, etc.)
-- prep_notice_hours: how many hours before the appointment to surface the
--   prep signal to the patient (default 24 = day-before alert).
-- =========================================================================

create table if not exists public.appointments (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references public.clinics(id) on delete restrict,
  patient_id     uuid not null references public.profiles(id) on delete cascade,
  clinician_id   uuid references public.profiles(id) on delete set null,

  -- When and how long
  scheduled_at   timestamptz not null,
  duration_minutes integer not null default 60,

  -- What kind of visit
  -- Common values: initial_consultation, follow_up, lab_work, body_composition,
  --   nutrition_review, exercise_assessment, telehealth, other
  type           text not null default 'follow_up',
  title          text,          -- optional custom display name

  location       text,          -- "Virtual", "In-office", address, etc.

  -- Pre-appointment prep
  pre_appointment_instructions text,    -- shown to patient when in the prep window
  prep_notice_hours             integer not null default 24,  -- hours before to show signal

  -- Lifecycle
  status         text not null default 'scheduled'
                 check (status in ('scheduled','completed','cancelled')),

  notes          text,          -- internal clinician notes, not shown to patient

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists appointments_patient_idx
  on public.appointments(patient_id, scheduled_at);
create index if not exists appointments_clinic_idx
  on public.appointments(clinic_id, scheduled_at);

alter table public.appointments enable row level security;

-- Patient reads own upcoming + recent appointments
drop policy if exists "appointments patient read" on public.appointments;
create policy "appointments patient read"
  on public.appointments for select
  to authenticated
  using (patient_id = auth.uid());

-- Clinician reads + writes all appointments in their clinic
drop policy if exists "appointments clinician all" on public.appointments;
create policy "appointments clinician all"
  on public.appointments for all
  to authenticated
  using (
    public.current_user_role() = 'clinician'
    and clinic_id = public.current_user_clinic()
  )
  with check (
    public.current_user_role() = 'clinician'
    and clinic_id = public.current_user_clinic()
  );

-- updated_at trigger
drop trigger if exists appointments_updated_at on public.appointments;
create trigger appointments_updated_at
  before update on public.appointments
  for each row execute function public.touch_updated_at();
