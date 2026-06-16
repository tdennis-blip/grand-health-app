-- =========================================================================
-- seed_hr_zones.sql — backfills default HR zones (Z1–Z5) and a default
-- training_targets row for every clinic that doesn't already have them.
--
-- Why this exists: migration 0004 seeds zones by looping over clinics that
-- exist WHEN THE MIGRATION RUNS. In environments where migrations run before
-- seed.sql creates the clinic (e.g. fresh RDS bootstrap), the loop finds no
-- clinics and inserts nothing — leaving the clinician "Zones & targets" editor
-- empty. Run this once after seeding to fill the gap.
--
-- Safe to re-run; no-ops for clinics that already have zones/targets.
-- Run in the Supabase SQL Editor, or via psql over the bastion tunnel:
--   psql "$DIRECT_DATABASE_URL" -f supabase/snippets/seed_hr_zones.sql
-- =========================================================================

do $$
declare
  c record;
begin
  for c in select id from public.clinics loop
    insert into public.hr_zones (clinic_id, zone_key, name, short_name, low_bpm, high_bpm, sort_order) values
      (c.id, 'z1', 'Zone 1 — Recovery',   'Z1', 100, 120, 0),
      (c.id, 'z2', 'Zone 2 — Aerobic',    'Z2', 128, 142, 1),
      (c.id, 'z3', 'Zone 3 — Tempo',      'Z3', 143, 156, 2),
      (c.id, 'z4', 'Zone 4 — Threshold',  'Z4', 157, 170, 3),
      (c.id, 'z5', 'Zone 5 — VO₂ max',    'Z5', 171, 188, 4)
    on conflict (clinic_id, zone_key) do nothing;

    insert into public.training_targets (clinic_id) values (c.id)
    on conflict (clinic_id) do nothing;
  end loop;
end $$;
