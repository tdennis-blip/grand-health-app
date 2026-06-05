# Grand Health — Engineering Notes

Living orientation doc for the production app. **Read this first** when picking up the project in a new conversation. The codebase itself is the source of truth; this file is the map.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router, TypeScript) |
| Hosting | AWS Amplify Hosting |
| Auth | AWS Cognito (via `aws-amplify` v6) |
| Database | AWS RDS Postgres 16 |
| Realtime (chat) | Server-Sent Events (`/api/messages/stream`) |
| ORM | Drizzle + postgres-js (raw SQL via `withAuth`) |
| Styling | Tailwind CSS |
| Forms validation | Zod |
| Infrastructure | AWS CDK v2 (`infra/` directory) |

**Supabase has been fully removed.** `@supabase/ssr` and `@supabase/supabase-js` are not
in `package.json` and have no live imports. The compatibility shim (`src/lib/supabase/server.ts`,
`src/lib/db/query-builder.ts`) and dead browser client (`src/lib/supabase/client.ts`) are
tombstone stubs — do not import from them. All queries now use `withAuth` + `serviceRoleSql`
from `@/lib/db/connection` directly.

**HIPAA coverage:** All data lives in AWS services covered by the AWS BAA. No
third-party HIPAA add-on fees.

PHI scoping is enforced by Postgres Row Level Security. Every table that
holds patient data carries `clinic_id` (and where applicable `patient_id`)
so policies can filter on a single column.

There is also a separate single-file prototype at
`../grandhealth-prototype.jsx` that we are migrating *from*. It still
contains features that haven't been ported yet — when stuck on visual or
behavioural intent, look there.

---

## Project layout

```
grand-health-app/
├── src/
│   ├── app/
│   │   ├── login/                       # magic-link + password sign-in
│   │   ├── auth/
│   │   │   ├── actions.ts               # signOut
│   │   │   └── callback/route.ts        # magic-link callback
│   │   ├── home/                        # PATIENT portal
│   │   │   ├── layout.tsx               # role gate + top band + bottom tab bar
│   │   │   ├── bottom-tab-bar.tsx       # 5-tab nav (Today / Pillars / Grand 100 / Chat / Me)
│   │   │   ├── page.tsx                 # Today: training card + diet card
│   │   │   ├── pillars/
│   │   │   │   ├── page.tsx             # list of patient's pillars
│   │   │   │   └── [id]/                # pillar detail (Recommendations / Risks / About tabs)
│   │   │   ├── training/                # week schedule + per-day session detail
│   │   │   ├── diet/                    # daily targets + food logger + micros + recent strip
│   │   │   │   ├── page.tsx
│   │   │   │   ├── food-logger.tsx      # search USDA + per-meal entries + quick-add strip + scan
│   │   │   │   ├── barcode-scanner.tsx  # Capacitor MLKit native / Web BarcodeDetector / manual entry
│   │   │   │   ├── custom-food-form.tsx # bottom-sheet to create a custom food
│   │   │   │   ├── entry-actions.ts     # add/remove/update + quick-add by foodId
│   │   │   │   ├── favorite-actions.ts  # toggle / update favorite defaults
│   │   │   │   ├── custom-food-actions.ts # create custom foods (clinic-scoped)
│   │   │   │   └── actions.ts           # legacy macros-only log (still works as fallback)
│   │   │   ├── stack/                   # patient meds & supplements
│   │   │   │   ├── page.tsx             # today's doses (grouped by time) + adherence strip + full stack + interaction banner + low-supply badges
│   │   │   │   ├── stack-client.tsx     # tap-to-toggle dose check-offs (optimistic)
│   │   │   │   ├── dose-actions.ts      # mark/unmark a dose taken
│   │   │   │   ├── refill-request-actions.ts # patient "request refill" — posts a message to primary clinician
│   │   │   │   └── refill-request-button.tsx # client button surfaced on low/out items
│   │   │   ├── grand100/page.tsx        # hero + VO2 trajectory chart + activity cards
│   │   │   ├── chat/                    # patient ↔ clinic messaging (Supabase Realtime)
│   │   │   │   ├── page.tsx
│   │   │   │   ├── chat-client.tsx
│   │   │   │   └── actions.ts
│   │   │   └── profile/                 # Me: avatar, demographics editor (cm/ft toggle), clinician, sign-out
│   │   │       ├── page.tsx
│   │   │       ├── profile-editor.tsx
│   │   │       ├── actions.ts
│   │   │       └── integrations/        # connect/disconnect Oura, Whoop (+ Apple Health / 8 Sleep coming soon)
│   │   │           ├── page.tsx
│   │   │           ├── disconnect-button.tsx
│   │   │           └── actions.ts
│   │   ├── clinician/                   # CLINICIAN portal
│   │   │   ├── layout.tsx               # role gate + top nav (Patients / Risk library / Training / Grand 100)
│   │   │   ├── dashboard/page.tsx       # patient roster
│   │   │   ├── patient/[id]/
│   │   │   │   ├── page.tsx             # patient detail — Wearable trends, Diet plan, Adherence, Grand 100 baseline,
│   │   │   │   │                        #   Training assignments, Pillars list with visibility toggles
│   │   │   │   ├── wearable-trend-card.tsx # 30-day sleep / HRV / recovery sparklines
│   │   │   │   ├── pillar/[pillarId]/   # full pillar editor (4 tabs)
│   │   │   │   ├── diet/                # diet plan card + adherence panel
│   │   │   │   ├── stack/               # meds & supplements editor (CRUD + dose schedules + pillar link + refill + interactions)
│   │   │   │   │   ├── page.tsx             # editor + interaction banner + adherence/history nav
│   │   │   │   │   ├── stack-editor.tsx     # rows include refill panel + interaction badges + per-med history link
│   │   │   │   │   ├── stack-summary-card.tsx # surfaces low-supply + interaction counts
│   │   │   │   │   ├── actions.ts           # upsert med/dose (incl. refill fields)
│   │   │   │   │   ├── refill-actions.ts    # recordRefill (add/set qty + last_refill_on)
│   │   │   │   │   ├── adherence/page.tsx   # per-med adherence report (7/14/30/90d + heatmap + CSV export)
│   │   │   │   │   └── history/
│   │   │   │   │       ├── page.tsx                  # patient-wide change timeline
│   │   │   │   │       └── [medicationId]/page.tsx   # single-medication timeline
│   │   │   │   ├── grand100/            # baseline editor + actions
│   │   │   │   └── pillar/              # visibility toggle component + actions
│   │   │   ├── refills/page.tsx         # clinic-wide refill queue (low/out items grouped by patient)
│   │   │   └── library/
│   │   │       ├── risks/page.tsx       # risk factor library + sets management
│   │   │       ├── training/            # training library landing → exercises / sessions / programs / zones
│   │   │       ├── grand100/            # Grand 100 activity library (CRUD + hide + reorder)
│   │   │       └── interactions/        # clinic-scoped drug-interaction rules (name patterns + severity + message)
│   │   │   ├── audit/page.tsx           # audit log viewer (filters + pagination + row drilldown)
│   │   │   ├── messages/                # clinician inbox + per-patient thread
│   │   │       ├── page.tsx
│   │   │       ├── actions.ts
│   │   │       └── [patientId]/         # thread view (realtime)
│   │   └── api/
│   │       ├── foods/search/route.ts    # USDA proxy (server-only)
│   │       ├── foods/barcode/route.ts   # barcode → local cache → USDA gtinUpc lookup
│   │       └── wearables/
│   │           ├── [provider]/start/    # OAuth start — state cookie + authorize redirect
│   │           ├── [provider]/callback/ # OAuth exchange + 14-day backfill
│   │           ├── oura/webhook/        # Oura push receiver (HMAC-SHA256 hex)
│   │           ├── whoop/webhook/       # Whoop push receiver (HMAC-SHA256 base64)
│   │           ├── sync/                # daily cron backfill (X-Cron-Token gated)
│   │           └── ../medications/
│   │               ├── refill-check/    # daily cron — writes audit_log alerts for low/out meds (MEDICATIONS_CRON_TOKEN gated)
│   │               └── adherence.csv/   # session-auth CSV export of the adherence report
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts                # browser client
│   │   │   ├── server.ts                # server-component / route-handler client
│   │   │   └── middleware.ts            # session refresh + role-based redirects
│   │   ├── db/
│   │   │   ├── index.ts                 # Drizzle client (postgres-js)
│   │   │   └── schema.ts                # full Drizzle schema
│   │   ├── audit.ts                     # recordAudit() — call from every mutation
│   │   ├── training.ts                  # patient-side training helpers (active assignment, week, session detail)
│   │   ├── diet.ts                      # diet targets + entry totals + micronutrient refs
│   │   ├── medications.ts               # stack reads (getStack, getDosesForDate, getAdherenceStrip, getMedicationsForPillar) — re-exports utils
│   │   ├── medications-utils.ts         # client-safe types + pure helpers (formatTime12, formatDaysOfWeek, refillStatus, dailyConsumption, isoDate)
│   │   ├── medications-interactions.ts  # rule fetcher + JS-side pairwise checker (case-insensitive substring on med.name)
│   │   ├── medications-adherence.ts     # per-med adherence over 7/14/30/90d, longest miss streak, day-by-day heatmap rows
│   │   ├── medications-history.ts       # reads medication_change_log + diff helpers (visibleChangedFields, fieldLabel)
│   │   ├── medications-refills.ts       # cross-patient refill rollup (RLS getClinicRefillBoard + service-role getAllRefillFindings)
│   │   ├── grand100.ts                  # decline math + baseline fetch
│   │   ├── messages.ts                  # thread fetchers, inbox aggregator, unread counts
│   │   ├── usda.ts                      # USDA FoodData Central client
│   │   └── wearables/
│   │       ├── types.ts                 # ProviderClient interface + DailyMetric shape
│   │       ├── oura.ts                  # Oura v2 OAuth + sleep / readiness / activity fetchers
│   │       ├── whoop.ts                 # Whoop v1 OAuth + cycle / recovery / sleep fetchers
│   │       ├── registry.ts              # provider metadata + getClient()
│   │       ├── admin-client.ts          # service-role supabase client (server-only)
│   │       ├── sync.ts                  # token refresh + upsertConnection + syncConnectionRange
│   │       └── queries.ts               # RLS-scoped reads for the UI cards
│   └── middleware.ts                    # runs updateSession on every request
│
├── supabase/
│   ├── migrations/                      # SQL — source of truth for schema
│   │   ├── 0001_initial_schema.sql      # clinics, profiles, patients, clinicians, pillars, risk library, audit
│   │   ├── 0002_rls_policies.sql        # all initial RLS
│   │   ├── 0003_add_drivers_and_recs.sql # lifestyle_drivers + pillar_recommendations
│   │   ├── 0004_training_library.sql    # exercises, sessions, programs, days, zones, targets, assignments
│   │   ├── 0005_patient_training_reads.sql # RLS for patient reads on training library (scoped via assignments)
│   │   ├── 0006_diet.sql                # diet_plans
│   │   ├── 0007_food_logs.sql           # food_logs
│   │   ├── 0008_pillar_visibility.sql   # pillars.hidden column
│   │   ├── 0009_foods_and_entries.sql   # foods (USDA cache + custom) + food_log_entries + recompute trigger
│   │   ├── 0010_grand100.sql            # grand100_activities + grand100_baselines + 6-activity seed
│   │   ├── 0011_patient_self_update.sql # patient-self RLS on patient_profiles + protected-column trigger
│   │   ├── 0012_messaging.sql           # messages table, RLS, realtime publication, patient→clinician profile reads
│   │   ├── 0013_audit_indexes.sql       # extra indexes for audit log viewer (clinic+time, action, entity_type, meta GIN)
│   │   ├── 0014_wearables.sql           # wearable_connections + wearable_daily_metrics + wearable_webhook_events; token-stripped public view; service-role-only writes
│   │   ├── 0015_food_favorites_and_barcode.sql # foods.barcode + food_favorites (per-patient) + RLS
│   │   ├── 0016_medications.sql         # medications + medication_doses + medication_dose_logs (clinician-managed; per-dose-per-day check-offs)
│   │   └── 0017_stack_extensions.sql    # medication_interactions library + medications.quantity_* refill cols + medication_change_log table & trigger
│   ├── seed.sql                         # synthetic clinic + clinician + patient + risk factors + 6 pillars
│   └── snippets/
│       ├── add_missing_pillars.sql      # idempotent backfill for the 4 secondary pillars
│       └── seed_interactions.sql        # idempotent starter rules for medication_interactions (per clinic)
│
├── amplify.yml                          # AWS Amplify build spec
├── drizzle.config.ts
├── package.json
├── .env.example                         # template — copy to .env.local and fill in
└── README.md                            # setup walkthrough (run migrations, seed users, npm install)
```

---

## Schema overview

Patient-bearing tables that hold PHI all carry `clinic_id` and (where applicable) `patient_id`.

**Identity + chrome**
- `clinics`
- `profiles` (1:1 with `auth.users`)
- `patient_profiles` (extends profile)
- `clinician_profiles` (extends profile)

**Pillars**
- `pillars` (per patient, has `hidden` flag)
- `pillar_factors` (risks with current/goal/status/weight/source/note, hidden flag, sort_order)
- `factor_observations` (time-series of factor values; built but no UI yet)
- `lifestyle_drivers`
- `pillar_recommendations`
- `risk_factor_library` + `risk_factor_sets` + `risk_factor_set_items` (clinic-wide)

**Training**
- `exercise_library` (kind: strength|mobility, video metadata)
- `session_library` (kind: strength|zone2|vo2max|mobility; cardio fields nullable per kind)
- `session_exercises` + `session_sets` (strength + mobility sessions)
- `program_library` + `program_days` (Mon-Sun grid)
- `program_assignments` (per patient)
- `hr_zones` (Z1-Z5 per clinic) + `training_targets` (one row per clinic)

**Diet**
- `diet_plans` (1 per patient: RMR, multiplier, deficit, macros, fiber, water, notes)
- `food_logs` (1 per patient per day; daily totals)
- `food_log_entries` (per-meal entries referencing foods)
- `foods` (USDA-cached + clinic custom; per-100g nutrient values incl. micros; `barcode` column for GTIN/UPC re-resolution)
- `food_favorites` (per-patient saved foods with optional remembered default quantity + meal)
- Trigger `recompute_food_log_totals()` keeps `food_logs` totals in sync with entries.

**Stack (meds & supplements)**
- `medications` — clinician-managed list per patient. Kind = 'medication' | 'supplement'. Optional `pillar_id` for "this addresses ApoB" type links. Refill columns added in 0017: `quantity_on_hand`, `quantity_per_dose`, `refill_threshold_days`, `last_refill_on`.
- `medication_doses` — schedule rows. One med may have many. `time_local` (no tz, patient's clock), `days_of_week` smallint[] mask (0=Sun..6=Sat) for daily / weekly / weekends-only / weekly-Sunday-rapamycin.
- `medication_dose_logs` — per-(dose, scheduled_for) check-off. UNIQUE(dose_id, scheduled_for) so toggling is insert/delete. Patient or clinician can record; `recorded_role` tracks which.
- `medication_interactions` — clinic-scoped library of pairwise rules. Two name patterns (case-insensitive substring) + severity (info/warn/severe) + message. Active flag for soft-disable.
- `medication_change_log` — per-medication history timeline. Trigger-populated on insert/update/delete of `medications`; runs SECURITY DEFINER so writes succeed despite RLS. Captures `change_type` (create/update/delete/refill — refill is detected by an upward bump of `quantity_on_hand`), `changed_fields` text[], plus full `before` + `after` jsonb snapshots. Read policy mirrors the main stack (patient self or clinic clinician); no write policies — only the trigger inserts.
- RLS: clinician-only writes on `medications` + `medication_doses` + `medication_interactions`. Patient writes own `medication_dose_logs`; clinician can also log on patient's behalf. `medication_change_log` is read-only from the app.

**Grand 100**
- `grand100_activities` (clinic-wide library of "what to do at 100" with required VO2/strength/mobility)
- `grand100_baselines` (per patient: VO2 now, grip, etc.)

**Messaging**
- `messages` (one implicit thread per `patient_id`; each row has `sender_id`, `sender_role`, `recipient_id`, `body`, `recipient_read_at`).
- Realtime publication `supabase_realtime` is set on this table so the chat UIs append new rows live.
- Patient → clinician messages address a specific clinician; clinician → patient messages set `recipient_id = patient_id`. All clinicians in the clinic see every thread but unread state is per-recipient.

**Wearables**
- `wearable_connections` — one row per (patient, provider). Holds access/refresh tokens + provider_user_id. NO INSERT/UPDATE/DELETE RLS policies → all writes go through the service-role key from server route handlers.
- `wearable_connections_public` — VIEW exposing everything except the token columns. Patient + clinician apps read this; the underlying table's SELECT policy still scopes by patient_id / clinic.
- `wearable_daily_metrics` — one row per (patient, provider, day). Normalized fields: sleep_total_minutes, sleep_efficiency_pct, hrv_rmssd_ms, recovery_score, readiness_score, etc. Full payload in `raw` jsonb.
- `wearable_webhook_events` — insert-only log for replay/debug. Service-role-only.
- Providers: `oura` and `whoop` are wired natively. `apple_health` requires the Capacitor iOS shell (deferred). `eight_sleep` has no public OAuth API (deferred).

**Compliance**
- `audit_log` — every PHI mutation writes a row.

---

## RLS patterns

All policies live in the migration files. Two helper functions, defined in `0002_rls_policies.sql`:

- `public.current_user_role()` → 'clinician' | 'patient' | null
- `public.current_user_clinic()` → uuid of the user's clinic

The recurring patterns:

**Patient sees own / clinician sees their clinic.**

```sql
using (
  patient_id = auth.uid()
  or (public.current_user_role() = 'clinician' and clinic_id = public.current_user_clinic())
)
```

**Clinician-only writes in clinic.**

```sql
using (
  public.current_user_role() = 'clinician'
  and clinic_id = public.current_user_clinic()
)
```

**Patient reads training library content scoped through assignment.** See `0005_patient_training_reads.sql` — the EXISTS joins through `program_assignments` → `program_days` → session/exercise. Reference these when adding patient-facing reads on other clinic-wide tables. Important: fully qualify column names like `public.session_library.id` inside subqueries because outer/inner tables often share names like `id`.

---

## Conventions

**Server actions live next to the route they serve.** E.g. patient diet edits in `src/app/home/diet/entry-actions.ts`, clinician pillar edits in `src/app/clinician/patient/[id]/pillar/[pillarId]/actions.ts`. This keeps refactors local and import paths short.

**Every mutation calls `recordAudit()` from `@/lib/audit`.** Audit row captures `actor_id`, `actor_role`, `clinic_id`, `entity_type`, `entity_id`, `patient_id`, plus a JSONB `meta` blob (typically `{ before, after }`).

**`revalidatePath()` after every server-side mutation** so the new state shows up on the next render. Most actions revalidate the page they were called from plus any pages that read the same data (e.g. patient `/home/diet` AND `/home` after a food log change).

**Zod schemas at the top of every action file** validate inputs before the DB call. Reject early.

**All queries use `withAuth` or `serviceRoleSql` directly** — no ORM, no shim. Pattern:
```typescript
import { requireUser } from "@/lib/auth/server";       // or requireClinician / requirePatient
import { withAuth, serviceRoleSql } from "@/lib/db/connection";

const user = await requireUser();
const rows = await withAuth(user, (sql) =>
  sql`SELECT id, name FROM table WHERE patient_id = ${user.id}`
);
```
Use `serviceRoleSql` for cron jobs, webhook handlers, and audit writes (bypasses RLS). Use `withAuth` for all user-scoped queries (sets `app.current_user_id/role/clinic_id` session vars that RLS policies read).

Drizzle is wired up (`src/lib/db/index.ts`) but not used for queries — it's there for future typed schema work. The SQL migrations in `supabase/migrations/` are the source of truth for the schema.

**Tailwind: no dynamic class names.** The JIT compiler can't see `bg-${color}-500` style strings. Use literal classes everywhere.

**Numeric columns in Postgres come back as strings through postgres-js.** Use `Number(r.col)` to convert. Don't rely on automatic coercion.

---

## Auth + role gating

- Login at `/login` — password sign-in via Cognito. Magic-link removed (was Supabase-only).
- Auth layer: `src/lib/auth/server.ts` — `getUser()` / `requireUser()` / `requireClinician()` / `requirePatient()`. Reads Cognito JWT from `gh_id_token` cookie (set at `/auth/callback`).
- `src/lib/auth/middleware.ts` — verifies JWT via JWKS on every request, redirects unauthenticated users to `/login`, sends logged-in users to role-appropriate home.
- Patient layouts (`/home/*`) call `requirePatient()`. Clinician layouts call `requireClinician()`.

---

## Where each migration lives

Run them in numeric order in the Supabase SQL Editor when bootstrapping a fresh project. They're additive and idempotent (where applicable they use `drop policy if exists` / `add column if not exists`).

Then `supabase/seed.sql` for synthetic data (replace the two placeholder UUIDs with real `auth.users.id` values you've invited).

---

## Git / GitHub

Repo: `https://github.com/tdennis-blip/grand-health-app`

Day-to-day workflow — before switching machines:
```bash
git add .
git commit -m "what you did"
git push
```
When sitting down at another machine: `git pull`.

---

## Tombstone files (do not import from these)

These files exist only to preserve git history — they export nothing:
- `src/lib/supabase/server.ts` — was the SupabaseCompat shim
- `src/lib/db/query-builder.ts` — was the SupabaseCompat + SupaQuery classes
- `src/lib/supabase/client.ts` — was the browser Supabase client
- `src/lib/supabase/middleware.ts` — was the Supabase session middleware
- `src/lib/wearables/admin-client.ts` — was the service-role Supabase client

---

## Local setup quick ref

```bash
cd grand-health-app
cp .env.example .env.local      # fill Supabase URL + publishable key + connection strings + USDA key
npm install
npm run dev
```

For password-based dev sign-ins (avoiding email rate limits):

```sql
update auth.users
set encrypted_password = crypt('YourDevPassword123', gen_salt('bf'))
where email = 'you@example.com';
```

For wearable testing locally: tunnel your dev server so the OAuth callback (and webhooks) can reach you. `ngrok http 3000` or `cloudflared tunnel --url http://localhost:3000`. Set `NEXT_PUBLIC_SITE_URL` to the public URL and add it as the OAuth redirect in the Oura/Whoop developer consoles. The daily backfill cron can be exercised with `curl -X POST localhost:3000/api/wearables/sync -H "x-cron-token: $WEARABLES_CRON_TOKEN"`.

The refill-check cron is the same pattern: `curl -X POST localhost:3000/api/medications/refill-check -H "x-cron-token: $MEDICATIONS_CRON_TOKEN"`. Findings are written to `audit_log` (entity_type='medication_refill_alert') and de-duped within a calendar day.

---

## Deployment

### First-time AWS setup (one-time)
1. Create AWS account at aws.amazon.com
2. Sign BAA: AWS Console → AWS Artifact → Agreements → AWS Business Associate Addendum
3. Install AWS CLI + CDK: `npm install -g aws-cdk` then `aws configure`
4. Deploy infrastructure: `cd infra && npm install && cdk bootstrap && cdk deploy -c stage=staging`
5. Copy the CDK outputs (UserPoolId, UserPoolClientId, RDS endpoint) into `.env.local`
6. Run all 18 migrations in order against RDS
7. Seed data: update `supabase/seed.sql` to use real Cognito user IDs, run it

### Amplify Hosting
`amplify.yml` is already configured. Connect the repo in the Amplify console, set app root to `grand-health-app`, add env vars from `.env.local`, deploy.

Required env vars in Amplify console:
- `NEXT_PUBLIC_AWS_REGION`
- `NEXT_PUBLIC_COGNITO_USER_POOL_ID`
- `NEXT_PUBLIC_COGNITO_CLIENT_ID`
- `DATABASE_URL`
- `SERVICE_ROLE_DATABASE_URL`
- `NEXT_PUBLIC_SITE_URL`
- `USDA_API_KEY`
- Wearable OAuth keys
- Cloudinary keys
- `ANTHROPIC_API_KEY`

### Creating users (no self-signup)
Users are created by an admin in the Cognito console or via AWS CLI:
```bash
aws cognito-idp admin-create-user \
  --user-pool-id <USER_POOL_ID> \
  --username patient@example.com \
  --user-attributes Name=email,Value=patient@example.com \
                    Name=custom:role,Value=patient \
                    Name=custom:clinic_id,Value=<CLINIC_UUID> \
  --temporary-password TempPass123
```
Then in the app they sign in and are prompted to set a permanent password.

Their Cognito `sub` (UUID) must match the `profiles.id` row in the database.
Insert the profile row after creating the Cognito user:
```sql
INSERT INTO profiles (id, clinic_id, role, email, first_name, last_name)
VALUES ('<cognito-sub>', '<clinic-uuid>', 'patient', 'patient@example.com', 'First', 'Last');
```

---

## State of migration from prototype

**Done.** Auth + role gating, patient roster, full pillar editor (risks/drivers/recs/note), risk-factor library + sets + save-as-set, training library (exercises with kinds, sessions with kinds, programs with Mon-Sun grid + assignment, zones + targets), patient-facing training views (Today card, week, session detail), mobile chrome with 5-tab bar, patient pillar list + detail, pillar visibility toggles, diet plan editor, food logging (USDA search + per-meal entries + auto-aggregate + micronutrients), favorites + recent-foods quick-add strip, custom-food creation (clinic-scoped, immediate add), barcode scanning (Capacitor MLKit on native, Web BarcodeDetector on supported browsers, manual entry fallback) with local-cache → USDA gtinUpc resolution and graceful 404 → custom-food handoff, 7-day adherence chart, Grand 100 (activities + baseline + trajectory chart + back-cast), clinician-side Grand 100 activity library editor (CRUD + hide + reorder), patient profile editor (name / DOB / sex / height / weight with cm-kg ↔ ft-lb toggle, RLS-locked clinic + clinician), patient ↔ clinic messaging (per-patient threads with addressed recipients, Realtime, unread badges on patient bottom-tab + clinician top nav + inbox per row), clinician audit log viewer at `/clinician/audit` (URL-driven filters for date range / action / entity_type / actor / patient / free-text, expandable rows with meta JSON drilldown, offset pagination), wearables integration for Oura + Whoop (OAuth start/callback, webhook receivers w/ HMAC verification, daily cron backfill, patient Today sleep+recovery card, clinician 30-day trend card, integrations settings page), stack (meds & supplements: clinician-managed, per-dose-per-day check-offs, today grouped by morning/midday/evening/night, 7-day adherence strip, optional pillar linkage shown in pillar Recommendations tab, summary card + full editor on clinician patient page), stack extensions (clinic-wide drug interaction rules library at `/clinician/library/interactions`, refill tracking with per-med qty-on-hand + qty-per-dose + threshold + last-refill-on + quick "+ Refill" action + low/out badges surfaced to patient and clinician, per-med adherence report at `/clinician/patient/[id]/stack/adherence` with selectable 7/14/30/90d window + per-day heatmap + longest miss streak + CSV export at `/api/medications/adherence.csv`, per-medication change history timeline at `/clinician/patient/[id]/stack/history` populated by a SECURITY DEFINER trigger on `medications` with per-med drill-down at `.../history/[medicationId]`, clinic-wide refill queue at `/clinician/refills` plus daily cron at `/api/medications/refill-check` writing alerts into `audit_log`, patient-side "Request refill" button on `/home/stack` that posts a message to the primary clinician).

**Not yet built.**
- Apple Health integration (needs Capacitor iOS shell — only HealthKit gives you read access, no web OAuth exists)
- Eight Sleep integration (no public OAuth API — placeholder tile in integrations page)
- Clinician-entered food logs on behalf of patient (schema supports it)
- Per-factor genetic flag gating (e.g. ApoE4) — replaceable by individual factor hide for now

**Capacitor shell.** `capacitor.config.ts` is committed but the iOS/Android
projects are not (they're generated from the config). To stand them up on
your dev machine:

```bash
cd grand-health-app
npm install --include=optional        # pulls @capacitor/* + @capacitor-mlkit/barcode-scanning
CAPACITOR_SERVER_URL=https://<your-tunnel> npm run cap:init  # one-time: adds ios/ + android/
npm run cap:sync
npm run cap:ios       # opens Xcode
```

The shell loads from `CAPACITOR_SERVER_URL` (or `NEXT_PUBLIC_SITE_URL` in
prod) — there is no separate bundled web build. `BarcodeScanner` in
`src/app/home/diet/barcode-scanner.tsx` feature-detects
`window.Capacitor.isNativePlatform()` and dynamic-imports
`@capacitor-mlkit/barcode-scanning` only on native, so the web build stays
unaffected.

---

## Patterns to copy when adding new features

When adding a new patient-side view that reads PHI:

1. Server component calls `requirePatient()` to get `user`, then fetches with `withAuth(user, sql => sql\`...\`)`. RLS handles scoping.
2. Pull related data in parallel with `Promise.all([...])`.
3. Pass shaped data into a small client component for any interactivity.
4. Add a route + tab if it needs navigation.

When adding a new clinician-side editor:

1. Create `actions.ts` in the route folder with `"use server"`. Define Zod schemas. Each action: validate → upsert → audit → revalidate.
2. Server component renders the data + a client form component.
3. Client component holds form state with `useState`, calls actions via `useTransition`, shows "Saving…" + "Saved." states.

When adding a new SQL migration:

1. Number it `00XX_short_name.sql`.
2. Make it idempotent: `create table if not exists`, `add column if not exists`, `drop policy if exists` before each `create policy`.
3. Update `src/lib/db/schema.ts` to match.
4. Reference patterns from the closest existing migration.

---

## When stuck

- For unclear visual / behavioural intent → look at `../grandhealth-prototype.jsx`. It's one giant JSX file but every feature lives there.
- For unclear data shapes → look at the relevant migration file in `supabase/migrations/`.
- For unclear auth patterns → look at `src/lib/auth/server.ts`, `src/lib/db/connection.ts`, and `0002_rls_policies.sql`.
- For unclear query patterns → look at any recent actions file, e.g. `src/app/home/diet/entry-actions.ts`.
- For unclear deployment → `README.md` + `amplify.yml`.
