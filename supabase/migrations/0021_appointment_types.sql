-- =========================================================================
-- 0021_appointment_types.sql
--
-- Per-clinic appointment types. Clinics can define their own visit types
-- on top of (or instead of) the built-in defaults.
--
-- sort_order: lower = shown first in dropdowns.
-- active: soft-delete — inactive types are hidden from new appointments
--   but preserved on historical records.
-- =========================================================================

create table if not exists public.appointment_types (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references public.clinics(id) on delete cascade,
  name         text not null,
  slug         text not null,            -- used as the `type` value on appointments
  color        text,                     -- optional hex or tailwind tone hint
  default_duration_minutes integer not null default 60,
  sort_order   integer not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (clinic_id, slug)
);

create index if not exists appointment_types_clinic_idx
  on public.appointment_types(clinic_id, sort_order);

alter table public.appointment_types enable row level security;

-- Clinicians read + write their own clinic's types
drop policy if exists "appointment_types clinician all" on public.appointment_types;
create policy "appointment_types clinician all"
  on public.appointment_types for all
  to authenticated
  using (
    public.current_user_role() = 'clinician'
    and clinic_id = public.current_user_clinic()
  )
  with check (
    public.current_user_role() = 'clinician'
    and clinic_id = public.current_user_clinic()
  );

-- Patients can read their clinic's types (needed so the patient app can
-- show the type label on their appointments).
drop policy if exists "appointment_types patient read" on public.appointment_types;
create policy "appointment_types patient read"
  on public.appointment_types for select
  to authenticated
  using (
    public.current_user_role() = 'patient'
    and clinic_id = public.current_user_clinic()
  );

-- updated_at trigger
drop trigger if exists appointment_types_updated_at on public.appointment_types;
create trigger appointment_types_updated_at
  before update on public.appointment_types
  for each row execute function public.touch_updated_at();
