-- =========================================================================
-- 0043_training_child_rls_security_definer.sql
--
-- REAL fix for the session-editor hang (0042 did not fix it — see below).
--
-- ── Why 0042 failed ──────────────────────────────────────────────────────
-- The session editor reads session_exercises / session_sets as the non-owner
-- grandhealth_app role, so RLS applies. The policies that actually gate a
-- CLINICIAN's read on those child tables are the ORIGINAL 0004 policies:
--
--   using ( current_user_role()='clinician'
--           and exists (select 1 from public.session_library s
--                       where s.id = session_id
--                         and s.clinic_id = current_user_clinic()) )
--
-- That inner reference to session_library is itself RLS-filtered. Since 0040,
-- session_library carries a RESTRICTIVE policy (ct_restrict_patient_owned)
-- that calls clinician_can_access_patient(patient_id) — a subquery on
-- patient_care_team — PLUS the permissive 0005 "patient reads sessions in
-- their programs" policy that joins program_assignments → program_days (both
-- RLS-enabled). So evaluating the child EXISTS re-runs the WHOLE session_library
-- policy stack, per candidate row, and the planner can't flatten it → the
-- multi-minute hang the page dies on.
--
-- 0042 only dropped the 0040-ADDED policies on the CHILD tables. It left the
-- 0004 child policies (the ones the clinician read uses) AND the expensive
-- 0040 restrictive policy on session_library ITSELF fully in the nested path.
-- That's why the hang survived 0042.
--
-- ── The fix ──────────────────────────────────────────────────────────────
-- Gate the child tables through a SECURITY DEFINER helper. A SECURITY DEFINER
-- function runs as the table owner (grandhealth), and the owner BYPASSES RLS,
-- so the lookups inside it do NOT re-trigger session_library's policy stack.
-- The visibility rules (clinician-in-clinic + care-team scoping, patient owns
-- / assigned) are enforced explicitly inside the function instead. Net: same
-- access, no nested-policy explosion.
--
-- The parent tables (session_library / program_library / hr_zones) keep their
-- 0040 policies — a single by-id read of the parent is cheap; the blow-up only
-- ever came from evaluating that parent stack once PER child row.
--
-- Idempotent.
-- =========================================================================

-- ── Helper: can the current user see a given session (and thus its children)?
-- SECURITY DEFINER → runs as owner → the reads below bypass RLS (no nesting).
create or replace function public.session_visible_to_current_user(p_session uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.session_library s
    where s.id = p_session
      and (
        -- Clinician: session lives in their clinic. Generic templates are
        -- visible to any clinician in the clinic; patient-specific sessions
        -- only to the patient's care team (admins included).
        (
          public.current_user_role() = 'clinician'
          and s.clinic_id = public.current_user_clinic()
          and (s.patient_id is null or public.clinician_can_access_patient(s.patient_id))
        )
        -- Patient: their own patient-specific session,
        or s.patient_id = public.current_user_id()
        -- a generic template in their clinic,
        or (s.patient_id is null and s.clinic_id = public.current_user_clinic())
        -- or a session that's part of a program assigned to them.
        or exists (
          select 1
          from public.program_assignments pa
          join public.program_days pd on pd.program_id = pa.program_id
          where pa.patient_id = public.current_user_id()
            and pd.session_id = s.id
        )
      )
  );
$$;

-- session_sets rows reference a session_exercise, not a session directly.
create or replace function public.session_exercise_visible_to_current_user(p_se uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.session_visible_to_current_user(
    (select se.session_id from public.session_exercises se where se.id = p_se)
  );
$$;

-- Same shape for program_days (program editor reads these).
create or replace function public.program_visible_to_current_user(p_program uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.program_library p
    where p.id = p_program
      and (
        (
          public.current_user_role() = 'clinician'
          and p.clinic_id = public.current_user_clinic()
          and (p.patient_id is null or public.clinician_can_access_patient(p.patient_id))
        )
        or p.patient_id = public.current_user_id()
        or (p.patient_id is null and p.clinic_id = public.current_user_clinic())
        or exists (
          select 1 from public.program_assignments pa
          where pa.program_id = p.id
            and pa.patient_id = public.current_user_id()
        )
      )
  );
$$;

-- ── session_exercises ────────────────────────────────────────────────────
drop policy if exists "clinicians read session_exercises" on public.session_exercises;
drop policy if exists "clinicians write session_exercises" on public.session_exercises;
drop policy if exists "patient reads session_exercises for assigned sessions" on public.session_exercises;
drop policy if exists "patient reads session_exercises own or generic" on public.session_exercises; -- 0040 (already gone via 0042, safe)

-- Read: any user who can see the parent session. Write: clinicians only
-- (matches the original 0004 semantics). Both go through the SECURITY DEFINER
-- helper, so neither re-triggers session_library's RLS.
drop policy if exists "session_exercises read" on public.session_exercises;
create policy "session_exercises read" on public.session_exercises
  for select to authenticated
  using ( public.session_visible_to_current_user(session_id) );

drop policy if exists "session_exercises write" on public.session_exercises;
create policy "session_exercises write" on public.session_exercises
  for all to authenticated
  using ( public.current_user_role() = 'clinician'
          and public.session_visible_to_current_user(session_id) )
  with check ( public.current_user_role() = 'clinician'
          and public.session_visible_to_current_user(session_id) );

-- ── session_sets ─────────────────────────────────────────────────────────
drop policy if exists "clinicians read session_sets" on public.session_sets;
drop policy if exists "clinicians write session_sets" on public.session_sets;
drop policy if exists "patient reads session_sets for assigned sessions" on public.session_sets;
drop policy if exists "patient reads session_sets own or generic" on public.session_sets;

drop policy if exists "session_sets read" on public.session_sets;
create policy "session_sets read" on public.session_sets
  for select to authenticated
  using ( public.session_exercise_visible_to_current_user(session_exercise_id) );

drop policy if exists "session_sets write" on public.session_sets;
create policy "session_sets write" on public.session_sets
  for all to authenticated
  using ( public.current_user_role() = 'clinician'
          and public.session_exercise_visible_to_current_user(session_exercise_id) )
  with check ( public.current_user_role() = 'clinician'
          and public.session_exercise_visible_to_current_user(session_exercise_id) );

-- ── program_days ─────────────────────────────────────────────────────────
drop policy if exists "clinicians read program_days" on public.program_days;
drop policy if exists "clinicians write program_days" on public.program_days;
drop policy if exists "patient reads program_days for assigned programs" on public.program_days;
drop policy if exists "patient reads program_days own or generic" on public.program_days;

drop policy if exists "program_days read" on public.program_days;
create policy "program_days read" on public.program_days
  for select to authenticated
  using ( public.program_visible_to_current_user(program_id) );

drop policy if exists "program_days write" on public.program_days;
create policy "program_days write" on public.program_days
  for all to authenticated
  using ( public.current_user_role() = 'clinician'
          and public.program_visible_to_current_user(program_id) )
  with check ( public.current_user_role() = 'clinician'
          and public.program_visible_to_current_user(program_id) );
