-- =========================================================================
-- 0015_food_favorites_and_barcode.sql
--
-- Adds:
--  1. foods.barcode column + index, so scans can resolve directly without
--     a USDA round trip on subsequent scans. We still populate it from
--     USDA's gtinUpc when we cache a hit.
--  2. food_favorites table — per-patient saved foods for quick re-add.
-- =========================================================================

-- ---------------------------------------------------------------------
-- 1. Barcode on foods
-- ---------------------------------------------------------------------

alter table public.foods
  add column if not exists barcode text;

create index if not exists foods_barcode_idx on public.foods(barcode)
  where barcode is not null;

-- ---------------------------------------------------------------------
-- 2. food_favorites
-- ---------------------------------------------------------------------

create table if not exists public.food_favorites (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles(id) on delete cascade,
  clinic_id  uuid not null references public.clinics(id) on delete restrict,
  food_id    uuid not null references public.foods(id) on delete cascade,

  -- Optional remembered defaults for one-tap quick-add
  default_quantity_g numeric(8,2),
  default_meal text,                         -- 'breakfast' | 'lunch' | 'dinner' | 'snack' | null

  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,

  constraint food_favorites_patient_food_unique unique (patient_id, food_id)
);

create index if not exists food_favorites_patient_idx on public.food_favorites(patient_id);

alter table public.food_favorites enable row level security;

-- Patient sees / writes own; clinician in same clinic can read (for context
-- when reviewing a patient's diet) but cannot mutate.
drop policy if exists "favorites read self or clinic clinician" on public.food_favorites;
create policy "favorites read self or clinic clinician"
  on public.food_favorites for select
  to authenticated
  using (
    patient_id = auth.uid()
    or (
      public.current_user_role() = 'clinician'
      and clinic_id = public.current_user_clinic()
    )
  );

drop policy if exists "favorites insert self" on public.food_favorites;
create policy "favorites insert self"
  on public.food_favorites for insert
  to authenticated
  with check (
    patient_id = auth.uid()
    and clinic_id = public.current_user_clinic()
  );

drop policy if exists "favorites update self" on public.food_favorites;
create policy "favorites update self"
  on public.food_favorites for update
  to authenticated
  using (patient_id = auth.uid())
  with check (patient_id = auth.uid());

drop policy if exists "favorites delete self" on public.food_favorites;
create policy "favorites delete self"
  on public.food_favorites for delete
  to authenticated
  using (patient_id = auth.uid());
