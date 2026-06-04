-- =========================================================================
-- 0018_grand100_targets_and_strength.sql
--
-- Two Grand 100 extensions:
-- 1) An explicit, numeric strength floor on each activity (squat 1RM lb).
--    The existing low/moderate/high label stays for at-a-glance summary;
--    the number drives the new strength-vs-age graph + back-cast math.
-- 2) Per-patient target age per activity, so a patient can say "I want to
--    still climb 2 flights at 90" while keeping the 6-min mile aspiration
--    at 100. Defaults to 100 (current behaviour) when no row exists.
-- =========================================================================

-- ---- 1) Numeric strength floor on the library ---------------------------
alter table public.grand100_activities
  add column if not exists required_strength_lb integer;

comment on column public.grand100_activities.required_strength_lb is
  'Squat-1RM floor in lb at the activity target age. Used by the strength-vs-age trajectory + back-cast.';

-- Seed reasonable defaults onto the built-in activities so the new graph
-- has something to plot the day this migration lands. Idempotent — only
-- writes when the column is still null.
update public.grand100_activities set required_strength_lb = 60
  where required_strength_lb is null and name = 'Walk on flat ground at 3 mph';
update public.grand100_activities set required_strength_lb = 95
  where required_strength_lb is null and name = 'Carry 20 lb groceries up a flight';
update public.grand100_activities set required_strength_lb = 105
  where required_strength_lb is null and name = 'Climb 2 flights of stairs without stopping';
update public.grand100_activities set required_strength_lb = 115
  where required_strength_lb is null and name = 'Hike a 12% incline at 2.5 mph';
update public.grand100_activities set required_strength_lb = 135
  where required_strength_lb is null and name = 'Lift and play with a grandchild';
update public.grand100_activities set required_strength_lb = 185
  where required_strength_lb is null and name = 'Run a 6-minute mile';

-- ---- 2) Per-patient target age per activity -----------------------------
create table if not exists public.grand100_patient_targets (
  patient_id  uuid not null references public.profiles(id) on delete cascade,
  activity_id uuid not null references public.grand100_activities(id) on delete cascade,
  clinic_id   uuid not null references public.clinics(id) on delete restrict,
  target_age  integer not null default 100 check (target_age >= 40 and target_age <= 120),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (patient_id, activity_id)
);
create index if not exists grand100_patient_targets_clinic_idx
  on public.grand100_patient_targets(clinic_id);
create index if not exists grand100_patient_targets_activity_idx
  on public.grand100_patient_targets(activity_id);

alter table public.grand100_patient_targets enable row level security;

drop policy if exists "grand100 target read self or clinic clinician"
  on public.grand100_patient_targets;
create policy "grand100 target read self or clinic clinician"
  on public.grand100_patient_targets for select
  to authenticated
  using (
    patient_id = auth.uid()
    or (
      public.current_user_role() = 'clinician'
      and clinic_id = public.current_user_clinic()
    )
  );

drop policy if exists "grand100 target write self"
  on public.grand100_patient_targets;
create policy "grand100 target write self"
  on public.grand100_patient_targets for all
  to authenticated
  using (patient_id = auth.uid())
  with check (patient_id = auth.uid());

drop policy if exists "grand100 target write clinic clinician"
  on public.grand100_patient_targets;
create policy "grand100 target write clinic clinician"
  on public.grand100_patient_targets for all
  to authenticated
  using (
    public.current_user_role() = 'clinician'
    and clinic_id = public.current_user_clinic()
  )
  with check (
    public.current_user_role() = 'clinician'
    and clinic_id = public.current_user_clinic()
  );
