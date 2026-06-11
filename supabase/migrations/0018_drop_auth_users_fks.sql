-- 0018: Drop vestigial foreign keys to auth.users.
-- The app migrated from Supabase Auth to AWS Cognito; auth.users is no longer
-- populated. profiles.id is now the Cognito `sub` (root identity), so these
-- FKs only block inserts. Idempotent.
alter table public.profiles
  drop constraint if exists profiles_id_fkey;
alter table public.sleep_journal_entries
  drop constraint if exists sleep_journal_entries_patient_id_fkey;
