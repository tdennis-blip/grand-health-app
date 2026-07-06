-- =========================================================================
-- 0034_audit_log_immutable.sql
-- Make the audit log append-only at the DATABASE layer.
--
-- WHY: RLS already blocks UPDATE/DELETE for the app role (no policy = deny),
-- but the owner role (serviceRoleSql) bypasses RLS entirely, so a compromised
-- service credential — or a stray admin query — could silently rewrite
-- history. HIPAA audit controls expect tamper-resistant logs. A trigger fires
-- for ALL roles regardless of RLS, closing that gap. (A superuser could still
-- drop the trigger, but that action is itself visible in pg logs; consider a
-- periodic export to S3 Object Lock for true WORM retention.)
--
-- Nothing in the app updates or deletes audit_log rows today (verified by
-- grep), so this changes no behavior.
--
-- Idempotent.
-- =========================================================================

create or replace function public.audit_log_block_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log is append-only: % is not allowed', TG_OP
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists audit_log_immutable on public.audit_log;
create trigger audit_log_immutable
  before update or delete on public.audit_log
  for each row execute function public.audit_log_block_mutation();

-- Belt and braces: also revoke the privileges from the app-facing role so
-- attempts fail at the ACL layer before the trigger even fires.
revoke update, delete on public.audit_log from authenticated;
