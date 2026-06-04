-- =========================================================================
-- 0017_stack_extensions.sql
--
-- Extends the meds/supplements stack with:
--
--   medication_interactions  — clinic-scoped library of "A + B = warn" rules.
--                              Patterns are case-insensitive substrings;
--                              the app does the matching in JS.
--   medications.quantity_*   — refill tracking columns (qty on hand, qty per
--                              dose, refill threshold in days, last refill).
--   medication_change_log    — per-medication audit timeline; populated by a
--                              trigger on every insert/update/delete of
--                              `medications`. Separate from the generic
--                              `audit_log` because the stack history UI wants
--                              a focused per-med view with structured diffs.
--
-- The change-log trigger runs SECURITY DEFINER so it can write the log row
-- even though direct app-session writes to `medication_change_log` are
-- blocked by RLS. In Supabase the function owner is `postgres` which
-- bypasses RLS.
-- =========================================================================

-- ---------------------------------------------------------------------
-- 1. medication_interactions (clinic-scoped library)
-- ---------------------------------------------------------------------

create table if not exists public.medication_interactions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,

  -- Two name patterns. Case-insensitive substring match against
  -- medications.name in JS — store bare text like "warfarin" / "aspirin"
  -- and we wrap with % in the checker. ILIKE patterns also work as-is.
  name_pattern_a text not null,
  name_pattern_b text not null,

  -- 'info' | 'warn' | 'severe'. UI styling chooses tone based on this.
  severity text default 'warn' not null,
  message text not null,
  source text,                               -- e.g. "UpToDate", "FDA label"

  active boolean default true not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create index if not exists medication_interactions_clinic_idx
  on public.medication_interactions(clinic_id);

alter table public.medication_interactions enable row level security;

drop policy if exists "interactions read clinic" on public.medication_interactions;
create policy "interactions read clinic"
  on public.medication_interactions for select
  to authenticated
  using (clinic_id = public.current_user_clinic());

drop policy if exists "interactions write clinic clinician" on public.medication_interactions;
create policy "interactions write clinic clinician"
  on public.medication_interactions for all
  to authenticated
  using (
    public.current_user_role() = 'clinician'
    and clinic_id = public.current_user_clinic()
  )
  with check (
    public.current_user_role() = 'clinician'
    and clinic_id = public.current_user_clinic()
  );

-- ---------------------------------------------------------------------
-- 2. Refill tracking columns on medications
-- ---------------------------------------------------------------------

alter table public.medications
  add column if not exists quantity_on_hand numeric,
  add column if not exists quantity_per_dose numeric default 1,
  add column if not exists refill_threshold_days integer default 7,
  add column if not exists last_refill_on date;

-- ---------------------------------------------------------------------
-- 3. medication_change_log + trigger
-- ---------------------------------------------------------------------

create table if not exists public.medication_change_log (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.profiles(id) on delete cascade,

  -- Kept around as a soft ref so the history survives deletion of the med.
  medication_id uuid references public.medications(id) on delete set null,

  -- 'create' | 'update' | 'delete' | 'refill'
  change_type text not null,
  -- Column names that actually changed (UPDATE only). Display-friendly diff.
  changed_fields text[],
  before jsonb,
  after jsonb,

  actor_id uuid references public.profiles(id) on delete set null,
  actor_role text,                           -- 'clinician' | 'patient' | null

  created_at timestamptz default now() not null
);
create index if not exists medication_change_log_patient_idx
  on public.medication_change_log(patient_id, created_at desc);
create index if not exists medication_change_log_medication_idx
  on public.medication_change_log(medication_id);

alter table public.medication_change_log enable row level security;

drop policy if exists "med_change_log read self or clinic clinician" on public.medication_change_log;
create policy "med_change_log read self or clinic clinician"
  on public.medication_change_log for select
  to authenticated
  using (
    patient_id = auth.uid()
    or (
      public.current_user_role() = 'clinician'
      and clinic_id = public.current_user_clinic()
    )
  );

-- Note: no INSERT/UPDATE/DELETE policies — all writes go through the
-- SECURITY DEFINER trigger below. Direct app writes are blocked.

create or replace function public.log_medication_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_role text;
  v_change text;
  v_fields text[];
  v_before jsonb;
  v_after jsonb;
  v_patient uuid;
  v_clinic uuid;
  v_med uuid;
begin
  v_actor := auth.uid();

  if v_actor is not null then
    select role into v_role from public.profiles where id = v_actor;
  end if;

  if TG_OP = 'INSERT' then
    v_change := 'create';
    v_after := to_jsonb(NEW);
    v_patient := NEW.patient_id;
    v_clinic := NEW.clinic_id;
    v_med := NEW.id;
  elsif TG_OP = 'UPDATE' then
    v_change := 'update';
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
    v_patient := NEW.patient_id;
    v_clinic := NEW.clinic_id;
    v_med := NEW.id;

    -- Compute the column-name list that actually changed.
    select coalesce(array_agg(key order by key), '{}'::text[])
      into v_fields
    from (
      select key
      from jsonb_each(v_before) as kv(key, val)
      where v_after -> key is distinct from v_before -> key
    ) c;

    -- Skip no-op rewrites (only updated_at changed).
    if v_fields = array['updated_at']::text[] then
      return NEW;
    end if;

    -- Detect a refill bump for nicer history entries.
    if NEW.quantity_on_hand is not null
       and OLD.quantity_on_hand is distinct from NEW.quantity_on_hand
       and coalesce(NEW.quantity_on_hand, 0) > coalesce(OLD.quantity_on_hand, 0) then
      v_change := 'refill';
    end if;
  else
    v_change := 'delete';
    v_before := to_jsonb(OLD);
    v_patient := OLD.patient_id;
    v_clinic := OLD.clinic_id;
    v_med := OLD.id;
  end if;

  insert into public.medication_change_log
    (clinic_id, patient_id, medication_id, change_type, changed_fields,
     before, after, actor_id, actor_role)
  values
    (v_clinic, v_patient, v_med, v_change, v_fields,
     v_before, v_after, v_actor, v_role);

  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;

drop trigger if exists medications_change_log_trg on public.medications;
create trigger medications_change_log_trg
  after insert or update or delete on public.medications
  for each row execute function public.log_medication_change();
