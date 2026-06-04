-- =========================================================================
-- 0010_grand100.sql
--
-- Grand 100: activities the patient wants to be doing at age 100, with the
-- VO₂ max / strength / mobility floor each requires. Plus a per-patient
-- baseline (VO₂ now, etc.) used to back-cast required-today numbers.
--
-- Activities are clinic-wide library rows — the clinician maintains the
-- catalog and every patient in the clinic sees the same list (with their
-- own personalised back-cast math).
-- =========================================================================

do $$ begin
  create type grand100_tier as enum ('essential', 'important', 'stretch');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type level_label as enum ('low', 'moderate', 'high');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.grand100_activities (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,

  name text not null,
  description text,
  icon text,                    -- lucide icon key, e.g. 'Footprints', 'Mountain'
  accent text,                  -- tailwind gradient like 'from-emerald-500 to-teal-600'
  tier grand100_tier default 'important' not null,

  required_vo2 integer not null,         -- mL/kg/min floor at age 100
  required_strength_level level_label default 'moderate' not null,
  required_mobility_level level_label default 'moderate' not null,

  sort_order integer default 0 not null,
  hidden boolean default false not null,

  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create index if not exists grand100_activities_clinic_idx on public.grand100_activities(clinic_id);

alter table public.grand100_activities enable row level security;

drop policy if exists "grand100 activities read clinic" on public.grand100_activities;
create policy "grand100 activities read clinic"
  on public.grand100_activities for select
  to authenticated
  using (clinic_id = public.current_user_clinic());

drop policy if exists "grand100 activities write clinic clinician" on public.grand100_activities;
create policy "grand100 activities write clinic clinician"
  on public.grand100_activities for all
  to authenticated
  using (
    public.current_user_role() = 'clinician'
    and clinic_id = public.current_user_clinic()
  )
  with check (
    public.current_user_role() = 'clinician'
    and clinic_id = public.current_user_clinic()
  );

-- -------------------------------------------------------------------------
-- Per-patient baseline: VO₂ + optional strength/mobility markers.
-- One row per patient.
-- -------------------------------------------------------------------------
create table if not exists public.grand100_baselines (
  patient_id uuid primary key references public.profiles(id) on delete cascade,
  clinic_id  uuid not null references public.clinics(id) on delete restrict,

  vo2_now integer,                       -- mL/kg/min
  grip_kg integer,
  squat_1rm_lb integer,
  strength_percentile integer,
  mobility_percentile integer,
  measured_on date,

  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create index if not exists grand100_baselines_clinic_idx on public.grand100_baselines(clinic_id);

alter table public.grand100_baselines enable row level security;

drop policy if exists "grand100 baseline read self or clinic clinician" on public.grand100_baselines;
create policy "grand100 baseline read self or clinic clinician"
  on public.grand100_baselines for select
  to authenticated
  using (
    patient_id = auth.uid()
    or (
      public.current_user_role() = 'clinician'
      and clinic_id = public.current_user_clinic()
    )
  );

drop policy if exists "grand100 baseline write clinic clinician" on public.grand100_baselines;
create policy "grand100 baseline write clinic clinician"
  on public.grand100_baselines for all
  to authenticated
  using (
    public.current_user_role() = 'clinician'
    and clinic_id = public.current_user_clinic()
  )
  with check (
    public.current_user_role() = 'clinician'
    and clinic_id = public.current_user_clinic()
  );

-- =========================================================================
-- Seed default activities for every existing clinic. Idempotent.
-- =========================================================================
do $$
declare
  c record;
begin
  for c in select id from public.clinics loop
    insert into public.grand100_activities
      (clinic_id, name, description, icon, accent, tier, required_vo2, required_strength_level, required_mobility_level, sort_order)
    values
      (c.id, 'Walk on flat ground at 3 mph',
       'Independent ambulation. The functional floor for healthspan — losing this is losing independence.',
       'Footprints', 'from-emerald-500 to-teal-600', 'essential', 12, 'low', 'low', 0),
      (c.id, 'Carry 20 lb groceries up a flight',
       'Independent home living without help.',
       'ShoppingBag', 'from-amber-500 to-orange-600', 'essential', 19, 'moderate', 'low', 1),
      (c.id, 'Climb 2 flights of stairs without stopping',
       'A common functional benchmark — about 36 steps. Strong evidence as a survival predictor.',
       'TrendingUp', 'from-blue-500 to-indigo-600', 'important', 21, 'moderate', 'low', 2),
      (c.id, 'Hike a 12% incline at 2.5 mph',
       'Hilly trails, mountain villages on vacation, pushing a stroller up a hill.',
       'Mountain', 'from-emerald-600 to-teal-700', 'important', 18, 'moderate', 'moderate', 3),
      (c.id, 'Lift and play with a grandchild',
       'Squat to floor, lift 30 lb, hold and walk, get back up. Mobility-heavy.',
       'Baby', 'from-rose-500 to-pink-600', 'important', 18, 'moderate', 'high', 4),
      (c.id, 'Run a 6-minute mile',
       'Aspirational — 95th-percentile fitness for a non-athlete. Almost no one holds this at 100, but going for it raises the whole curve.',
       'Trophy', 'from-violet-600 to-fuchsia-600', 'stretch', 56, 'high', 'high', 5)
    on conflict do nothing;
  end loop;
end $$;
