-- =========================================================================
-- 0014_wearables.sql
--
-- Wearable integrations. One row per (patient, provider) for the OAuth
-- connection; one row per (patient, provider, day) for the daily metrics
-- we fetch back. A small event-log table makes webhook retries debuggable.
--
-- Token security note: access/refresh tokens are stored in
-- wearable_connections in plaintext for now. RLS prevents patient and
-- clinician roles from reading those columns directly (they read a
-- token-stripped VIEW instead). Server-side OAuth flow uses the service-
-- role key and stays inside route handlers. Before real PHI ships, swap
-- the storage to KMS-encrypted text — see src/lib/wearables/crypto.ts.
-- =========================================================================

-- -------------------------------------------------------------------------
-- Enums
-- -------------------------------------------------------------------------
do $$ begin
  create type wearable_provider as enum ('oura', 'whoop', 'apple_health', 'eight_sleep');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type wearable_connection_status as enum ('active', 'revoked', 'error');
exception when duplicate_object then null;
end $$;

-- -------------------------------------------------------------------------
-- wearable_connections
-- -------------------------------------------------------------------------
create table if not exists public.wearable_connections (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  provider wearable_provider not null,
  provider_user_id text,                       -- vendor's user id (for webhook routing)
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  scope text,
  status wearable_connection_status default 'active' not null,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (patient_id, provider)
);

create index if not exists wearable_connections_clinic_idx
  on public.wearable_connections(clinic_id);
create index if not exists wearable_connections_provider_user_idx
  on public.wearable_connections(provider, provider_user_id);

-- -------------------------------------------------------------------------
-- wearable_daily_metrics
-- -------------------------------------------------------------------------
create table if not exists public.wearable_daily_metrics (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  provider wearable_provider not null,
  metric_date date not null,                   -- the calendar day the metrics belong to
  sleep_total_minutes integer,
  sleep_efficiency_pct numeric,                -- 0-100
  sleep_score integer,                         -- 0-100 (provider-defined)
  hrv_rmssd_ms numeric,
  resting_hr_bpm numeric,
  recovery_score integer,                      -- whoop recovery 0-100
  readiness_score integer,                     -- oura readiness 0-100
  strain_score numeric,                        -- whoop day strain 0-21
  activity_score integer,                      -- oura activity score 0-100
  raw jsonb,                                   -- full provider payload for future use
  fetched_at timestamptz default now() not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (patient_id, provider, metric_date)
);

create index if not exists wearable_metrics_patient_date_idx
  on public.wearable_daily_metrics(patient_id, metric_date desc);
create index if not exists wearable_metrics_clinic_date_idx
  on public.wearable_daily_metrics(clinic_id, metric_date desc);

-- -------------------------------------------------------------------------
-- wearable_webhook_events  (event log; insert-only from service role)
-- -------------------------------------------------------------------------
create table if not exists public.wearable_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider wearable_provider not null,
  event_type text,
  provider_user_id text,
  payload jsonb,
  signature text,
  received_at timestamptz default now() not null,
  processed_at timestamptz,
  error text
);
create index if not exists wearable_webhook_events_received_idx
  on public.wearable_webhook_events(received_at desc);

-- -------------------------------------------------------------------------
-- View: connection summary WITHOUT token columns. Patient + clinician apps
-- read this view via RLS; the underlying table is locked down so only the
-- service-role key (used by OAuth + webhook handlers) can read/write tokens.
-- -------------------------------------------------------------------------
create or replace view public.wearable_connections_public
with (security_invoker = true)
as select
  id,
  clinic_id,
  patient_id,
  provider,
  status,
  scope,
  last_synced_at,
  last_error,
  created_at,
  updated_at,
  (access_token is not null) as has_token
from public.wearable_connections;

-- -------------------------------------------------------------------------
-- RLS
-- -------------------------------------------------------------------------
alter table public.wearable_connections enable row level security;
alter table public.wearable_daily_metrics enable row level security;
alter table public.wearable_webhook_events enable row level security;

-- wearable_connections — patient and clinician CAN see their rows for the
-- view to work (security_invoker), but no INSERT/UPDATE/DELETE policies
-- means writes go through service-role only.
drop policy if exists "wearable conn read patient or clinic" on public.wearable_connections;
create policy "wearable conn read patient or clinic"
  on public.wearable_connections for select
  to authenticated
  using (
    patient_id = auth.uid()
    or (
      public.current_user_role() = 'clinician'
      and clinic_id = public.current_user_clinic()
    )
  );

-- wearable_daily_metrics — patient self / clinician clinic reads.
drop policy if exists "wearable metrics read patient or clinic" on public.wearable_daily_metrics;
create policy "wearable metrics read patient or clinic"
  on public.wearable_daily_metrics for select
  to authenticated
  using (
    patient_id = auth.uid()
    or (
      public.current_user_role() = 'clinician'
      and clinic_id = public.current_user_clinic()
    )
  );

-- No write policies for either table → all writes are service-role only,
-- which is what we want for OAuth-token-bearing flows.

-- wearable_webhook_events — service role only, no policies needed (RLS on,
-- no policies, denies everyone except service role).

-- -------------------------------------------------------------------------
-- updated_at trigger helper (reused pattern)
-- -------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists wearable_connections_updated_at on public.wearable_connections;
create trigger wearable_connections_updated_at
  before update on public.wearable_connections
  for each row execute function public.set_updated_at();

drop trigger if exists wearable_daily_metrics_updated_at on public.wearable_daily_metrics;
create trigger wearable_daily_metrics_updated_at
  before update on public.wearable_daily_metrics
  for each row execute function public.set_updated_at();
