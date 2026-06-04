-- =========================================================================
-- 0006_diet.sql
--
-- Per-patient diet plan: RMR, activity multiplier, calorie deficit/surplus,
-- macro targets, fiber + water goals, and a patient-facing notes field.
-- One row per patient (PK = patient_id).
--
-- Access: patient reads own / clinician CRUD in their clinic.
-- =========================================================================

create table if not exists public.diet_plans (
  patient_id uuid primary key references public.profiles(id) on delete cascade,
  clinic_id  uuid not null references public.clinics(id) on delete restrict,

  -- Resting metabolic rate
  rmr_value         integer,                   -- kcal/day
  rmr_method        text,                       -- 'Indirect calorimetry', 'Mifflin-St Jeor', etc.
  rmr_measured_on   date,
  rmr_measured_by   text,                       -- free text for now; can swap to a profile_id FK later

  -- Targets
  activity_multiplier numeric(3,2) default 1.55 not null,  -- 1.20 sedentary .. 1.90 very active
  deficit_kcal        integer default 0 not null,           -- negative = deficit, positive = surplus
  protein_per_kg      numeric(3,1) default 1.6 not null,
  carbs_pct           integer default 45 not null,
  fat_pct             integer default 30 not null,
  fiber_g             integer default 35 not null,
  meals_per_day       integer default 3 not null,
  water_l             numeric(3,1) default 3.0 not null,

  -- Patient-facing
  notes text,

  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create index if not exists diet_plans_clinic_idx on public.diet_plans(clinic_id);

alter table public.diet_plans enable row level security;

drop policy if exists "patient reads own diet plan / clinician reads clinic" on public.diet_plans;
create policy "patient reads own diet plan / clinician reads clinic"
  on public.diet_plans for select
  to authenticated
  using (
    patient_id = auth.uid()
    or (
      public.current_user_role() = 'clinician'
      and clinic_id = public.current_user_clinic()
    )
  );

drop policy if exists "clinician writes diet plans in clinic" on public.diet_plans;
create policy "clinician writes diet plans in clinic"
  on public.diet_plans for all
  to authenticated
  using (
    public.current_user_role() = 'clinician'
    and clinic_id = public.current_user_clinic()
  )
  with check (
    public.current_user_role() = 'clinician'
    and clinic_id = public.current_user_clinic()
  );
