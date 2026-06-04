-- =========================================================================
-- seed_interactions.sql — populates a small starter set of pairwise
-- medication-interaction rules into EVERY clinic in the project. Safe to
-- re-run: it no-ops on rules that already exist (matched by clinic +
-- pattern A + pattern B + severity).
--
-- Patterns are case-insensitive substrings against medications.name. Keep
-- them short and generic ("warfarin" matches "Warfarin 5 mg").
--
-- Run this in Supabase → SQL Editor → New query → Run.
-- =========================================================================

do $$
declare
  c record;
  r record;
  starter constant text[][] := array[
    -- pattern_a, pattern_b, severity, message, source
    array['warfarin',      'aspirin',            'severe',
          'Combined use significantly increases bleeding risk.',
          'UpToDate'],
    array['warfarin',      'ibuprofen',          'severe',
          'NSAIDs increase bleeding risk and may potentiate warfarin.',
          'UpToDate'],
    array['rosuvastatin',  'gemfibrozil',        'severe',
          'Markedly elevated rhabdomyolysis risk; avoid combination.',
          'FDA label'],
    array['simvastatin',   'amiodarone',         'severe',
          'Limit simvastatin to 20 mg daily with amiodarone.',
          'FDA label'],
    array['metformin',     'iodinated contrast', 'warn',
          'Hold metformin around contrast administration to reduce lactic acidosis risk.',
          'ACR'],
    array['levothyroxine', 'calcium',            'warn',
          'Separate by at least 4 hours — calcium reduces levothyroxine absorption.',
          'AACE'],
    array['levothyroxine', 'iron',               'warn',
          'Separate by at least 4 hours — iron reduces levothyroxine absorption.',
          'AACE'],
    array['levothyroxine', 'magnesium',          'warn',
          'Separate by at least 4 hours — magnesium reduces levothyroxine absorption.',
          'AACE'],
    array['rapamycin',     'grapefruit',         'warn',
          'Grapefruit increases sirolimus levels via CYP3A4 inhibition.',
          'UpToDate'],
    array['sildenafil',    'nitroglycerin',      'severe',
          'Coadministration can cause severe hypotension. Contraindicated.',
          'FDA label'],
    array['clopidogrel',   'omeprazole',         'warn',
          'Omeprazole reduces clopidogrel activation via CYP2C19 inhibition; consider pantoprazole.',
          'FDA label'],
    array['ssri',          'tramadol',           'warn',
          'Increased serotonin syndrome and seizure risk.',
          'UpToDate'],
    array['lithium',       'ibuprofen',          'warn',
          'NSAIDs increase lithium levels; monitor closely.',
          'UpToDate'],
    array['statin',        'erythromycin',       'warn',
          'Macrolide inhibits CYP3A4 and increases statin myopathy risk.',
          'UpToDate'],
    array['allopurinol',   'azathioprine',       'severe',
          'Allopurinol inhibits xanthine oxidase, dramatically raising azathioprine toxicity.',
          'UpToDate']
  ];
begin
  for c in select id as clinic_id from public.clinics loop
    foreach r slice 1 in array starter loop
      insert into public.medication_interactions
        (clinic_id, name_pattern_a, name_pattern_b, severity, message, source, active)
      select c.clinic_id, r[1], r[2], r[3], r[4], r[5], true
      where not exists (
        select 1 from public.medication_interactions mi
        where mi.clinic_id = c.clinic_id
          and lower(mi.name_pattern_a) = lower(r[1])
          and lower(mi.name_pattern_b) = lower(r[2])
          and mi.severity = r[3]
      );
    end loop;
  end loop;
end $$;
