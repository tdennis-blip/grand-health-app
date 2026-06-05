-- =========================================================================
-- 0000_rds_compat.sql
--
-- Compatibility shims so the remaining migrations (written for Supabase)
-- run unchanged on plain RDS Postgres.
--
-- Run this FIRST, before all other migrations.
-- It is safe to re-run on a fresh or partial database.
-- =========================================================================

-- ── Clean slate (drop partial state from any previous failed runs) ────────
-- CASCADE drops all dependent objects (foreign keys, policies, etc.)
drop schema if exists public cascade;
create schema public;
grant all on schema public to grandhealth;
grant all on schema public to public;

-- ── Roles ─────────────────────────────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon;
  end if;
end $$;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'grandhealth') then
    grant authenticated to grandhealth;
  end if;
end $$;

-- ── auth schema ───────────────────────────────────────────────────────────
drop schema if exists auth cascade;
create schema auth;
grant usage on schema auth to authenticated;
grant usage on schema auth to grandhealth;

-- auth.users stub — Supabase stores users here; on RDS users live in
-- Cognito. We keep this table so foreign key references in migrations work.
-- The app inserts a row here when creating a profile (same UUID as Cognito sub).
create table auth.users (
  id uuid primary key,
  email text,
  created_at timestamptz default now()
);

grant all on auth.users to grandhealth;
grant all on auth.users to authenticated;

-- auth.uid() — reads current user ID from session var set by withAuth
create or replace function auth.uid() returns uuid
  language sql stable
as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid
$$;

-- auth.jwt() — minimal claims object (sub + role)
create or replace function auth.jwt() returns jsonb
  language sql stable
as $$
  select jsonb_build_object(
    'sub',  nullif(current_setting('app.current_user_id',   true), ''),
    'role', nullif(current_setting('app.current_user_role', true), '')
  )
$$;

grant execute on function auth.uid() to authenticated;
grant execute on function auth.jwt() to authenticated;
grant execute on function auth.uid() to grandhealth;
grant execute on function auth.jwt() to grandhealth;

-- ── Shared trigger functions ──────────────────────────────────────────────
-- Used by updated_at triggers across many tables.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── Default privileges for future tables ─────────────────────────────────
alter default privileges in schema public grant all on tables to authenticated;
alter default privileges in schema public grant all on sequences to authenticated;
alter default privileges in schema public grant execute on functions to authenticated;
