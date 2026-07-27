-- =========================================================================
-- 0037_cancer_screenings.sql
--
-- Adds public.pillar_screenings — a per-pillar screening schedule used by the
-- Cancer pillar's "Screening" tab (which replaces "Recommendations" there).
-- Each row is one screening test with: test name, last performed date,
-- results/notes, and next-due date. Clinician-managed; patient reads own.
--
-- Access pattern mirrors pillar_recommendations exactly, including the
-- care-team (ct_restrict) and active-patient (active_patient_restrict)
-- RESTRICTIVE policies added in 0032 / 0036 so the same PHI fences apply.
-- =========================================================================

create table if not exists public.pillar_screenings (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  pillar_id uuid not null references public.pillars(id) on delete cascade,
  test text not null,               -- e.g. 'Colonoscopy', 'Mammogram'
  last_performed date,              -- when the test was last done
  results text,                     -- free-text result / notes
  next_due date,                    -- when it's next due
  hidden boolean default false not null,  -- hide this row from the patient
  sort_order integer default 0 not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create index if not exists pillar_screenings_pillar_idx  on public.pillar_screenings(pillar_id);
create index if not exists pillar_screenings_patient_idx on public.pillar_screenings(patient_id);

-- ----------- Base RLS (mirrors pillar_recommendations) -----------
alter table public.pillar_screenings enable row level security;

drop policy if exists "patient reads own screenings / clinician reads clinic" on public.pillar_screenings;
create policy "patient reads own screenings / clinician reads clinic"
  on public.pillar_screenings for select
  to authenticated
  using (
    patient_id = auth.uid()
    or (
      public.current_user_role() = 'clinician'
      and clinic_id = public.current_user_clinic()
    )
  );

drop policy if exists "clinician writes screenings in clinic" on public.pillar_screenings;
create policy "clinician writes screenings in clinic"
  on public.pillar_screenings for all
  to authenticated
  using (
    public.current_user_role() = 'clinician'
    and clinic_id = public.current_user_clinic()
  )
  with check (
    public.current_user_role() = 'clinician'
    and clinic_id = public.current_user_clinic()
  );

-- ----------- Care-team RESTRICTIVE policy (mirrors 0032 ct_restrict) -------
drop policy if exists "ct_restrict" on public.pillar_screenings;
create policy "ct_restrict" on public.pillar_screenings
  as restrictive for all to authenticated
  using ( patient_id = public.current_user_id()
          or public.clinician_can_access_patient(patient_id) )
  with check ( patient_id = public.current_user_id()
          or public.clinician_can_access_patient(patient_id) );

-- ----------- Active-patient RESTRICTIVE policy (mirrors 0036) --------------
drop policy if exists "active_patient_restrict" on public.pillar_screenings;
create policy "active_patient_restrict" on public.pillar_screenings
  as restrictive for all to authenticated
  using ( public.current_user_role() <> 'patient'
          or public.current_patient_is_active() )
  with check ( public.current_user_role() <> 'patient'
          or public.current_patient_is_active() );
