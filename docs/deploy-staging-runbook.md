# Staging deploy runbook — ECS Fargate + GitHub Actions + HTTPS

Target: app live at **https://staging.mygrandhealth.com** (HIPAA-eligible ECS Fargate, in-VPC, reaching private RDS).

All `cdk` / `aws` / `git` commands run **on your Mac** (where `aws configure` is set for account `669960694177`, region `us-east-1`). Run them from the repo root unless noted.

Prereqs: `aws sts get-caller-identity` returns the right account; `npm i -g aws-cdk`; the `mygrandhealth.com` hosted zone exists in Route 53 in this account.

---

## 1. Commit the new infra + workflow

```bash
git add .github/workflows/deploy.yml infra/lib/app-runtime.ts infra/lib/grand-health-stack.ts docs/deploy-staging-runbook.md NOTES.md
git commit -m "Add ECS deploy workflow + custom domain/TLS for staging"
# don't push yet — Phase 1 first so the build has the right inputs
```

## 2. Phase 1 deploy — ECR repo + GitHub deploy role + app-env secret

```bash
cd infra && npm install
npx cdk deploy -c stage=staging
cd ..
```

Record these outputs:
- `GrandHealthStack.AppRuntimeGithubDeployRoleArn`  → GitHub secret in step 3
- `GrandHealthStack.AppRuntimeEcrRepositoryUri`
- `GrandHealthStack.AppRuntimeAppEnvSecretArn`

Gotchas:
- `OIDC provider already exists` → the account already has the GitHub OIDC provider. In `infra/lib/app-runtime.ts` swap `new iam.OpenIdConnectProvider(...)` for `iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(this, "GithubOidc", "<existing-arn>")`, then re-run.
- `Cannot find module 'ts-node'` → `npm i -D ts-node` in `infra/`, re-run.

## 3. Configure GitHub (Settings → Secrets and variables → Actions)

- Secret: `AWS_DEPLOY_ROLE_ARN` = the `AppRuntimeGithubDeployRoleArn` from step 2.
- Variable: `NEXT_PUBLIC_SITE_URL` = `https://staging.mygrandhealth.com`
  (build-time inlined into the client bundle — must be set **before** the build in step 4.)

## 4. Push → first image build

```bash
git push
```

The `Deploy to ECS (staging)` workflow runs: builds the image, pushes `:<sha>` + `:latest` to ECR. The ECS service doesn't exist yet, so it logs a notice and skips the service update (expected). Confirm the run is green and the image is in ECR.

## 5. Phase 2 deploy — service + ALB + HTTPS + DNS

```bash
cd infra
npx cdk deploy -c stage=staging -c withService=true \
  -c domain=staging.mygrandhealth.com -c hostedZone=mygrandhealth.com
cd ..
```

This creates the cluster, Fargate service, ALB, an ACM cert (auto-validated via DNS because the zone is in this account — can take a few minutes), the HTTPS listener with HTTP→HTTPS redirect, and the `staging.mygrandhealth.com` alias record. Output `AppRuntimeAlbUrl` = `https://staging.mygrandhealth.com`.

## 6. Fill runtime secrets, then roll the service

The `grand-health/staging/app-env` secret still has `REPLACE_ME` values. Put in the real values from `.env.local`:

```bash
aws secretsmanager put-secret-value \
  --secret-id grand-health/staging/app-env \
  --secret-string '{
    "DATABASE_URL":"...",
    "SERVICE_ROLE_DATABASE_URL":"...",
    "USDA_API_KEY":"...",
    "ANTHROPIC_API_KEY":"...",
    "CLOUDINARY_CLOUD_NAME":"...",
    "CLOUDINARY_API_KEY":"...",
    "CLOUDINARY_API_SECRET":"..."
  }'

# tasks read secrets at start — force a fresh deployment to pick them up
aws ecs update-service --cluster grand-health-staging \
  --service grand-health-staging-web --force-new-deployment
```

(`DATABASE_URL` must point at the private RDS endpoint — the Fargate tasks reach it in-VPC.)

## 7. Verify

```bash
curl -I https://staging.mygrandhealth.com/login        # expect 200
curl -I http://staging.mygrandhealth.com/login         # expect 301 -> https
```

Then create test users with `scripts/create-test-user.sh` and run `docs/staging-smoke-test.md`.

Note: the Cognito app client already lists `https://staging.mygrandhealth.com/auth/callback` and `/login` (set in `grand-health-stack.ts`), so the login redirect works once DNS resolves.

---

## Rollback / teardown

- Roll back a bad image: re-run the workflow on a known-good commit, or `aws ecs update-service --force-new-deployment` after re-tagging. The service has a deployment circuit breaker with auto-rollback enabled.
- Tear down staging service only: `npx cdk deploy -c stage=staging` (without `withService`) removes the service/ALB but keeps ECR + role + secret. Full teardown: `npx cdk destroy -c stage=staging` (staging RDS has `deletionProtection: false`).
