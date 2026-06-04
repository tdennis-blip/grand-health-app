-- =========================================================================
-- 0009_foods_and_entries.sql
--
-- Foods + per-meal food log entries with auto-recompute of daily totals.
--
-- foods table: nutrient reference, per-100g. Two kinds of rows:
--   1. USDA-cached rows (source='usda', source_id=fdcId) — global, clinic_id NULL.
--   2. Custom rows added by a patient or clinician (source='custom') —
--      tagged with clinic_id and created_by.
--
-- food_log_entries: per-meal entries that reference a food + grams eaten.
--
-- A trigger recomputes food_logs totals (kcal, macros, fiber) whenever
-- entries change, so the existing food_logs row stays in sync.
-- =========================================================================

create table if not exists public.foods (
  id uuid primary key default gen_random_uuid(),
  source text not null,                 -- 'usda' | 'custom' | 'open-food-facts' (future)
  source_id text,                       -- USDA fdcId, OFF barcode, etc.

  name text not null,
  brand text,
  category text,

  -- Per-100g macros
  kcal_per_100      numeric(8,2),
  protein_g_per_100 numeric(8,2),
  carbs_g_per_100   numeric(8,2),
  fat_g_per_100     numeric(8,2),
  fiber_g_per_100   numeric(8,2),

  -- Per-100g clinically meaningful micros
  vitamin_d_iu_per_100  numeric(8,2),
  vitamin_b12_ug_per_100 numeric(8,2),
  iron_mg_per_100       numeric(8,2),
  magnesium_mg_per_100  numeric(8,2),
  calcium_mg_per_100    numeric(8,2),
  potassium_mg_per_100  numeric(8,2),
  sodium_mg_per_100     numeric(8,2),
  omega3_mg_per_100     numeric(8,2),

  -- Provenance: custom rows are clinic-scoped; cached USDA rows are global.
  clinic_id  uuid references public.clinics(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,

  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,

  constraint foods_source_id_unique unique (source, source_id)
);
create index if not exists foods_name_idx on public.foods using gin (to_tsvector('english', name));
create index if not exists foods_clinic_idx on public.foods(clinic_id);

alter table public.foods enable row level security;

-- Foods: everyone authenticated can read USDA-cached rows (clinic_id null),
-- plus their own clinic's custom rows.
drop policy if exists "read foods global + own clinic" on public.foods;
create policy "read foods global + own clinic"
  on public.foods for select
  to authenticated
  using (
    clinic_id is null
    or clinic_id = public.current_user_clinic()
  );

-- Writes: authenticated users can insert (used by USDA import + custom adds).
-- Updates/deletes only on rows they created OR within their clinic by clinicians.
drop policy if exists "insert foods authenticated" on public.foods;
create policy "insert foods authenticated"
  on public.foods for insert
  to authenticated
  with check (
    -- USDA cache inserts: source='usda', clinic_id null, created_by null
    (source = 'usda' and clinic_id is null)
    -- Custom inserts: must be in caller's clinic
    or (clinic_id = public.current_user_clinic())
  );

drop policy if exists "modify own clinic foods" on public.foods;
create policy "modify own clinic foods"
  on public.foods for update
  to authenticated
  using (clinic_id = public.current_user_clinic())
  with check (clinic_id = public.current_user_clinic());

drop policy if exists "delete own clinic foods" on public.foods;
create policy "delete own clinic foods"
  on public.foods for delete
  to authenticated
  using (clinic_id = public.current_user_clinic());

-- ---------------------------------------------------------------------
-- food_log_entries
-- ---------------------------------------------------------------------

create table if not exists public.food_log_entries (
  id uuid primary key default gen_random_uuid(),
  food_log_id uuid not null references public.food_logs(id) on delete cascade,
  food_id uuid not null references public.foods(id) on delete restrict,
  meal text default 'snack' not null,    -- 'breakfast' | 'lunch' | 'dinner' | 'snack'
  quantity_g numeric(8,2) not null,
  notes text,
  created_at timestamptz default now() not null
);
create index if not exists food_log_entries_log_idx on public.food_log_entries(food_log_id);

alter table public.food_log_entries enable row level security;

-- Patients see+write their own entries (via the parent food_log they own).
-- Clinicians see+write any in their clinic.
drop policy if exists "entries read self or clinic clinician" on public.food_log_entries;
create policy "entries read self or clinic clinician"
  on public.food_log_entries for select
  to authenticated
  using (
    exists (
      select 1 from public.food_logs fl
      where fl.id = food_log_id
        and (
          fl.patient_id = auth.uid()
          or (
            public.current_user_role() = 'clinician'
            and fl.clinic_id = public.current_user_clinic()
          )
        )
    )
  );

drop policy if exists "entries write self or clinic clinician" on public.food_log_entries;
create policy "entries write self or clinic clinician"
  on public.food_log_entries for all
  to authenticated
  using (
    exists (
      select 1 from public.food_logs fl
      where fl.id = food_log_id
        and (
          fl.patient_id = auth.uid()
          or (
            public.current_user_role() = 'clinician'
            and fl.clinic_id = public.current_user_clinic()
          )
        )
    )
  )
  with check (
    exists (
      select 1 from public.food_logs fl
      where fl.id = food_log_id
        and (
          fl.patient_id = auth.uid()
          or (
            public.current_user_role() = 'clinician'
            and fl.clinic_id = public.current_user_clinic()
          )
        )
    )
  );

-- ---------------------------------------------------------------------
-- Recompute trigger: keep food_logs totals in sync with entries.
-- ---------------------------------------------------------------------

create or replace function public.recompute_food_log_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log_id uuid;
  v_kcal int;
  v_protein int;
  v_carbs int;
  v_fat int;
  v_fiber int;
begin
  v_log_id := coalesce(NEW.food_log_id, OLD.food_log_id);
  if v_log_id is null then return coalesce(NEW, OLD); end if;

  select
    coalesce(round(sum(f.kcal_per_100      * e.quantity_g / 100.0))::int, null),
    coalesce(round(sum(f.protein_g_per_100 * e.quantity_g / 100.0))::int, null),
    coalesce(round(sum(f.carbs_g_per_100   * e.quantity_g / 100.0))::int, null),
    coalesce(round(sum(f.fat_g_per_100     * e.quantity_g / 100.0))::int, null),
    coalesce(round(sum(f.fiber_g_per_100   * e.quantity_g / 100.0))::int, null)
  into v_kcal, v_protein, v_carbs, v_fat, v_fiber
  from public.food_log_entries e
  join public.foods f on f.id = e.food_id
  where e.food_log_id = v_log_id;

  update public.food_logs
  set kcal = v_kcal,
      protein_g = v_protein,
      carbs_g = v_carbs,
      fat_g = v_fat,
      fiber_g = v_fiber,
      source = 'in-app',
      updated_at = now()
  where id = v_log_id;

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists food_log_entries_recompute on public.food_log_entries;
create trigger food_log_entries_recompute
  after insert or update or delete on public.food_log_entries
  for each row execute function public.recompute_food_log_totals();
