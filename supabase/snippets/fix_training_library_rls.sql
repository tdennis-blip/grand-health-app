-- Fix: RLS policies for training library tables that failed due to nested
-- dollar-quoting not working in TablePlus. Run this after 0004_training_library.sql.

drop policy if exists "clinicians read hr_zones" on public.hr_zones;
create policy "clinicians read hr_zones" on public.hr_zones for select
  to authenticated
  using (public.current_user_role() = 'clinician' and clinic_id = public.current_user_clinic());

drop policy if exists "clinicians write hr_zones" on public.hr_zones;
create policy "clinicians write hr_zones" on public.hr_zones for all
  to authenticated
  using (public.current_user_role() = 'clinician' and clinic_id = public.current_user_clinic())
  with check (public.current_user_role() = 'clinician' and clinic_id = public.current_user_clinic());

drop policy if exists "clinicians read training_targets" on public.training_targets;
create policy "clinicians read training_targets" on public.training_targets for select
  to authenticated
  using (public.current_user_role() = 'clinician' and clinic_id = public.current_user_clinic());

drop policy if exists "clinicians write training_targets" on public.training_targets;
create policy "clinicians write training_targets" on public.training_targets for all
  to authenticated
  using (public.current_user_role() = 'clinician' and clinic_id = public.current_user_clinic())
  with check (public.current_user_role() = 'clinician' and clinic_id = public.current_user_clinic());

drop policy if exists "clinicians read exercise_library" on public.exercise_library;
create policy "clinicians read exercise_library" on public.exercise_library for select
  to authenticated
  using (public.current_user_role() = 'clinician' and clinic_id = public.current_user_clinic());

drop policy if exists "clinicians write exercise_library" on public.exercise_library;
create policy "clinicians write exercise_library" on public.exercise_library for all
  to authenticated
  using (public.current_user_role() = 'clinician' and clinic_id = public.current_user_clinic())
  with check (public.current_user_role() = 'clinician' and clinic_id = public.current_user_clinic());

drop policy if exists "clinicians read session_library" on public.session_library;
create policy "clinicians read session_library" on public.session_library for select
  to authenticated
  using (public.current_user_role() = 'clinician' and clinic_id = public.current_user_clinic());

drop policy if exists "clinicians write session_library" on public.session_library;
create policy "clinicians write session_library" on public.session_library for all
  to authenticated
  using (public.current_user_role() = 'clinician' and clinic_id = public.current_user_clinic())
  with check (public.current_user_role() = 'clinician' and clinic_id = public.current_user_clinic());

drop policy if exists "clinicians read program_library" on public.program_library;
create policy "clinicians read program_library" on public.program_library for select
  to authenticated
  using (public.current_user_role() = 'clinician' and clinic_id = public.current_user_clinic());

drop policy if exists "clinicians write program_library" on public.program_library;
create policy "clinicians write program_library" on public.program_library for all
  to authenticated
  using (public.current_user_role() = 'clinician' and clinic_id = public.current_user_clinic())
  with check (public.current_user_role() = 'clinician' and clinic_id = public.current_user_clinic());
