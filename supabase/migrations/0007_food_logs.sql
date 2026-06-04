-- =========================================================================
-- 0007_food_logs.sql
--
-- Per-patient daily food log. One row per (patient_id, log_date).
-- Source field tracks whether the data was hand-entered by the patient,
-- entered by the clinician, or auto-imported from Cronometer/other.
-- =========================================================================

create table if not exists public.food_logs (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles(id) on delete cascade,
  clinic_id  uuid not null references public.clinics(id) on delete restrict,

  log_date date not null,
  source text default 'manual' not null,   -- 'manual' | 'in-app' | 'cronometer' | 'clinician'

  kcal      integer,
  protein_g integer,
  carbs_g   integer,
  fat_g     integer,
  fiber_g   integer,

  notes text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,

  unique (patient_id, log_date)
);
create index if not exists food_logs_patient_date_idx on public.food_logs(patient_id, log_date desc);
create index if not exists food_logs_clinic_idx on public.food_logs(clinic_id);

alter table public.food_logs enable row level security;

-- Patient sees + writes own; clinician sees + writes any in their clinic.
drop policy if exists "food_logs read self or clinic clinician" on public.food_logs;
create policy "food_logs read self or clinic clinician"
  on public.food_logs for select
  to authenticated
  using (
    patient_id = auth.uid()
    or (
      public.current_user_role() = 'clinician'
      and clinic_id = public.current_user_clinic()
    )
  );

drop policy if exists "food_logs write self" on public.food_logs;
create policy "food_logs write self"
  on public.food_logs for all
  to authenticated
  using (patient_id = auth.uid())
  with check (patient_id = auth.uid());

drop policy if exists "food_logs write clinic clinician" on public.food_logs;
create policy "food_logs write clinic clinician"
  on public.food_logs for all
  to authenticated
  using (
    public.current_user_role() = 'clinician'
    and clinic_id = public.current_user_clinic()
  )
  with check (
    public.current_user_role() = 'clinician'
    and clinic_id = public.current_user_clinic()
  );
