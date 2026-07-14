-- =========================================================================
-- 0036_patient_deactivation_and_audit_scope.sql
-- Two fixes from the 2026-07-14 security review:
--
-- 1) Patient soft-delete (mirrors 0035 for clinicians). Hard-deleting a
--    patient destroys the medical record (retention problem) and was
--    available to ANY clinician. Now: patients get deactivated_at; the app
--    blocks deactivated patients at requireUser (they keep zero access) while
--    clinicians retain read access to the record for retention/audit.
--
-- 2) audit_log read access: was clinic-wide for every clinician (including
--    deactivated logins — the policy predates 0035). audit_log meta holds
--    before/after PHI snapshots, so reads are now ADMIN-ONLY.
--    current_user_is_admin() (0035) already requires deactivated_at IS NULL,
--    so deactivated logins are excluded automatically.
--
-- Idempotent.
-- =========================================================================

-- ── 1) Patient deactivation ──────────────────────────────────────────────
alter table public.patient_profiles
  add column if not exists deactivated_at timestamptz;

-- A deactivated patient loses all access at the DB layer too: the restrictive
-- ct_restrict policies allow `patient_id = current_user_id()`, so we narrow
-- the patient-self path with a helper the policies can use. Rather than
-- rewrite every ct_restrict policy, block at the source: current_user_id()
-- stays untouched (it's identity, not authorization) and instead we gate the
-- patient role globally with one more RESTRICTIVE policy on patient_profiles
-- plus the app-layer requireUser check. Clinician access is deliberately
-- unchanged — the record must remain readable for retention.
create or replace function public.current_patient_is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select deactivated_at is null
       from public.patient_profiles
      where profile_id = public.current_user_id()),
    true  -- clinicians / rows without a patient profile are unaffected
  );
$$;

-- Deactivated patients can't read or write ANY patient-bearing table.
-- Same table list as 0032's ct_restrict, same restrictive AND semantics.
do $$
declare
  t text;
  tabs text[] := array[
    'pillars','pillar_factors','factor_observations','lifestyle_drivers',
    'pillar_recommendations','program_assignments','diet_plans','food_logs',
    'grand100_baselines','grand100_patient_targets','messages',
    'wearable_connections','wearable_daily_metrics','food_favorites',
    'medications','medication_doses','medication_dose_logs','medication_change_log',
    'sleep_journal_entries','exercise_set_logs','cardio_session_logs','patient_activities'
  ];
begin
  foreach t in array tabs loop
    execute format('drop policy if exists "active_patient_restrict" on public.%I', t);
    execute format($f$
      create policy "active_patient_restrict" on public.%I
        as restrictive for all to authenticated
        using ( public.current_user_role() <> 'patient'
                or public.current_patient_is_active() )
        with check ( public.current_user_role() <> 'patient'
                or public.current_patient_is_active() )
    $f$, t);
  end loop;
end $$;

drop policy if exists "active_patient_restrict" on public.patient_profiles;
create policy "active_patient_restrict" on public.patient_profiles
  as restrictive for all to authenticated
  using ( public.current_user_role() <> 'patient'
          or public.current_patient_is_active() )
  with check ( public.current_user_role() <> 'patient'
          or public.current_patient_is_active() );

-- ── 2) audit_log: admin-only reads ───────────────────────────────────────
drop policy if exists "clinicians read clinic audit log" on public.audit_log;
create policy "clinicians read clinic audit log"
  on public.audit_log for select
  to authenticated
  using (
    public.current_user_is_admin()
    and clinic_id = public.current_user_clinic()
  );
