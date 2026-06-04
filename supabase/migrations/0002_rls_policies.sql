-- =========================================================================
-- 0002_rls_policies.sql
--
-- Row Level Security. The rule of thumb:
--   · Patients see their own rows only.
--   · Clinicians see every row that belongs to a patient in their clinic.
--   · No one writes through the anon role; writes happen via authenticated
--     role + policies, OR via the service-role key from server code.
--
-- Helpers:
--   auth.uid()  → uuid of the logged-in user (from JWT)
--   public.current_user_role()    → 'clinician' | 'patient' | null
--   public.current_user_clinic()  → uuid of the user's clinic
-- =========================================================================

-- -------------------------------------------------------------------------
-- Helper functions. Marked SECURITY DEFINER + STABLE so RLS can call them
-- cheaply and they don't recurse.
-- -------------------------------------------------------------------------
create or replace function public.current_user_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role::text from public.profiles where id = auth.uid()
$$;

create or replace function public.current_user_clinic()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select clinic_id from public.profiles where id = auth.uid()
$$;

-- -------------------------------------------------------------------------
-- Enable RLS on every table.
-- -------------------------------------------------------------------------
alter table public.clinics                enable row level security;
alter table public.profiles               enable row level security;
alter table public.patient_profiles       enable row level security;
alter table public.clinician_profiles     enable row level security;
alter table public.risk_factor_library    enable row level security;
alter table public.risk_factor_sets       enable row level security;
alter table public.risk_factor_set_items  enable row level security;
alter table public.pillars                enable row level security;
alter table public.pillar_factors         enable row level security;
alter table public.factor_observations    enable row level security;
alter table public.audit_log              enable row level security;

-- -------------------------------------------------------------------------
-- clinics — everyone in the clinic can read their own row.
-- -------------------------------------------------------------------------
drop policy if exists "members read own clinic" on public.clinics;
create policy "members read own clinic"
  on public.clinics for select
  to authenticated
  using (id = public.current_user_clinic());

-- -------------------------------------------------------------------------
-- profiles — you can read your own row; clinicians read everyone in their clinic.
-- -------------------------------------------------------------------------
drop policy if exists "self or same-clinic clinician reads profile" on public.profiles;
create policy "self or same-clinic clinician reads profile"
  on public.profiles for select
  to authenticated
  using (
    id = auth.uid()
    or (
      public.current_user_role() = 'clinician'
      and clinic_id = public.current_user_clinic()
    )
  );

drop policy if exists "self updates own profile" on public.profiles;
create policy "self updates own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- -------------------------------------------------------------------------
-- patient_profiles — patient reads own; clinician reads all in clinic.
-- Writes restricted similarly. Service role bypasses for admin tasks.
-- -------------------------------------------------------------------------
drop policy if exists "patient reads self / clinician reads clinic" on public.patient_profiles;
create policy "patient reads self / clinician reads clinic"
  on public.patient_profiles for select
  to authenticated
  using (
    profile_id = auth.uid()
    or (
      public.current_user_role() = 'clinician'
      and clinic_id = public.current_user_clinic()
    )
  );

drop policy if exists "clinician writes patient profiles in clinic" on public.patient_profiles;
create policy "clinician writes patient profiles in clinic"
  on public.patient_profiles for all
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
-- clinician_profiles — clinician reads own + clinic teammates.
-- -------------------------------------------------------------------------
drop policy if exists "clinic members read clinicians" on public.clinician_profiles;
create policy "clinic members read clinicians"
  on public.clinician_profiles for select
  to authenticated
  using (clinic_id = public.current_user_clinic());

drop policy if exists "clinician writes own profile" on public.clinician_profiles;
create policy "clinician writes own profile"
  on public.clinician_profiles for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- -------------------------------------------------------------------------
-- risk_factor_library + sets — clinic-wide reads/writes for clinicians.
-- Patients can't see the library (the patient app only renders the
-- per-patient pillar_factors that the clinician has assigned them).
-- -------------------------------------------------------------------------
drop policy if exists "clinicians read library" on public.risk_factor_library;
create policy "clinicians read library"
  on public.risk_factor_library for select
  to authenticated
  using (
    public.current_user_role() = 'clinician'
    and clinic_id = public.current_user_clinic()
  );

drop policy if exists "clinicians write library" on public.risk_factor_library;
create policy "clinicians write library"
  on public.risk_factor_library for all
  to authenticated
  using (
    public.current_user_role() = 'clinician'
    and clinic_id = public.current_user_clinic()
  )
  with check (
    public.current_user_role() = 'clinician'
    and clinic_id = public.current_user_clinic()
  );

drop policy if exists "clinicians read sets" on public.risk_factor_sets;
create policy "clinicians read sets"
  on public.risk_factor_sets for select
  to authenticated
  using (
    public.current_user_role() = 'clinician'
    and clinic_id = public.current_user_clinic()
  );

drop policy if exists "clinicians write sets" on public.risk_factor_sets;
create policy "clinicians write sets"
  on public.risk_factor_sets for all
  to authenticated
  using (
    public.current_user_role() = 'clinician'
    and clinic_id = public.current_user_clinic()
  )
  with check (
    public.current_user_role() = 'clinician'
    and clinic_id = public.current_user_clinic()
  );

drop policy if exists "clinicians read set items" on public.risk_factor_set_items;
create policy "clinicians read set items"
  on public.risk_factor_set_items for select
  to authenticated
  using (
    public.current_user_role() = 'clinician'
    and exists (
      select 1 from public.risk_factor_sets s
      where s.id = set_id and s.clinic_id = public.current_user_clinic()
    )
  );

drop policy if exists "clinicians write set items" on public.risk_factor_set_items;
create policy "clinicians write set items"
  on public.risk_factor_set_items for all
  to authenticated
  using (
    public.current_user_role() = 'clinician'
    and exists (
      select 1 from public.risk_factor_sets s
      where s.id = set_id and s.clinic_id = public.current_user_clinic()
    )
  )
  with check (
    public.current_user_role() = 'clinician'
    and exists (
      select 1 from public.risk_factor_sets s
      where s.id = set_id and s.clinic_id = public.current_user_clinic()
    )
  );

-- -------------------------------------------------------------------------
-- pillars — patient reads own; clinician reads + writes in clinic.
-- -------------------------------------------------------------------------
drop policy if exists "patient reads own pillars / clinician reads clinic" on public.pillars;
create policy "patient reads own pillars / clinician reads clinic"
  on public.pillars for select
  to authenticated
  using (
    patient_id = auth.uid()
    or (
      public.current_user_role() = 'clinician'
      and clinic_id = public.current_user_clinic()
    )
  );

drop policy if exists "clinician writes pillars in clinic" on public.pillars;
create policy "clinician writes pillars in clinic"
  on public.pillars for all
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
-- pillar_factors — same access pattern as pillars.
-- -------------------------------------------------------------------------
drop policy if exists "patient reads own factors / clinician reads clinic" on public.pillar_factors;
create policy "patient reads own factors / clinician reads clinic"
  on public.pillar_factors for select
  to authenticated
  using (
    patient_id = auth.uid()
    or (
      public.current_user_role() = 'clinician'
      and clinic_id = public.current_user_clinic()
    )
  );

drop policy if exists "clinician writes pillar_factors in clinic" on public.pillar_factors;
create policy "clinician writes pillar_factors in clinic"
  on public.pillar_factors for all
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
-- factor_observations — same access pattern.
-- -------------------------------------------------------------------------
drop policy if exists "patient reads own observations / clinician reads clinic" on public.factor_observations;
create policy "patient reads own observations / clinician reads clinic"
  on public.factor_observations for select
  to authenticated
  using (
    patient_id = auth.uid()
    or (
      public.current_user_role() = 'clinician'
      and clinic_id = public.current_user_clinic()
    )
  );

drop policy if exists "clinician writes observations in clinic" on public.factor_observations;
create policy "clinician writes observations in clinic"
  on public.factor_observations for all
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
-- audit_log — readable only by clinicians of the same clinic; appendable
-- by any authenticated user (so the app can log its own reads). Updates
-- and deletes are forbidden via the authenticated role.
-- -------------------------------------------------------------------------
drop policy if exists "clinicians read clinic audit log" on public.audit_log;
create policy "clinicians read clinic audit log"
  on public.audit_log for select
  to authenticated
  using (
    public.current_user_role() = 'clinician'
    and clinic_id = public.current_user_clinic()
  );

drop policy if exists "authenticated insert into audit log" on public.audit_log;
create policy "authenticated insert into audit log"
  on public.audit_log for insert
  to authenticated
  with check (actor_id = auth.uid());
