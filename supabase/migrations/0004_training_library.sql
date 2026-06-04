-- =========================================================================
-- 0004_training_library.sql
--
-- Training library: exercises, sessions (strength / zone2 / vo2max / mobility),
-- programs (weekly schedule), HR zones, clinic-wide weekly targets, and
-- per-patient program assignments. Mirrors the prototype's training data.
--
-- Access pattern:
--   · All library rows: clinician CRUD inside their clinic.
--   · program_assignments: clinician CRUD inside clinic; patient reads own.
--   · Patient-facing reads on the library will be added later via a
--     separate view or RPC that joins through assignments.
-- =========================================================================

-- -------------------------------------------------------------------------
-- Enums
-- -------------------------------------------------------------------------
do $$ begin
  create type exercise_kind as enum ('strength', 'mobility');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type session_kind as enum ('strength', 'zone2', 'vo2max', 'mobility');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type day_key as enum ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun');
exception
  when duplicate_object then null;
end $$;

-- -------------------------------------------------------------------------
-- HR zones (Z1-Z5) — one row per zone per clinic.
-- -------------------------------------------------------------------------
create table if not exists public.hr_zones (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  zone_key text not null,    -- 'z1'..'z5'
  name text not null,
  short_name text not null,
  low_bpm integer not null,
  high_bpm integer not null,
  sort_order integer default 0 not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (clinic_id, zone_key)
);

-- -------------------------------------------------------------------------
-- Weekly cardio + strength targets — one row per clinic.
-- -------------------------------------------------------------------------
create table if not exists public.training_targets (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  strength_per_week integer default 3 not null,
  zone2_minutes_per_week integer default 180 not null,
  vo2max_minutes_per_week integer default 30 not null,
  mobility_per_week integer default 4 not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- -------------------------------------------------------------------------
-- Exercises — atomic moves with optional attached video.
-- -------------------------------------------------------------------------
create table if not exists public.exercise_library (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  kind exercise_kind default 'strength' not null,
  name text not null,
  primary_area text,
  coach_note text,
  video_title text,
  video_length text,
  video_url text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create index if not exists exercise_library_clinic_idx on public.exercise_library(clinic_id);
create index if not exists exercise_library_kind_idx on public.exercise_library(kind);

-- -------------------------------------------------------------------------
-- Sessions — named workouts. Kind decides what fields apply:
--   strength / mobility: uses session_exercises + session_sets
--   zone2:                modality, duration_min, target_zone_id
--   vo2max:               modality, warmup_min, rounds, work_min,
--                         work_zone_id, recover_min, recover_zone_id,
--                         cooldown_min
-- -------------------------------------------------------------------------
create table if not exists public.session_library (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  kind session_kind default 'strength' not null,
  name text not null,
  focus text,
  est_minutes integer default 45 not null,
  accent text,                              -- tailwind gradient class
  coach_note text,

  -- cardio-only fields (nullable for strength/mobility)
  modality text,
  duration_min integer,
  target_zone_id uuid references public.hr_zones(id) on delete set null,
  warmup_min integer,
  rounds integer,
  work_min integer,
  work_zone_id uuid references public.hr_zones(id) on delete set null,
  recover_min integer,
  recover_zone_id uuid references public.hr_zones(id) on delete set null,
  cooldown_min integer,

  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create index if not exists session_library_clinic_idx on public.session_library(clinic_id);
create index if not exists session_library_kind_idx on public.session_library(kind);

-- Exercises within a strength or mobility session, ordered.
create table if not exists public.session_exercises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.session_library(id) on delete cascade,
  exercise_id uuid not null references public.exercise_library(id) on delete restrict,
  sort_order integer default 0 not null,
  created_at timestamptz default now() not null
);
create index if not exists session_exercises_session_idx on public.session_exercises(session_id);

-- Sets per (session_exercise). For mobility these represent rounds × hold-sec.
create table if not exists public.session_sets (
  id uuid primary key default gen_random_uuid(),
  session_exercise_id uuid not null references public.session_exercises(id) on delete cascade,
  set_number integer not null,
  reps integer default 0 not null,    -- reps for strength; hold-sec for mobility
  weight integer default 0 not null,  -- weight lb for strength; reps/sides for mobility
  created_at timestamptz default now() not null
);
create index if not exists session_sets_se_idx on public.session_sets(session_exercise_id);

-- -------------------------------------------------------------------------
-- Programs — named, optionally a weekly schedule across Mon-Sun.
-- -------------------------------------------------------------------------
create table if not exists public.program_library (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  name text not null,
  description text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create index if not exists program_library_clinic_idx on public.program_library(clinic_id);

create table if not exists public.program_days (
  program_id uuid not null references public.program_library(id) on delete cascade,
  day day_key not null,
  session_id uuid references public.session_library(id) on delete set null,
  primary key (program_id, day)
);

-- -------------------------------------------------------------------------
-- Program assignments — which patients have which program.
-- -------------------------------------------------------------------------
create table if not exists public.program_assignments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  program_id uuid not null references public.program_library(id) on delete cascade,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz default now() not null,
  ended_at timestamptz,
  created_at timestamptz default now() not null
);
create index if not exists program_assignments_patient_idx on public.program_assignments(patient_id);
create index if not exists program_assignments_program_idx on public.program_assignments(program_id);

-- =========================================================================
-- RLS
-- =========================================================================
alter table public.hr_zones            enable row level security;
alter table public.training_targets    enable row level security;
alter table public.exercise_library    enable row level security;
alter table public.session_library     enable row level security;
alter table public.session_exercises   enable row level security;
alter table public.session_sets        enable row level security;
alter table public.program_library     enable row level security;
alter table public.program_days        enable row level security;
alter table public.program_assignments enable row level security;

-- hr_zones, training_targets, exercise_library, session_library, program_library:
-- clinician full access inside their clinic.
do $$ declare
  t text;
  policies text[] := array[
    'hr_zones',
    'training_targets',
    'exercise_library',
    'session_library',
    'program_library'
  ];
begin
  foreach t in array policies loop
    execute format($f$
      drop policy if exists "clinicians read %1$I" on public.%1$I;
      create policy "clinicians read %1$I" on public.%1$I for select
        to authenticated
        using (
          public.current_user_role() = 'clinician'
          and clinic_id = public.current_user_clinic()
        );
      drop policy if exists "clinicians write %1$I" on public.%1$I;
      create policy "clinicians write %1$I" on public.%1$I for all
        to authenticated
        using (
          public.current_user_role() = 'clinician'
          and clinic_id = public.current_user_clinic()
        )
        with check (
          public.current_user_role() = 'clinician'
          and clinic_id = public.current_user_clinic()
        );
    $f$, t);
  end loop;
end $$;

-- session_exercises, session_sets, program_days: clinician access via parent.
drop policy if exists "clinicians read session_exercises" on public.session_exercises;
create policy "clinicians read session_exercises" on public.session_exercises for select
  to authenticated
  using (
    public.current_user_role() = 'clinician'
    and exists (
      select 1 from public.session_library s
      where s.id = session_id and s.clinic_id = public.current_user_clinic()
    )
  );
drop policy if exists "clinicians write session_exercises" on public.session_exercises;
create policy "clinicians write session_exercises" on public.session_exercises for all
  to authenticated
  using (
    public.current_user_role() = 'clinician'
    and exists (
      select 1 from public.session_library s
      where s.id = session_id and s.clinic_id = public.current_user_clinic()
    )
  )
  with check (
    public.current_user_role() = 'clinician'
    and exists (
      select 1 from public.session_library s
      where s.id = session_id and s.clinic_id = public.current_user_clinic()
    )
  );

drop policy if exists "clinicians read session_sets" on public.session_sets;
create policy "clinicians read session_sets" on public.session_sets for select
  to authenticated
  using (
    public.current_user_role() = 'clinician'
    and exists (
      select 1
      from public.session_exercises se
      join public.session_library s on s.id = se.session_id
      where se.id = session_exercise_id and s.clinic_id = public.current_user_clinic()
    )
  );
drop policy if exists "clinicians write session_sets" on public.session_sets;
create policy "clinicians write session_sets" on public.session_sets for all
  to authenticated
  using (
    public.current_user_role() = 'clinician'
    and exists (
      select 1
      from public.session_exercises se
      join public.session_library s on s.id = se.session_id
      where se.id = session_exercise_id and s.clinic_id = public.current_user_clinic()
    )
  )
  with check (
    public.current_user_role() = 'clinician'
    and exists (
      select 1
      from public.session_exercises se
      join public.session_library s on s.id = se.session_id
      where se.id = session_exercise_id and s.clinic_id = public.current_user_clinic()
    )
  );

drop policy if exists "clinicians read program_days" on public.program_days;
create policy "clinicians read program_days" on public.program_days for select
  to authenticated
  using (
    public.current_user_role() = 'clinician'
    and exists (
      select 1 from public.program_library p
      where p.id = program_id and p.clinic_id = public.current_user_clinic()
    )
  );
drop policy if exists "clinicians write program_days" on public.program_days;
create policy "clinicians write program_days" on public.program_days for all
  to authenticated
  using (
    public.current_user_role() = 'clinician'
    and exists (
      select 1 from public.program_library p
      where p.id = program_id and p.clinic_id = public.current_user_clinic()
    )
  )
  with check (
    public.current_user_role() = 'clinician'
    and exists (
      select 1 from public.program_library p
      where p.id = program_id and p.clinic_id = public.current_user_clinic()
    )
  );

-- program_assignments: clinician full access in clinic; patient reads own.
drop policy if exists "patient reads own assignments / clinician reads clinic" on public.program_assignments;
create policy "patient reads own assignments / clinician reads clinic" on public.program_assignments for select
  to authenticated
  using (
    patient_id = auth.uid()
    or (
      public.current_user_role() = 'clinician'
      and clinic_id = public.current_user_clinic()
    )
  );
drop policy if exists "clinician writes assignments in clinic" on public.program_assignments;
create policy "clinician writes assignments in clinic" on public.program_assignments for all
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
-- Seed default HR zones + default targets for every existing clinic.
-- Idempotent.
-- =========================================================================
do $$
declare
  c record;
begin
  for c in select id from public.clinics loop
    insert into public.hr_zones (clinic_id, zone_key, name, short_name, low_bpm, high_bpm, sort_order) values
      (c.id, 'z1', 'Zone 1 — Recovery',   'Z1', 100, 120, 0),
      (c.id, 'z2', 'Zone 2 — Aerobic',    'Z2', 128, 142, 1),
      (c.id, 'z3', 'Zone 3 — Tempo',      'Z3', 143, 156, 2),
      (c.id, 'z4', 'Zone 4 — Threshold',  'Z4', 157, 170, 3),
      (c.id, 'z5', 'Zone 5 — VO₂ max',    'Z5', 171, 188, 4)
    on conflict (clinic_id, zone_key) do nothing;

    insert into public.training_targets (clinic_id) values (c.id)
    on conflict (clinic_id) do nothing;
  end loop;
end $$;
