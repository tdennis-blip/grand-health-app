-- =========================================================================
-- 0040_patient_specific_training.sql
--
-- Introduces patient-OWNED training content alongside the clinic's generic
-- templates. A nullable patient_id on sessions, programs, and HR zones:
--   • patient_id IS NULL  → generic template, lives in the clinic Library
--     (existing rows all become templates — no behavior change).
--   • patient_id set       → built for that specific patient, lives in their
--     training tab; care-team scoped like all other PHI (migration 0032).
--
-- Patients can read their own patient-specific content AND the clinic's
-- generic templates (so they can pick extra sessions to do).
--
-- Idempotent.
-- =========================================================================

alter table public.session_library add column if not exists patient_id uuid references public.profiles(id) on delete cascade;
alter table public.program_library add column if not exists patient_id uuid references public.profiles(id) on delete cascade;
alter table public.hr_zones        add column if not exists patient_id uuid references public.profiles(id) on delete cascade;

create index if not exists session_library_patient_idx on public.session_library(patient_id);
create index if not exists program_library_patient_idx on public.program_library(patient_id);
create index if not exists hr_zones_patient_idx        on public.hr_zones(patient_id);

-- ── Patient permissive reads ─────────────────────────────────────────────
-- (a) their OWN patient-specific rows, and (b) the clinic's GENERIC templates
-- (patient_id IS NULL) so they can browse/pick extra sessions. Templates are
-- not PHI. Clinician policies from 0004 remain; 0005 assigned-program reads
-- also remain (additive).

drop policy if exists "patient reads own or generic programs" on public.program_library;
create policy "patient reads own or generic programs"
  on public.program_library for select to authenticated
  using (patient_id = auth.uid()
         or (patient_id is null and clinic_id = public.current_user_clinic()));

drop policy if exists "patient reads own or generic sessions" on public.session_library;
create policy "patient reads own or generic sessions"
  on public.session_library for select to authenticated
  using (patient_id = auth.uid()
         or (patient_id is null and clinic_id = public.current_user_clinic()));

drop policy if exists "patient reads own or generic zones" on public.hr_zones;
create policy "patient reads own or generic zones"
  on public.hr_zones for select to authenticated
  using (patient_id = auth.uid()
         or (patient_id is null and clinic_id = public.current_user_clinic()));

-- Child tables: let patients read the exercises/sets of any session they can
-- see (their own patient-specific OR a generic template in their clinic).
drop policy if exists "patient reads session_exercises own or generic" on public.session_exercises;
create policy "patient reads session_exercises own or generic"
  on public.session_exercises for select to authenticated
  using (exists (
    select 1 from public.session_library s
    where s.id = public.session_exercises.session_id
      and (s.patient_id = auth.uid() or (s.patient_id is null and s.clinic_id = public.current_user_clinic()))
  ));

drop policy if exists "patient reads session_sets own or generic" on public.session_sets;
create policy "patient reads session_sets own or generic"
  on public.session_sets for select to authenticated
  using (exists (
    select 1 from public.session_exercises se
    join public.session_library s on s.id = se.session_id
    where se.id = public.session_sets.session_exercise_id
      and (s.patient_id = auth.uid() or (s.patient_id is null and s.clinic_id = public.current_user_clinic()))
  ));

drop policy if exists "patient reads program_days own or generic" on public.program_days;
create policy "patient reads program_days own or generic"
  on public.program_days for select to authenticated
  using (exists (
    select 1 from public.program_library p
    where p.id = public.program_days.program_id
      and (p.patient_id = auth.uid() or (p.patient_id is null and p.clinic_id = public.current_user_clinic()))
  ));

-- ── Care-team RESTRICTIVE scoping for patient-specific rows (clinicians) ──
-- Generic rows (patient_id null) stay clinic-wide as before. Patient-specific
-- rows are only visible to the patient, admins, and the assigned care team
-- (clinician_can_access_patient covers admin + assignment, from 0032).
-- Restrictive ANDs on top of every permissive policy, only narrowing.

drop policy if exists "ct_restrict_patient_owned" on public.session_library;
create policy "ct_restrict_patient_owned" on public.session_library
  as restrictive for all to authenticated
  using (patient_id is null or patient_id = public.current_user_id() or public.clinician_can_access_patient(patient_id))
  with check (patient_id is null or patient_id = public.current_user_id() or public.clinician_can_access_patient(patient_id));

drop policy if exists "ct_restrict_patient_owned" on public.program_library;
create policy "ct_restrict_patient_owned" on public.program_library
  as restrictive for all to authenticated
  using (patient_id is null or patient_id = public.current_user_id() or public.clinician_can_access_patient(patient_id))
  with check (patient_id is null or patient_id = public.current_user_id() or public.clinician_can_access_patient(patient_id));

drop policy if exists "ct_restrict_patient_owned" on public.hr_zones;
create policy "ct_restrict_patient_owned" on public.hr_zones
  as restrictive for all to authenticated
  using (patient_id is null or patient_id = public.current_user_id() or public.clinician_can_access_patient(patient_id))
  with check (patient_id is null or patient_id = public.current_user_id() or public.clinician_can_access_patient(patient_id));

-- Child tables inherit the parent's scoping via EXISTS.
drop policy if exists "ct_restrict_patient_owned" on public.session_exercises;
create policy "ct_restrict_patient_owned" on public.session_exercises
  as restrictive for all to authenticated
  using (exists (
    select 1 from public.session_library s
    where s.id = public.session_exercises.session_id
      and (s.patient_id is null or s.patient_id = public.current_user_id() or public.clinician_can_access_patient(s.patient_id))
  ))
  with check (exists (
    select 1 from public.session_library s
    where s.id = public.session_exercises.session_id
      and (s.patient_id is null or s.patient_id = public.current_user_id() or public.clinician_can_access_patient(s.patient_id))
  ));

drop policy if exists "ct_restrict_patient_owned" on public.session_sets;
create policy "ct_restrict_patient_owned" on public.session_sets
  as restrictive for all to authenticated
  using (exists (
    select 1 from public.session_exercises se
    join public.session_library s on s.id = se.session_id
    where se.id = public.session_sets.session_exercise_id
      and (s.patient_id is null or s.patient_id = public.current_user_id() or public.clinician_can_access_patient(s.patient_id))
  ))
  with check (exists (
    select 1 from public.session_exercises se
    join public.session_library s on s.id = se.session_id
    where se.id = public.session_sets.session_exercise_id
      and (s.patient_id is null or s.patient_id = public.current_user_id() or public.clinician_can_access_patient(s.patient_id))
  ));

drop policy if exists "ct_restrict_patient_owned" on public.program_days;
create policy "ct_restrict_patient_owned" on public.program_days
  as restrictive for all to authenticated
  using (exists (
    select 1 from public.program_library p
    where p.id = public.program_days.program_id
      and (p.patient_id is null or p.patient_id = public.current_user_id() or public.clinician_can_access_patient(p.patient_id))
  ))
  with check (exists (
    select 1 from public.program_library p
    where p.id = public.program_days.program_id
      and (p.patient_id is null or p.patient_id = public.current_user_id() or public.clinician_can_access_patient(p.patient_id))
  ));
