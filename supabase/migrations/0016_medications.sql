-- =========================================================================
-- 0016_medications.sql
--
-- Meds & supplements ("stack"). Three tables:
--
--   medications        — clinician-managed list of what the patient is taking
--                        (one row per drug/supplement, with optional pillar link).
--   medication_doses   — scheduled doses per medication. A med can have 1+
--                        (e.g. metformin AM/PM, magnesium 10pm) and a
--                        days_of_week mask for non-daily items (rapamycin Sun).
--   medication_dose_logs — per-dose-per-day check-off. (dose_id, scheduled_for)
--                          is unique; presence == taken.
--
-- Authoring: clinician-only writes on medications + medication_doses.
-- Patients read their own. Logs are writable by both the patient (to mark
-- their own doses) and the clinician (so they can mark on a patient's
-- behalf during an appointment).
-- =========================================================================

-- ---------------------------------------------------------------------
-- medications
-- ---------------------------------------------------------------------

create table if not exists public.medications (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  patient_id uuid not null references public.profiles(id) on delete cascade,

  -- 'medication' | 'supplement' — kept loose for now; the UI groups by this.
  kind text default 'medication' not null,
  name text not null,
  dose text,                                    -- e.g. "5 mg", "5000 IU / 100 mcg"
  form text,                                    -- e.g. "tablet", "capsule", "liquid"
  instructions text,                            -- e.g. "with food", "empty stomach"
  notes text,                                   -- clinician-facing rationale

  -- Optional pillar this medication addresses (CV → Rosuvastatin, etc.).
  pillar_id uuid references public.pillars(id) on delete set null,

  start_date date,
  end_date date,
  active boolean default true not null,

  sort_order integer default 0 not null,

  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create index if not exists medications_patient_idx on public.medications(patient_id);
create index if not exists medications_clinic_idx on public.medications(clinic_id);
create index if not exists medications_pillar_idx on public.medications(pillar_id);

alter table public.medications enable row level security;

drop policy if exists "medications read self or clinic clinician" on public.medications;
create policy "medications read self or clinic clinician"
  on public.medications for select
  to authenticated
  using (
    patient_id = auth.uid()
    or (
      public.current_user_role() = 'clinician'
      and clinic_id = public.current_user_clinic()
    )
  );

drop policy if exists "medications write clinic clinician" on public.medications;
create policy "medications write clinic clinician"
  on public.medications for all
  to authenticated
  using (
    public.current_user_role() = 'clinician'
    and clinic_id = public.current_user_clinic()
  )
  with check (
    public.current_user_role() = 'clinician'
    and clinic_id = public.current_user_clinic()
  );

-- ---------------------------------------------------------------------
-- medication_doses — schedule rows
-- ---------------------------------------------------------------------

create table if not exists public.medication_doses (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  medication_id uuid not null references public.medications(id) on delete cascade,

  -- Local clock time the patient is meant to take this dose. We store it
  -- naked (no tz) because the schedule is "7:00 AM in the patient's day",
  -- which is independent of server / clinic timezone shifts.
  time_local time not null,

  -- Optional context for the dose: "with breakfast", "PRN", "empty stomach".
  label text,
  with_food boolean,

  -- Day-of-week mask. Sunday = 0 … Saturday = 6, matching ISO date_part('dow').
  -- Default: every day.
  days_of_week smallint[] default ARRAY[0,1,2,3,4,5,6]::smallint[] not null,

  -- Free-text dose amount override; if null, the parent medication.dose applies.
  amount_override text,

  sort_order integer default 0 not null,

  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null

  -- 0..6 (Sun..Sat) bounds enforced in the Zod schema on writes; PG check
  -- constraints can't subquery and a per-element check on an array is
  -- awkward without a trigger. Not worth it for this volume.
);
create index if not exists medication_doses_medication_idx on public.medication_doses(medication_id);
create index if not exists medication_doses_patient_idx on public.medication_doses(patient_id);

alter table public.medication_doses enable row level security;

drop policy if exists "doses read self or clinic clinician" on public.medication_doses;
create policy "doses read self or clinic clinician"
  on public.medication_doses for select
  to authenticated
  using (
    patient_id = auth.uid()
    or (
      public.current_user_role() = 'clinician'
      and clinic_id = public.current_user_clinic()
    )
  );

drop policy if exists "doses write clinic clinician" on public.medication_doses;
create policy "doses write clinic clinician"
  on public.medication_doses for all
  to authenticated
  using (
    public.current_user_role() = 'clinician'
    and clinic_id = public.current_user_clinic()
  )
  with check (
    public.current_user_role() = 'clinician'
    and clinic_id = public.current_user_clinic()
  );

-- ---------------------------------------------------------------------
-- medication_dose_logs — per-dose-per-day check-offs
-- ---------------------------------------------------------------------

create table if not exists public.medication_dose_logs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  medication_id uuid not null references public.medications(id) on delete cascade,
  -- dose_id can be null if the dose row is later deleted but we want to keep
  -- the audit/history. We carry medication_id explicitly for the same reason.
  dose_id uuid references public.medication_doses(id) on delete set null,

  -- The calendar day this dose applies to (patient-local date).
  scheduled_for date not null,
  taken_at timestamptz default now() not null,

  -- 'patient' | 'clinician' — who marked it.
  recorded_by uuid references public.profiles(id) on delete set null,
  recorded_role text,

  note text,
  created_at timestamptz default now() not null,

  -- One log per (dose, day). Insert = taken, delete = un-take.
  constraint medication_dose_logs_dose_day_unique unique (dose_id, scheduled_for)
);
create index if not exists medication_dose_logs_patient_day_idx
  on public.medication_dose_logs(patient_id, scheduled_for desc);
create index if not exists medication_dose_logs_medication_idx
  on public.medication_dose_logs(medication_id);

alter table public.medication_dose_logs enable row level security;

drop policy if exists "dose_logs read self or clinic clinician" on public.medication_dose_logs;
create policy "dose_logs read self or clinic clinician"
  on public.medication_dose_logs for select
  to authenticated
  using (
    patient_id = auth.uid()
    or (
      public.current_user_role() = 'clinician'
      and clinic_id = public.current_user_clinic()
    )
  );

drop policy if exists "dose_logs write self" on public.medication_dose_logs;
create policy "dose_logs write self"
  on public.medication_dose_logs for all
  to authenticated
  using (patient_id = auth.uid())
  with check (patient_id = auth.uid());

drop policy if exists "dose_logs write clinic clinician" on public.medication_dose_logs;
create policy "dose_logs write clinic clinician"
  on public.medication_dose_logs for all
  to authenticated
  using (
    public.current_user_role() = 'clinician'
    and clinic_id = public.current_user_clinic()
  )
  with check (
    public.current_user_role() = 'clinician'
    and clinic_id = public.current_user_clinic()
  );
