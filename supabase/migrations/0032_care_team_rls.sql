-- =========================================================================
-- 0032_care_team_rls.sql
-- Enforce the care-team access model at the DATABASE layer (was app-only).
--
-- Model: a clinician may access a patient's PHI only if they are an ADMIN
-- (clinician_profiles.is_admin) OR a member of that patient's care team
-- (patient_care_team). Patients always access their own rows.
--
-- Implementation: RESTRICTIVE policies. Restrictive policies AND with the
-- existing permissive policies, so they only NARROW access — existing patient
-- self-access and clinician clinic-scope still apply, then this caps clinicians
-- to assigned patients. The service role (serviceRoleSql / BYPASSRLS) is
-- unaffected, so care-team helpers, admin writes, cron, and webhooks keep
-- working. These policies only bite per-user `withAuth` queries.
--
-- Scope: patient-bearing PHI tables only. Deliberately NOT applied to:
--   - clinic library/config tables (exercise/session/program libraries, risk
--     library, grand100 activities, hr_zones, training targets, interaction
--     rules, appointment types, clinics) — shared clinic resources.
--   - audit_log — compliance tool, stays clinic-scoped (revisit separately).
--
-- Idempotent.
-- =========================================================================

-- ── Helpers ──────────────────────────────────────────────────────────────
-- SECURITY DEFINER so they can read clinician_profiles / patient_care_team
-- without being blocked by RLS (and to avoid policy recursion).

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_admin from public.clinician_profiles where profile_id = public.current_user_id()),
    false
  );
$$;

create or replace function public.clinician_can_access_patient(p_patient uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() = 'clinician'
     and (
       public.current_user_is_admin()
       or exists (
         select 1 from public.patient_care_team ct
         where ct.patient_id = p_patient
           and ct.clinician_id = public.current_user_id()
       )
     );
$$;

-- ── Restrictive policies: tables with a patient_id column ─────────────────
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
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "ct_restrict" on public.%I', t);
    execute format($f$
      create policy "ct_restrict" on public.%I
        as restrictive for all to authenticated
        using ( patient_id = public.current_user_id()
                or public.clinician_can_access_patient(patient_id) )
        with check ( patient_id = public.current_user_id()
                or public.clinician_can_access_patient(patient_id) )
    $f$, t);
  end loop;
end $$;

-- ── patient_profiles: patient column is profile_id ───────────────────────
drop policy if exists "ct_restrict" on public.patient_profiles;
create policy "ct_restrict" on public.patient_profiles
  as restrictive for all to authenticated
  using ( profile_id = public.current_user_id()
          or public.clinician_can_access_patient(profile_id) )
  with check ( profile_id = public.current_user_id()
          or public.clinician_can_access_patient(profile_id) );

-- ── Child tables without patient_id: scope through the parent ────────────
drop policy if exists "ct_restrict" on public.food_log_entries;
create policy "ct_restrict" on public.food_log_entries
  as restrictive for all to authenticated
  using ( exists (
            select 1 from public.food_logs fl
            where fl.id = food_log_entries.food_log_id
              and ( fl.patient_id = public.current_user_id()
                    or public.clinician_can_access_patient(fl.patient_id) )
          ) )
  with check ( exists (
            select 1 from public.food_logs fl
            where fl.id = food_log_entries.food_log_id
              and ( fl.patient_id = public.current_user_id()
                    or public.clinician_can_access_patient(fl.patient_id) )
          ) );

drop policy if exists "ct_restrict" on public.patient_activity_sets;
create policy "ct_restrict" on public.patient_activity_sets
  as restrictive for all to authenticated
  using ( exists (
            select 1 from public.patient_activities pa
            where pa.id = patient_activity_sets.activity_id
              and ( pa.patient_id = public.current_user_id()
                    or public.clinician_can_access_patient(pa.patient_id) )
          ) )
  with check ( exists (
            select 1 from public.patient_activities pa
            where pa.id = patient_activity_sets.activity_id
              and ( pa.patient_id = public.current_user_id()
                    or public.clinician_can_access_patient(pa.patient_id) )
          ) );
