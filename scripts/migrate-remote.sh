#!/usr/bin/env bash
# Run a staging DB migration via a one-off ECS Fargate task — NO bastion tunnel.
#
#   scripts/migrate-remote.sh 0040_something.sql
#
# Applies exactly one migration file (idempotent-safe). It fires the
# `grand-health-staging-migrate` task in the web service's subnets + security
# group (so RDS already trusts it), waits for it to finish, and prints its logs.
#
# Requires: the MigrateTask to exist (one-time `cd infra && npx cdk deploy ...`).
set -euo pipefail

FILE="${1:?usage: scripts/migrate-remote.sh <migration-file.sql>}"
STACK="${STACK:-GrandHealthStack}"
CLUSTER="${CLUSTER:-grand-health-staging}"
REGION="${AWS_REGION:-us-east-1}"

echo "Reading stack outputs from $STACK ..."
get_out() {
  aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
TASKDEF=$(get_out MigrateTaskDefArn)
SG=$(get_out MigrateSecurityGroupId)
SUBNETS=$(get_out MigrateSubnets)

if [[ -z "$TASKDEF" || "$TASKDEF" == "None" ]]; then
  echo "MigrateTaskDefArn not found — has the MigrateTask been cdk-deployed?" >&2
  exit 1
fi

# CSV subnets -> JSON array element list
SUBNET_JSON=$(printf '"%s",' ${SUBNETS//,/ }); SUBNET_JSON="[${SUBNET_JSON%,}]"

echo "Launching migrate task for: $FILE"
TASK_ARN=$(aws ecs run-task \
  --cluster "$CLUSTER" --region "$REGION" \
  --task-definition "$TASKDEF" \
  --launch-type FARGATE \
  --count 1 \
  --network-configuration "awsvpcConfiguration={subnets=$SUBNET_JSON,securityGroups=[\"$SG\"],assignPublicIp=DISABLED}" \
  --overrides "{\"containerOverrides\":[{\"name\":\"migrate\",\"environment\":[{\"name\":\"MIGRATE_FILE\",\"value\":\"$FILE\"}]}]}" \
  --query "tasks[0].taskArn" --output text)

echo "Task: $TASK_ARN"
echo "Waiting for it to stop ..."
aws ecs wait tasks-stopped --cluster "$CLUSTER" --region "$REGION" --tasks "$TASK_ARN"

EXIT_CODE=$(aws ecs describe-tasks --cluster "$CLUSTER" --region "$REGION" --tasks "$TASK_ARN" \
  --query "tasks[0].containers[0].exitCode" --output text)

echo "---- migrate logs ----"
TASK_ID="${TASK_ARN##*/}"
aws logs get-log-events \
  --region "$REGION" \
  --log-group-name "/grand-health/staging/web" \
  --log-stream-name "migrate/migrate/$TASK_ID" \
  --query "events[].message" --output text 2>/dev/null || echo "(logs not available yet — check CloudWatch: /grand-health/staging/web, stream migrate/migrate/$TASK_ID)"

echo "----------------------"
echo "Container exit code: $EXIT_CODE"
[[ "$EXIT_CODE" == "0" ]] || { echo "Migration FAILED."; exit 1; }
echo "Migration OK."
