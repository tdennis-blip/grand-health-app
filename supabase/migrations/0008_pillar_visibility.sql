-- =========================================================================
-- 0008_pillar_visibility.sql
--
-- Adds a per-pillar hidden flag so a clinician can turn off an entire
-- pillar for a specific patient (e.g. Endocrine for someone where it's
-- not clinically relevant). Default is false — every pillar is visible
-- unless explicitly hidden.
--
-- The pillar row itself stays in the database; the patient's pillar list
-- and detail pages will just filter where hidden = false.
-- =========================================================================

alter table public.pillars
  add column if not exists hidden boolean default false not null;

create index if not exists pillars_hidden_idx on public.pillars(hidden);
