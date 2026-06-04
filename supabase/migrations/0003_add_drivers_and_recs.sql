-- =========================================================================
-- 0003_add_drivers_and_recs.sql
--
-- Adds:
--   · public.lifestyle_drivers      (per-pillar modifiable behaviors)
--   · public.pillar_recommendations (per-pillar action items the patient sees)
-- Both have the same access pattern as pillars / pillar_factors:
--   patient reads own, clinician reads + writes in their clinic.
-- =========================================================================

create table if not exists public.lifestyle_drivers (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  pillar_id uuid not null references public.pillars(id) on delete cascade,
  name text not null,
  note text,
  hidden boolean default false not null,
  sort_order integer default 0 not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create index if not exists lifestyle_drivers_pillar_idx  on public.lifestyle_drivers(pillar_id);
create index if not exists lifestyle_drivers_patient_idx on public.lifestyle_drivers(patient_id);

create table if not exists public.pillar_recommendations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  pillar_id uuid not null references public.pillars(id) on delete cascade,
  title text not null,
  why text,
  cadence text,
  status text default 'active' not null,   -- 'active' | 'review' | 'paused'
  link text,                                -- optional deep-link key (diet, pa, sleep, bp, supplements)
  hidden boolean default false not null,
  sort_order integer default 0 not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create index if not exists pillar_recs_pillar_idx  on public.pillar_recommendations(pillar_id);
create index if not exists pillar_recs_patient_idx on public.pillar_recommendations(patient_id);

-- ----------- RLS -----------
alter table public.lifestyle_drivers       enable row level security;
alter table public.pillar_recommendations  enable row level security;

drop policy if exists "patient reads own drivers / clinician reads clinic"   on public.lifestyle_drivers;
create policy "patient reads own drivers / clinician reads clinic"
  on public.lifestyle_drivers for select
  to authenticated
  using (
    patient_id = auth.uid()
    or (
      public.current_user_role() = 'clinician'
      and clinic_id = public.current_user_clinic()
    )
  );

drop policy if exists "clinician writes drivers in clinic" on public.lifestyle_drivers;
create policy "clinician writes drivers in clinic"
  on public.lifestyle_drivers for all
  to authenticated
  using (
    public.current_user_role() = 'clinician'
    and clinic_id = public.current_user_clinic()
  )
  with check (
    public.current_user_role() = 'clinician'
    and clinic_id = public.current_user_clinic()
  );

drop policy if exists "patient reads own recs / clinician reads clinic" on public.pillar_recommendations;
create policy "patient reads own recs / clinician reads clinic"
  on public.pillar_recommendations for select
  to authenticated
  using (
    patient_id = auth.uid()
    or (
      public.current_user_role() = 'clinician'
      and clinic_id = public.current_user_clinic()
    )
  );

drop policy if exists "clinician writes recs in clinic" on public.pillar_recommendations;
create policy "clinician writes recs in clinic"
  on public.pillar_recommendations for all
  to authenticated
  using (
    public.current_user_role() = 'clinician'
    and clinic_id = public.current_user_clinic()
  )
  with check (
    public.current_user_role() = 'clinician'
    and clinic_id = public.current_user_clinic()
  );
