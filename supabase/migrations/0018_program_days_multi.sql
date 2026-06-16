-- =========================================================================
-- 0018_program_days_multi.sql
-- Allow MULTIPLE ordered sessions per program day.
--
-- Before: program_days had primary key (program_id, day) — exactly one
-- session per day. After: each row has its own id + sort_order, so a single
-- day can hold an ordered list of sessions (e.g. AM strength, PM Zone 2).
-- A "rest day" is simply a day with no rows.
--
-- Idempotent — safe to re-run.
-- =========================================================================

-- 1. Give every row its own id.
alter table public.program_days add column if not exists id uuid default gen_random_uuid();
update public.program_days set id = gen_random_uuid() where id is null;
alter table public.program_days alter column id set not null;

-- 2. Ordering within a day.
alter table public.program_days add column if not exists sort_order integer not null default 0;

-- 3. Swap the primary key from (program_id, day) to (id).
alter table public.program_days drop constraint if exists program_days_pkey;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'program_days_pkey'
  ) then
    alter table public.program_days add constraint program_days_pkey primary key (id);
  end if;
end $$;

-- 4. Drop the legacy empty "rest day" placeholder rows (session_id is null).
--    With the new model, absence of a row means rest — null rows are noise.
delete from public.program_days where session_id is null;

-- 5. Fast lookups in day + order.
create index if not exists program_days_program_day_idx
  on public.program_days (program_id, day, sort_order);
