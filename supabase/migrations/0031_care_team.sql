-- =========================================================================
-- 0031_care_team.sql
-- Care-team model: assign clinicians to patients; clinicians see only their
-- assigned patients (enforced in the app for this pass). Admins see everyone.
--
--   patient_care_team        — (patient, clinician) membership, many-to-many.
--   clinician_profiles.is_admin — true => sees all patients in the clinic.
--
-- Idempotent.
-- =========================================================================

-- Admin flag on clinicians.
alter table public.clinician_profiles
  add column if not exists is_admin boolean not null default false;

-- Care-team membership.
create table if not exists public.patient_care_team (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references public.clinics(id) on delete cascade,
  patient_id  uuid not null references public.profiles(id) on delete cascade,
  clinician_id uuid not null references public.profiles(id) on delete cascade,
  added_by    uuid references public.profiles(id) on delete set null,
  added_at    timestamptz not null default now(),
  unique (patient_id, clinician_id)
);

create index if not exists patient_care_team_patient_idx on public.patient_care_team(patient_id);
create index if not exists patient_care_team_clinician_idx on public.patient_care_team(clinician_id);

alter table public.patient_care_team enable row level security;

-- Read: the patient themselves, or any clinician in the same clinic.
drop policy if exists "care_team read" on public.patient_care_team;
create policy "care_team read"
  on public.patient_care_team for select
  to authenticated
  using (
    patient_id = auth.uid()
    or (public.current_user_role() = 'clinician' and clinic_id = public.current_user_clinic())
  );

-- Write: clinicians in the clinic (self-vs-admin nuance enforced in the app).
drop policy if exists "care_team write" on public.patient_care_team;
create policy "care_team write"
  on public.patient_care_team for all
  to authenticated
  using (public.current_user_role() = 'clinician' and clinic_id = public.current_user_clinic())
  with check (public.current_user_role() = 'clinician' and clinic_id = public.current_user_clinic());

-- Make tdennis@mygrandhealth.com an admin (sees everyone).
update public.clinician_profiles cp
set is_admin = true
from public.profiles p
where p.id = cp.profile_id
  and lower(p.email) = 'tdennis@mygrandhealth.com';
