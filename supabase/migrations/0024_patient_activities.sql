-- =========================================================================
-- 0024_patient_activities.sql
-- Patient-logged ad-hoc activity (workouts they did that weren't in the
-- prescribed program). Cardio entries carry minutes; strength/mobility carry
-- sets. Feeds the weekly cardio + 1RM charts and the Home hero training score.
--
-- RLS: patient writes own; patient or clinic clinician reads. Idempotent.
-- =========================================================================

create table if not exists public.patient_activities (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  log_date date not null,
  kind text not null,            -- 'zone2' | 'vo2max' | 'cardio' | 'strength' | 'mobility'
  name text not null,
  minutes integer,               -- cardio only
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.patient_activities drop constraint if exists patient_activities_kind_chk;
alter table public.patient_activities
  add constraint patient_activities_kind_chk
  check (kind in ('zone2', 'vo2max', 'cardio', 'strength', 'mobility'));

create index if not exists patient_activities_patient_date_idx
  on public.patient_activities (patient_id, log_date);
create index if not exists patient_activities_clinic_idx
  on public.patient_activities (clinic_id);

create table if not exists public.patient_activity_sets (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.patient_activities(id) on delete cascade,
  set_number integer not null,
  reps integer,
  weight integer,
  duration_seconds integer,
  created_at timestamptz default now() not null
);
create index if not exists patient_activity_sets_activity_idx
  on public.patient_activity_sets (activity_id);

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table public.patient_activities enable row level security;
alter table public.patient_activity_sets enable row level security;

drop policy if exists "activities read self or clinic clinician" on public.patient_activities;
create policy "activities read self or clinic clinician"
  on public.patient_activities for select
  using (
    patient_id = auth.uid()
    or (public.current_user_role() = 'clinician' and clinic_id = public.current_user_clinic())
  );

drop policy if exists "activities write self" on public.patient_activities;
create policy "activities write self"
  on public.patient_activities for all
  using (patient_id = auth.uid())
  with check (patient_id = auth.uid());

-- Sets: access governed by ownership of the parent activity.
drop policy if exists "activity_sets read via parent" on public.patient_activity_sets;
create policy "activity_sets read via parent"
  on public.patient_activity_sets for select
  using (
    exists (
      select 1 from public.patient_activities pa
      where pa.id = patient_activity_sets.activity_id
        and (
          pa.patient_id = auth.uid()
          or (public.current_user_role() = 'clinician' and pa.clinic_id = public.current_user_clinic())
        )
    )
  );

drop policy if exists "activity_sets write via parent" on public.patient_activity_sets;
create policy "activity_sets write via parent"
  on public.patient_activity_sets for all
  using (
    exists (
      select 1 from public.patient_activities pa
      where pa.id = patient_activity_sets.activity_id and pa.patient_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.patient_activities pa
      where pa.id = patient_activity_sets.activity_id and pa.patient_id = auth.uid()
    )
  );
