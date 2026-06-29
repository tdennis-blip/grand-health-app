-- =========================================================================
-- 0027_fix_medication_delete_log.sql
-- Fix log_medication_change() so deleting a medication doesn't fail.
--
-- The trigger fires AFTER DELETE and inserts an audit row. It was setting
-- medication_change_log.medication_id = OLD.id, but by then the medication
-- row is already gone, so the insert violated medication_change_log_
-- medication_id_fkey (and blocked patient deletion, which cascade-deletes
-- medications). On delete we now log medication_id = NULL — the full prior
-- state is still captured in the `before` JSON, so no audit detail is lost.
--
-- Idempotent (create or replace).
-- =========================================================================

create or replace function public.log_medication_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_role text;
  v_change text;
  v_fields text[];
  v_before jsonb;
  v_after jsonb;
  v_patient uuid;
  v_clinic uuid;
  v_med uuid;
begin
  v_actor := auth.uid();

  if v_actor is not null then
    select role into v_role from public.profiles where id = v_actor;
  end if;

  if TG_OP = 'INSERT' then
    v_change := 'create';
    v_after := to_jsonb(NEW);
    v_patient := NEW.patient_id;
    v_clinic := NEW.clinic_id;
    v_med := NEW.id;
  elsif TG_OP = 'UPDATE' then
    v_change := 'update';
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
    v_patient := NEW.patient_id;
    v_clinic := NEW.clinic_id;
    v_med := NEW.id;

    -- Compute the column-name list that actually changed.
    select coalesce(array_agg(key order by key), '{}'::text[])
      into v_fields
    from (
      select key
      from jsonb_each(v_before) as kv(key, val)
      where v_after -> key is distinct from v_before -> key
    ) c;

    -- Skip no-op rewrites (only updated_at changed).
    if v_fields = array['updated_at']::text[] then
      return NEW;
    end if;

    -- Detect a refill bump for nicer history entries.
    if NEW.quantity_on_hand is not null
       and OLD.quantity_on_hand is distinct from NEW.quantity_on_hand
       and coalesce(NEW.quantity_on_hand, 0) > coalesce(OLD.quantity_on_hand, 0) then
      v_change := 'refill';
    end if;
  else
    v_change := 'delete';
    v_before := to_jsonb(OLD);
    v_patient := OLD.patient_id;
    v_clinic := OLD.clinic_id;
    -- The medication row is already gone in an AFTER DELETE trigger, so we
    -- cannot reference it. Its id lives in `before`; keep the FK column null.
    v_med := null;
  end if;

  insert into public.medication_change_log
    (clinic_id, patient_id, medication_id, change_type, changed_fields,
     before, after, actor_id, actor_role)
  values
    (v_clinic, v_patient, v_med, v_change, v_fields,
     v_before, v_after, v_actor, v_role);

  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;
