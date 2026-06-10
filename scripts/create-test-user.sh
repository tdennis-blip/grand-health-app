#!/usr/bin/env bash
#
# Create an internal test user in Cognito + emit the matching profiles row.
#
# Why a script: admin-create-user makes Cognito generate the user's `sub`
# (a UUID). Our DB requires profiles.id == that sub, so we must create the
# user first, read the sub back, THEN insert the profile row.
#
# Usage:
#   ./scripts/create-test-user.sh <email> <patient|clinician> "<First>" "<Last>" "<Password>"
#
# Example:
#   ./scripts/create-test-user.sh nurse@grandhealth.local clinician "Dana" "Lopez" "TestPass123!"
#
# Requirements: AWS CLI configured (`aws configure`) with admin rights on the
# user pool, and psql access to the RDS DB (uses $DIRECT_DATABASE_URL).

set -euo pipefail

# --- Config (staging) -------------------------------------------------------
USER_POOL_ID="us-east-1_Yk5gVyw4D"
AWS_REGION="us-east-1"
CLINIC_ID="00000000-0000-0000-0000-000000000001"   # 'Grand Health Longevity' seed clinic
# ---------------------------------------------------------------------------

EMAIL="${1:?email required}"
ROLE="${2:?role required (patient|clinician)}"
FIRST="${3:?first name required}"
LAST="${4:?last name required}"
PASSWORD="${5:?password required}"

if [[ "$ROLE" != "patient" && "$ROLE" != "clinician" ]]; then
  echo "role must be 'patient' or 'clinician'" >&2; exit 1
fi

echo "Creating Cognito user $EMAIL ($ROLE)…"
aws cognito-idp admin-create-user \
  --region "$AWS_REGION" \
  --user-pool-id "$USER_POOL_ID" \
  --username "$EMAIL" \
  --message-action SUPPRESS \
  --user-attributes \
      Name=email,Value="$EMAIL" \
      Name=email_verified,Value=true \
      Name=custom:role,Value="$ROLE" \
      Name=custom:clinic_id,Value="$CLINIC_ID" \
  >/dev/null

# Set a permanent password so the user skips the FORCE_CHANGE_PASSWORD step
# (fine for internal testing; use temporary passwords for real users).
aws cognito-idp admin-set-user-password \
  --region "$AWS_REGION" \
  --user-pool-id "$USER_POOL_ID" \
  --username "$EMAIL" \
  --password "$PASSWORD" \
  --permanent

# Read back the generated sub — this is what must land in profiles.id.
SUB=$(aws cognito-idp admin-get-user \
  --region "$AWS_REGION" \
  --user-pool-id "$USER_POOL_ID" \
  --username "$EMAIL" \
  --query "UserAttributes[?Name=='sub'].Value | [0]" \
  --output text)

echo "Cognito sub: $SUB"

# --- Insert the profile row (and role-specific extension) -------------------
# Requires $DIRECT_DATABASE_URL in the environment (the non-pooled RDS URL).
read -r -d '' SQL <<SQL || true
INSERT INTO public.profiles (id, clinic_id, role, email, first_name, last_name)
VALUES ('$SUB', '$CLINIC_ID', '$ROLE', '$EMAIL', '$FIRST', '$LAST')
ON CONFLICT (id) DO NOTHING;

DO \$\$
BEGIN
  IF '$ROLE' = 'clinician' THEN
    INSERT INTO public.clinician_profiles (profile_id, clinic_id, title, credentials)
    VALUES ('$SUB', '$CLINIC_ID', '', '')
    ON CONFLICT (profile_id) DO NOTHING;
  ELSE
    INSERT INTO public.patient_profiles (profile_id, clinic_id)
    VALUES ('$SUB', '$CLINIC_ID')
    ON CONFLICT (profile_id) DO NOTHING;
  END IF;
END \$\$;
SQL

if [[ -n "${DIRECT_DATABASE_URL:-}" ]]; then
  echo "Inserting profile row into RDS…"
  psql "$DIRECT_DATABASE_URL" -v ON_ERROR_STOP=1 <<<"$SQL"
  echo "Done. $EMAIL can now sign in at the staging URL."
else
  echo
  echo "DIRECT_DATABASE_URL not set — run this SQL manually against RDS:"
  echo "-----------------------------------------------------------------"
  echo "$SQL"
fi
