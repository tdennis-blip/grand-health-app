-- Care-team RLS validation. MUST be run as the new RLS-enforced role
-- (grandhealth_app), NOT the owner — the owner bypasses RLS so it proves
-- nothing. Build an app-role connection string over the tunnel:
--
--   export APP_DATABASE_URL="postgresql://grandhealth_app:<password>@localhost:5432/grandhealth?sslmode=require"
--   psql "$APP_DATABASE_URL" -f docs/rls-care-team-test.sql
--
-- Requires migrations through 0032 applied + setup-app-role.sql run.
-- Everything runs in a transaction and ROLLS BACK — no data is changed.
-- Replace the IDs below if your test accounts differ.

-- patient=tsdennis2, admin=tdennis, clinician=nurse(non-admin), clinic=seed
\set patient   '44884458-d071-7015-e461-0478e8e3d8ef'
\set admin     'b4782468-3011-700c-6afb-4152435fba1d'
\set clinician '445864e8-c081-70ed-77df-9bbeffedb6f8'
\set clinic    '00000000-0000-0000-0000-000000000001'

-- Confirm we're connected as the RLS-subject role (NOT grandhealth).
SELECT current_user AS connected_as;   -- expect grandhealth_app

BEGIN;

-- 1. Unassigned non-admin clinician → must NOT see the patient.
SELECT set_config('app.current_user_id', :'clinician', true),
       set_config('app.current_user_role', 'clinician', true),
       set_config('app.current_clinic_id', :'clinic', true);
SELECT 'unassigned clinician: patient_profiles' AS check, count(*) AS rows FROM patient_profiles WHERE profile_id = :'patient';  -- expect 0
SELECT 'unassigned clinician: diet_plans'        AS check, count(*) AS rows FROM diet_plans       WHERE patient_id = :'patient';  -- expect 0
SELECT 'unassigned clinician: medications'       AS check, count(*) AS rows FROM medications      WHERE patient_id = :'patient';  -- expect 0

-- 2. Admin clinician → sees everyone.
SELECT set_config('app.current_user_id', :'admin', true),
       set_config('app.current_user_role', 'clinician', true),
       set_config('app.current_clinic_id', :'clinic', true);
SELECT 'admin: patient_profiles' AS check, count(*) AS rows FROM patient_profiles WHERE profile_id = :'patient';  -- expect 1
SELECT 'admin: all patients'     AS check, count(*) AS rows FROM patient_profiles;                                -- expect all

-- 3. Patient → sees only their own (smoke test for self-access policies).
SELECT set_config('app.current_user_id', :'patient', true),
       set_config('app.current_user_role', 'patient', true),
       set_config('app.current_clinic_id', :'clinic', true);
SELECT 'patient: own diet_plans'      AS check, count(*) AS rows FROM diet_plans WHERE patient_id = :'patient';  -- expect 1
SELECT 'patient: own patient_profile' AS check, count(*) AS rows FROM patient_profiles WHERE profile_id = :'patient'; -- expect 1
SELECT 'patient: other patients'      AS check, count(*) AS rows FROM patient_profiles;  -- expect 1 (only self)
-- Patient self-write smoke test (insert + delete own food log).
INSERT INTO food_logs (patient_id, clinic_id, log_date, source)
VALUES (:'patient', :'clinic', '2099-01-01', 'in-app')
ON CONFLICT DO NOTHING;
SELECT 'patient: could self-insert food_log' AS check, count(*) AS rows FROM food_logs WHERE patient_id = :'patient' AND log_date = '2099-01-01'; -- expect 1

-- 4. Assign the clinician, then they SHOULD see the patient.
--    (care_team write is allowed for a clinician in-clinic.)
SELECT set_config('app.current_user_id', :'admin', true),
       set_config('app.current_user_role', 'clinician', true),
       set_config('app.current_clinic_id', :'clinic', true);
INSERT INTO patient_care_team (clinic_id, patient_id, clinician_id, added_by)
VALUES (:'clinic', :'patient', :'clinician', :'admin')
ON CONFLICT DO NOTHING;

SELECT set_config('app.current_user_id', :'clinician', true),
       set_config('app.current_user_role', 'clinician', true),
       set_config('app.current_clinic_id', :'clinic', true);
SELECT 'assigned clinician: diet_plans' AS check, count(*) AS rows FROM diet_plans WHERE patient_id = :'patient';  -- expect 1

ROLLBACK;
