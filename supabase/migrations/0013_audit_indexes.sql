-- =========================================================================
-- 0013_audit_indexes.sql
--
-- Indexes for the clinician audit log viewer. The base table + per-column
-- indexes already exist in 0001_initial_schema.sql (patient_id, actor_id,
-- occurred_at). We add:
--
--   · A composite clinic_id + occurred_at index so the viewer's default
--     "most recent first, scoped to my clinic" query is a single seek.
--   · Lookup indexes on action and entity_type for the filter dropdowns.
--   · GIN index on meta so the free-text search can probe the JSONB blob.
--
-- All idempotent.
-- =========================================================================

create index if not exists audit_log_clinic_occurred_idx
  on public.audit_log(clinic_id, occurred_at desc);

create index if not exists audit_log_action_idx
  on public.audit_log(action);

create index if not exists audit_log_entity_type_idx
  on public.audit_log(entity_type);

create index if not exists audit_log_meta_gin
  on public.audit_log using gin (meta jsonb_path_ops);
