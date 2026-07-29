-- =========================================================================
-- 0039_daily_activity_intents.sql
--
-- Patient-stated daily workout INTENT, used to make the diet calorie goal
-- respond to what the patient actually plans to do that day (see lib/diet.ts
-- "intent" activity mode).
--
-- Each row is one intended activity for a date:
--   • prescribed session   → session_id set, status planned|declined|done
--   • a different activity  → session_id null, label + kind + expected_kcal
--
-- expected_kcal is stored at save time (MET estimate or the patient's manual
-- figure) so the diet goal and the provider comparison read the same number.
--
-- Also lets the patient opt into intent-based planning:
--   patient_profiles.diet_activity_planning (boolean).
--
-- Idempotent.
-- =========================================================================

create table if not exists public.daily_activity_intents (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  intent_date date not null,
  session_id uuid references public.session_library(id) on delete cascade,
  kind text not null,                 -- strength|zone2|vo2max|mobility|custom
  label text,                         -- name for a custom (off-plan) activity
  status text not null default 'planned', -- planned | declined | done
  expected_kcal integer,              -- credited to the goal when not declined
  minutes integer,                    -- for custom activities (MET estimate)
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists daily_activity_intents_patient_date_idx
  on public.daily_activity_intents (patient_id, intent_date);
create index if not exists daily_activity_intents_clinic_idx
  on public.daily_activity_intents (clinic_id);

-- One row per prescribed session per day (custom rows have null session_id and
-- are not deduped by this partial index).
create unique index if not exists daily_activity_intents_patient_session_date_key
  on public.daily_activity_intents (patient_id, session_id, intent_date)
  where session_id is not null;

-- Patient opt-in flag for intent-based diet planning.
alter table public.patient_profiles
  add column if not exists diet_activity_planning boolean not null default false;

-- ── RLS: patient writes own; patient or clinic clinician reads ────────────
alter table public.daily_activity_intents enable row level security;

drop policy if exists "intents read self or clinic clinician" on public.daily_activity_intents;
create policy "intents read self or clinic clinician"
  on public.daily_activity_intents
  for select
  using (
    patient_id = auth.uid()
    or (
      public.current_user_role() = 'clinician'
      and clinic_id = public.current_user_clinic()
    )
  );

drop policy if exists "intents write self" on public.daily_activity_intents;
create policy "intents write self"
  on public.daily_activity_intents
  for all
  using (patient_id = auth.uid())
  with check (patient_id = auth.uid());

-- ── Care-team restrictive policy (mirrors migration 0032) ────────────────
drop policy if exists "ct_restrict" on public.daily_activity_intents;
create policy "ct_restrict" on public.daily_activity_intents
  as restrictive for all to authenticated
  using ( patient_id = public.current_user_id()
          or public.clinician_can_access_patient(patient_id) )
  with check ( patient_id = public.current_user_id()
          or public.clinician_can_access_patient(patient_id) );
