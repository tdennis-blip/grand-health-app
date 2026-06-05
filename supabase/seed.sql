-- =========================================================================
-- seed.sql — synthetic data for local development. SAFE TO RUN MULTIPLE TIMES.
--
-- Run this AFTER you've created your first clinician and patient users via
-- Supabase Auth (Authentication → Users → Invite user). Replace the two
-- placeholder UUIDs below with the actual auth.users IDs.
--
-- This file does NOT create auth.users rows; Supabase Auth owns that table.
-- =========================================================================

-- Replace these two with the auth.users.id values for your seed users.
-- You can find them in Authentication → Users in the Supabase dashboard.
do $$
declare
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
  v_clinician_id uuid := 'b4782468-3011-700c-6afb-4152435fba1d';
  v_patient_id   uuid := '34f814a8-1041-70e3-0f7f-c1c63a01f49a';
  v_cv_pillar uuid;
  v_metabolic_pillar uuid;
begin
  -- Clinic
  insert into public.clinics (id, name) values
    (v_clinic_id, 'Grand Health Longevity')
  on conflict (id) do nothing;

  -- Clinician profile
  insert into public.profiles (id, clinic_id, role, email, first_name, last_name)
  values (v_clinician_id, v_clinic_id, 'clinician', 'doc@grandhealth.local', 'Priya', 'Rao')
  on conflict (id) do nothing;
  insert into public.clinician_profiles (profile_id, clinic_id, title, credentials)
  values (v_clinician_id, v_clinic_id, 'Dr.', 'MD')
  on conflict (profile_id) do nothing;

  -- Patient profile
  insert into public.profiles (id, clinic_id, role, email, first_name, last_name)
  values (v_patient_id, v_clinic_id, 'patient', 'tobin@example.com', 'Tobin', 'Dennis')
  on conflict (id) do nothing;
  insert into public.patient_profiles (
    profile_id, clinic_id, date_of_birth, sex, height_cm, weight_kg, primary_clinician_id, pillar_config
  ) values (
    v_patient_id, v_clinic_id, '1984-03-12', 'male', 183, 82, v_clinician_id,
    '{"endocrine": true, "apoe4": true}'::jsonb
  )
  on conflict (profile_id) do update set updated_at = now();

  -- Risk factor library seed
  insert into public.risk_factor_library (clinic_id, name, unit, default_goal, weight, default_status, source, note, category) values
    (v_clinic_id, 'ApoB',            'mg/dL',  '< 60',    'high',   'borderline', 'Boston Heart', 'Best single lipid marker for atherosclerotic risk.', 'Cardiovascular'),
    (v_clinic_id, 'Lp(a)',           'nmol/L', '< 75',    'high',   'off-target', 'Boston Heart', 'Genetically determined. Compensate with aggressive ApoB lowering.', 'Cardiovascular'),
    (v_clinic_id, 'Blood pressure',  'mmHg',   '< 120/80','high',   'on-target',  'In-clinic',    'Targets vary by comorbidity.', 'Cardiovascular'),
    (v_clinic_id, 'HbA1c',           '%',      '< 5.3',   'high',   'on-target',  'Boston Heart', 'Three-month glucose average.', 'Metabolic'),
    (v_clinic_id, 'hs-CRP',          'mg/L',   '< 1.0',   'medium', 'on-target',  'Boston Heart', 'Marker of systemic inflammation.', 'Cardiovascular')
  on conflict do nothing;

  -- Pillars for the patient (all six — standard set)
  insert into public.pillars (clinic_id, patient_id, kind, name, description, clinician_note, sort_order)
  values (v_clinic_id, v_patient_id, 'cv', 'Cardiovascular',
    'Risk for heart attack, stroke, and vascular disease.',
    'Lp(a) is genetically elevated; compensating with aggressive ApoB target (<60).',
    0)
  on conflict do nothing
  returning id into v_cv_pillar;

  insert into public.pillars (clinic_id, patient_id, kind, name, description, clinician_note, sort_order)
  values (v_clinic_id, v_patient_id, 'metabolic', 'Metabolic',
    'Risk for type 2 diabetes, NAFLD, and metabolic syndrome.',
    'Insulin sensitivity and body composition are excellent.',
    1)
  on conflict do nothing
  returning id into v_metabolic_pillar;

  insert into public.pillars (clinic_id, patient_id, kind, name, description, clinician_note, sort_order)
  values (v_clinic_id, v_patient_id, 'neuro', 'Neurodegenerative',
    'Risk for Alzheimer''s disease and related dementias.',
    null, 2)
  on conflict do nothing;

  insert into public.pillars (clinic_id, patient_id, kind, name, description, clinician_note, sort_order)
  values (v_clinic_id, v_patient_id, 'cancer', 'Cancer',
    'Risk for the most common cancers — lifestyle, screening, family history.',
    null, 3)
  on conflict do nothing;

  insert into public.pillars (clinic_id, patient_id, kind, name, description, clinician_note, sort_order)
  values (v_clinic_id, v_patient_id, 'physical', 'Physical',
    'VO₂ max, strength, proprioception, and bone health.',
    null, 4)
  on conflict do nothing;

  insert into public.pillars (clinic_id, patient_id, kind, name, description, clinician_note, sort_order)
  values (v_clinic_id, v_patient_id, 'endocrine', 'Endocrine',
    'Hormone balance — thyroid, sex hormones, cortisol, IGF-1.',
    null, 5)
  on conflict do nothing;

  -- A couple of factors on the CV pillar
  insert into public.pillar_factors (
    clinic_id, patient_id, pillar_id, name, current_value, unit, goal, status, weight, source, sort_order
  ) values
    (v_clinic_id, v_patient_id, v_cv_pillar, 'Blood pressure', '118/74', 'mmHg', '< 120/80', 'on-target', 'high', 'In-clinic · Apr 18', 0),
    (v_clinic_id, v_patient_id, v_cv_pillar, 'ApoB',            '74',     'mg/dL', '< 60',     'borderline', 'high', 'Boston Heart · Apr 18', 1),
    (v_clinic_id, v_patient_id, v_cv_pillar, 'Lp(a)',           '112',    'nmol/L','< 75',     'off-target', 'high', 'Boston Heart · Apr 18', 2);

  -- And one on the metabolic pillar
  insert into public.pillar_factors (
    clinic_id, patient_id, pillar_id, name, current_value, unit, goal, status, weight, source, sort_order
  ) values
    (v_clinic_id, v_patient_id, v_metabolic_pillar, 'HbA1c', '5.2', '%', '< 5.3', 'on-target', 'high', 'Boston Heart · Apr 18', 0);
end $$;
