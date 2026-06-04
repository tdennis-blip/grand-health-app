-- =========================================================================
-- 0018_sleep_journal.sql
--
-- Patient-entered nightly sleep journal. Wearables give us numbers but
-- patients want to record subjective context — time in bed, awake time,
-- interruptions, rested feeling, and a free-text "anything different last
-- night" note.
--
-- One row per (patient_id, entry_date). entry_date is the morning the
-- sleep ENDED on (the date the patient woke up).
--
-- RLS:
--   · Patient can read + write own rows.
--   · Clinician in the same clinic can read all rows for their patients.
--   · No clinician writes (subjective patient data).
-- =========================================================================

create table if not exists public.sleep_journal_entries (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references auth.users(id) on delete cascade,

  -- Morning the sleep ended on (local date).
  entry_date date not null,

  -- Clock times as the patient experienced them. No tz — we store the wall
  -- clock the patient saw. Nullable so a partial entry (e.g. only notes)
  -- still saves.
  bed_time time,
  wake_time time,

  -- Derived/explicit duration the patient says they were in bed (minutes).
  -- We let the patient enter directly OR compute it client-side from
  -- bed_time + wake_time and save the result here for trend math.
  time_in_bed_minutes integer
    check (time_in_bed_minutes is null
           or (time_in_bed_minutes >= 0 and time_in_bed_minutes <= 1440)),

  -- Total minutes lying awake (sleep onset latency + WASO). Patients
  -- usually estimate this as a single number — that's fine.
  awake_minutes integer
    check (awake_minutes is null
           or (awake_minutes >= 0 and awake_minutes <= 1440)),

  -- How many times they woke up mid-sleep.
  interruption_count smallint
    check (interruption_count is null
           or (interruption_count >= 0 and interruption_count <= 100)),

  -- Subjective rested feeling, 1 (wrecked) - 5 (great).
  rested_rating smallint
    check (rested_rating is null
           or (rested_rating between 1 and 5)),

  -- "Anything different last night" — caffeine late, alcohol, sick kid,
  -- travel, new room, etc.
  notes text,

  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,

  unique (patient_id, entry_date)
);

create index if not exists sleep_journal_entries_patient_date_idx
  on public.sleep_journal_entries(patient_id, entry_date desc);
create index if not exists sleep_journal_entries_clinic_idx
  on public.sleep_journal_entries(clinic_id);

-- Keep updated_at honest.
create or replace function public.touch_sleep_journal_entries_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_sleep_journal_entries_updated_at
  on public.sleep_journal_entries;
create trigger trg_sleep_journal_entries_updated_at
  before update on public.sleep_journal_entries
  for each row execute function public.touch_sleep_journal_entries_updated_at();

alter table public.sleep_journal_entries enable row level security;

-- Patient writes own.
drop policy if exists "sleep_journal patient self all"
  on public.sleep_journal_entries;
create policy "sleep_journal patient self all"
  on public.sleep_journal_entries
  for all
  to authenticated
  using (patient_id = auth.uid())
  with check (patient_id = auth.uid());

-- Clinician in clinic reads.
drop policy if exists "sleep_journal clinic clinician read"
  on public.sleep_journal_entries;
create policy "sleep_journal clinic clinician read"
  on public.sleep_journal_entries
  for select
  to authenticated
  using (
    public.current_user_role() = 'clinician'
    and clinic_id = public.current_user_clinic()
  );
