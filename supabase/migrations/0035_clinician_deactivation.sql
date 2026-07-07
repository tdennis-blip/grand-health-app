-- =========================================================================
-- 0035_clinician_deactivation.sql
-- Soft-delete for staff logins. Instead of hard-deleting a clinician_profiles
-- row (which would break audit_log, patient_care_team, and messages FKs and
-- destroy HIPAA-relevant history), we mark it deactivated.
--
-- A deactivated clinician:
--   - is hidden from the default Team roster (app layer),
--   - loses admin scope and care-team PHI access at the DATABASE layer
--     (via the updated SECURITY DEFINER helpers below).
--
-- Reversible: set deactivated_at back to NULL to restore access.
-- Idempotent.
-- =========================================================================

alter table public.clinician_profiles
  add column if not exists deactivated_at timestamptz;

-- Admin scope only counts for active clinicians.
create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_admin and deactivated_at is null
       from public.clinician_profiles
      where profile_id = public.current_user_id()),
    false
  );
$$;

-- Care-team / PHI access only for active clinicians.
create or replace function public.clinician_can_access_patient(p_patient uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() = 'clinician'
     and not exists (
       select 1 from public.clinician_profiles cp
       where cp.profile_id = public.current_user_id()
         and cp.deactivated_at is not null
     )
     and (
       public.current_user_is_admin()
       or exists (
         select 1 from public.patient_care_team ct
         where ct.patient_id = p_patient
           and ct.clinician_id = public.current_user_id()
       )
     );
$$;
