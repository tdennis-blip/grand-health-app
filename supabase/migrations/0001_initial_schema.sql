-- =========================================================================
-- 0001_initial_schema.sql
--
-- Initial Grand Health schema. Apply this via the Supabase SQL editor
-- (Database → SQL Editor → paste → Run) or via psql against your project's
-- direct connection.
--
-- This migration creates the `public` schema tables. RLS policies are added
-- in 0002_rls_policies.sql.
-- =========================================================================

-- Required extensions.
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- -------------------------------------------------------------------------
-- Enums
-- -------------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('clinician', 'patient');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type pillar_kind as enum ('cv', 'metabolic', 'neuro', 'cancer', 'physical', 'endocrine');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type factor_status as enum ('on-target', 'borderline', 'off-target');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type factor_weight as enum ('low', 'medium', 'high');
exception
  when duplicate_object then null;
end $$;

-- -------------------------------------------------------------------------
-- clinics
-- -------------------------------------------------------------------------
create table if not exists public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- -------------------------------------------------------------------------
-- profiles  (1:1 with auth.users)
-- -------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  role user_role not null,
  email text not null,
  first_name text,
  last_name text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create index if not exists profiles_clinic_idx on public.profiles(clinic_id);

-- -------------------------------------------------------------------------
-- patient_profiles
-- -------------------------------------------------------------------------
create table if not exists public.patient_profiles (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  date_of_birth text,
  sex text,
  height_cm integer,
  weight_kg integer,
  primary_clinician_id uuid references public.profiles(id),
  member_since timestamptz default now() not null,
  pillar_config jsonb default '{}'::jsonb not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- -------------------------------------------------------------------------
-- clinician_profiles
-- -------------------------------------------------------------------------
create table if not exists public.clinician_profiles (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  title text,
  credentials text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- -------------------------------------------------------------------------
-- risk_factor_library + sets  (clinic-wide reusable definitions)
-- -------------------------------------------------------------------------
create table if not exists public.risk_factor_library (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  name text not null,
  unit text,
  default_goal text,
  weight factor_weight default 'medium' not null,
  default_status factor_status default 'borderline' not null,
  source text,
  note text,
  category text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table if not exists public.risk_factor_sets (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  pillar_kind pillar_kind,
  name text not null,
  description text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table if not exists public.risk_factor_set_items (
  set_id uuid not null references public.risk_factor_sets(id) on delete cascade,
  factor_id uuid not null references public.risk_factor_library(id) on delete cascade,
  sort_order integer default 0 not null,
  primary key (set_id, factor_id)
);

-- -------------------------------------------------------------------------
-- pillars (per patient)
-- -------------------------------------------------------------------------
create table if not exists public.pillars (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  kind pillar_kind not null,
  name text not null,
  description text,
  clinician_note text,
  sort_order integer default 0 not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create index if not exists pillars_patient_idx on public.pillars(patient_id);

-- -------------------------------------------------------------------------
-- pillar_factors
-- -------------------------------------------------------------------------
create table if not exists public.pillar_factors (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  pillar_id uuid not null references public.pillars(id) on delete cascade,
  library_factor_id uuid references public.risk_factor_library(id),
  name text not null,
  current_value text,
  unit text,
  goal text,
  status factor_status default 'borderline' not null,
  weight factor_weight default 'medium' not null,
  source text,
  note text,
  hidden boolean default false not null,
  sort_order integer default 0 not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create index if not exists pillar_factors_pillar_idx on public.pillar_factors(pillar_id);
create index if not exists pillar_factors_patient_idx on public.pillar_factors(patient_id);

-- -------------------------------------------------------------------------
-- factor_observations  (time series of lab values per factor)
-- -------------------------------------------------------------------------
create table if not exists public.factor_observations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  factor_id uuid not null references public.pillar_factors(id) on delete cascade,
  observed_at timestamptz not null,
  value text not null,
  numeric_value integer,
  source text,
  created_at timestamptz default now() not null
);
create index if not exists factor_observations_factor_idx on public.factor_observations(factor_id);

-- -------------------------------------------------------------------------
-- audit_log  (every PHI read/write hits this)
-- -------------------------------------------------------------------------
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid,
  actor_id uuid,
  actor_role text,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  patient_id uuid,
  meta jsonb,
  ip_address text,
  user_agent text,
  occurred_at timestamptz default now() not null
);
create index if not exists audit_log_patient_idx on public.audit_log(patient_id);
create index if not exists audit_log_actor_idx on public.audit_log(actor_id);
create index if not exists audit_log_occurred_idx on public.audit_log(occurred_at);
