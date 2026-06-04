-- =========================================================================
-- 0005_patient_training_reads.sql
--
-- Adds scoped read policies on the training library tables so patients can
-- read ONLY the content that's part of a program assigned to them. Clinician
-- policies from 0004 remain in place (additive).
--
-- Column references are fully qualified (public.<table>.<col>) because
-- some inner subquery tables share column names with the outer table the
-- policy is attached to (e.g. both program_library and program_assignments
-- have an "id" column).
--
-- Apply this in Supabase → SQL Editor → New query → Run.
-- =========================================================================

-- program_library: patient sees programs assigned to them.
drop policy if exists "patient reads programs assigned to them" on public.program_library;
create policy "patient reads programs assigned to them"
  on public.program_library for select
  to authenticated
  using (
    exists (
      select 1 from public.program_assignments pa
      where pa.program_id = public.program_library.id
        and pa.patient_id = auth.uid()
    )
  );

-- program_days: patient sees days of their assigned programs.
drop policy if exists "patient reads program_days for assigned programs" on public.program_days;
create policy "patient reads program_days for assigned programs"
  on public.program_days for select
  to authenticated
  using (
    exists (
      select 1 from public.program_assignments pa
      where pa.program_id = public.program_days.program_id
        and pa.patient_id = auth.uid()
    )
  );

-- session_library: patient sees sessions referenced by their programs.
drop policy if exists "patient reads sessions in their programs" on public.session_library;
create policy "patient reads sessions in their programs"
  on public.session_library for select
  to authenticated
  using (
    exists (
      select 1
      from public.program_assignments pa
      join public.program_days pd on pd.program_id = pa.program_id
      where pa.patient_id = auth.uid()
        and pd.session_id = public.session_library.id
    )
  );

-- exercise_library: patient sees exercises used in sessions they can see.
drop policy if exists "patient reads exercises in their sessions" on public.exercise_library;
create policy "patient reads exercises in their sessions"
  on public.exercise_library for select
  to authenticated
  using (
    exists (
      select 1
      from public.program_assignments pa
      join public.program_days pd on pd.program_id = pa.program_id
      join public.session_exercises se on se.session_id = pd.session_id
      where pa.patient_id = auth.uid()
        and se.exercise_id = public.exercise_library.id
    )
  );

-- session_exercises: same scoping.
drop policy if exists "patient reads session_exercises for assigned sessions" on public.session_exercises;
create policy "patient reads session_exercises for assigned sessions"
  on public.session_exercises for select
  to authenticated
  using (
    exists (
      select 1
      from public.program_assignments pa
      join public.program_days pd on pd.program_id = pa.program_id
      where pa.patient_id = auth.uid()
        and pd.session_id = public.session_exercises.session_id
    )
  );

-- session_sets: scope through session_exercises → program_days → assignment.
drop policy if exists "patient reads session_sets for assigned sessions" on public.session_sets;
create policy "patient reads session_sets for assigned sessions"
  on public.session_sets for select
  to authenticated
  using (
    exists (
      select 1
      from public.session_exercises se
      join public.program_days pd on pd.session_id = se.session_id
      join public.program_assignments pa on pa.program_id = pd.program_id
      where pa.patient_id = auth.uid()
        and se.id = public.session_sets.session_exercise_id
    )
  );

-- hr_zones: patient sees zones referenced by their sessions.
drop policy if exists "patient reads hr_zones referenced by their sessions" on public.hr_zones;
create policy "patient reads hr_zones referenced by their sessions"
  on public.hr_zones for select
  to authenticated
  using (
    exists (
      select 1
      from public.session_library s
      join public.program_days pd on pd.session_id = s.id
      join public.program_assignments pa on pa.program_id = pd.program_id
      where pa.patient_id = auth.uid()
        and (
          s.target_zone_id = public.hr_zones.id
          or s.work_zone_id = public.hr_zones.id
          or s.recover_zone_id = public.hr_zones.id
        )
    )
  );

-- training_targets: patient sees their clinic's targets (not PHI).
drop policy if exists "patient reads training_targets for own clinic" on public.training_targets;
create policy "patient reads training_targets for own clinic"
  on public.training_targets for select
  to authenticated
  using (clinic_id = public.current_user_clinic());
