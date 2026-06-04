-- =========================================================================
-- add_missing_pillars.sql — backfills the four pillars (neuro, cancer,
-- physical, endocrine) for every patient that doesn't already have them.
-- Safe to re-run; no-ops for patients who already have all six.
--
-- Run this in Supabase → SQL Editor → New query → Run.
-- =========================================================================

do $$
declare
  rec record;
begin
  for rec in
    select pp.profile_id as patient_id, pp.clinic_id
    from public.patient_profiles pp
  loop
    -- Neurodegenerative
    insert into public.pillars (clinic_id, patient_id, kind, name, description, clinician_note, sort_order)
    select rec.clinic_id, rec.patient_id, 'neuro', 'Neurodegenerative',
      'Risk for Alzheimer''s disease and related dementias.',
      null, 2
    where not exists (select 1 from public.pillars where patient_id = rec.patient_id and kind = 'neuro');

    -- Cancer
    insert into public.pillars (clinic_id, patient_id, kind, name, description, clinician_note, sort_order)
    select rec.clinic_id, rec.patient_id, 'cancer', 'Cancer',
      'Risk for the most common cancers — lifestyle, screening, family history.',
      null, 3
    where not exists (select 1 from public.pillars where patient_id = rec.patient_id and kind = 'cancer');

    -- Physical
    insert into public.pillars (clinic_id, patient_id, kind, name, description, clinician_note, sort_order)
    select rec.clinic_id, rec.patient_id, 'physical', 'Physical',
      'VO₂ max, strength, proprioception, and bone health.',
      null, 4
    where not exists (select 1 from public.pillars where patient_id = rec.patient_id and kind = 'physical');

    -- Endocrine
    insert into public.pillars (clinic_id, patient_id, kind, name, description, clinician_note, sort_order)
    select rec.clinic_id, rec.patient_id, 'endocrine', 'Endocrine',
      'Hormone balance — thyroid, sex hormones, cortisol, IGF-1.',
      null, 5
    where not exists (select 1 from public.pillars where patient_id = rec.patient_id and kind = 'endocrine');
  end loop;
end $$;
