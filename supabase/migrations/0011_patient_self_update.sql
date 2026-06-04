-- =========================================================================
-- 0011_patient_self_update.sql
--
-- Let patients update their own patient_profiles row for the demographic
-- fields the diet + Grand 100 math depend on (DOB, sex, height_cm,
-- weight_kg). A BEFORE-UPDATE trigger pins the protected columns
-- (clinic_id, primary_clinician_id, member_since, pillar_config) back to
-- their old values whenever the actor is a patient — so even a direct DB
-- write via the user's JWT can't change clinic assignment or clinician.
--
-- profiles.first_name / last_name are already self-editable via the
-- "self updates own profile" policy from 0002.
-- =========================================================================

-- -------------------------------------------------------------------------
-- RLS: patient may UPDATE their own patient_profiles row.
-- (Clinicians already have "for all" on this table from 0002.)
-- -------------------------------------------------------------------------
drop policy if exists "patient updates self" on public.patient_profiles;
create policy "patient updates self"
  on public.patient_profiles for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- -------------------------------------------------------------------------
-- Trigger: when a patient self-updates, force protected columns back to
-- their previous values. Clinician updates are untouched.
-- -------------------------------------------------------------------------
create or replace function public.patient_profiles_self_update_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only intervene when the actor is a patient touching their own row.
  if public.current_user_role() = 'patient'
     and new.profile_id = auth.uid() then
    new.clinic_id            := old.clinic_id;
    new.primary_clinician_id := old.primary_clinician_id;
    new.member_since         := old.member_since;
    new.pillar_config        := old.pillar_config;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists patient_profiles_self_update_guard on public.patient_profiles;
create trigger patient_profiles_self_update_guard
  before update on public.patient_profiles
  for each row execute function public.patient_profiles_self_update_guard();
