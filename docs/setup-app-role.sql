-- =========================================================================
-- setup-app-role.sql  —  create the RLS-enforced runtime role.
--
-- WHY: the app currently connects as `grandhealth`, which OWNS the tables and
-- therefore BYPASSES row-level security (force_rls is off). So RLS is inert.
-- This creates a non-owner login role, `grandhealth_app`, that is a member of
-- `authenticated` (so it inherits table privileges AND the `to authenticated`
-- policies apply) but, being a non-owner without BYPASSRLS, is fully subject
-- to RLS. Point the app's DATABASE_URL (withAuth) at this role.
-- Keep SERVICE_ROLE_DATABASE_URL on `grandhealth` so serviceRoleSql still
-- bypasses RLS for cron / webhooks / admin writes / care-team helpers.
--
-- Run ONCE, as the owner, over the tunnel:
--   psql "$DIRECT_DATABASE_URL" -f docs/setup-app-role.sql
-- (Edit the password first, and use the SAME password in the new DATABASE_URL.)
-- =========================================================================

\set app_password 'REPLACE_WITH_A_STRONG_PASSWORD'

-- Create the role if missing, else (re)set its password. psql can't expand
-- :vars inside a DO block, so build the statement as text and \gexec it.
SELECT format('CREATE ROLE grandhealth_app LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'grandhealth_app')
\gexec

SELECT format('ALTER ROLE grandhealth_app LOGIN PASSWORD %L', :'app_password')
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'grandhealth_app')
\gexec

-- Membership: applies `to authenticated` policies + inherits table grants.
grant authenticated to grandhealth_app;

-- Schema usage.
grant usage on schema public to grandhealth_app;
grant usage on schema auth   to grandhealth_app;

-- Be explicit/idempotent about privileges on existing objects (authenticated
-- already has these via default privileges set in 0000, but make sure).
grant all on all tables    in schema public to authenticated;
grant all on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant select, insert, update, delete on auth.users to authenticated;

-- Sanity: this role must be RLS-subject (both should be false).
select rolname, rolsuper, rolbypassrls
from pg_roles where rolname = 'grandhealth_app';
