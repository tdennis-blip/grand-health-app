-- =========================================================================
-- 0033_custom_pillars.sql
-- Allow clinician-created custom pillars beyond the fixed six kinds.
-- Adds a 'custom' value to the pillar_kind enum. (ADD VALUE IF NOT EXISTS is
-- idempotent; the value can't be used in the same transaction it's added.)
-- =========================================================================

alter type public.pillar_kind add value if not exists 'custom';
