# Grand Health

Production app scaffold for the Grand Health longevity clinic platform.
This is the real Next.js + Supabase build that the single-file prototype
(`../grandhealth-prototype.jsx`) feeds into.

**Status:** scaffold complete. Login, role-based routing, and an end-to-end
"clinician dashboard reads patients from Postgres under RLS" path are in
place. The full prototype's features (Pillars editor, Training library,
Diet plan, Grand 100, etc.) will migrate into this app screen-by-screen.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router, TypeScript) |
| Hosting (target) | AWS Amplify Hosting |
| Auth + Postgres + Storage | Supabase |
| ORM | Drizzle |
| Styling | Tailwind CSS |

PHI handling is handled by Postgres Row Level Security policies (see
`supabase/migrations/0002_rls_policies.sql`). Every PHI-touching table
carries `clinic_id` so policies can filter on a single column.

---

## Local setup (first time)

### 1. Create a Supabase project

1. Go to <https://supabase.com> → New project. Pick the cheapest tier; for
   real PHI later you'll upgrade to **Team plan + HIPAA add-on**.
2. Wait for the database to spin up.

### 2. Apply the schema

Open the Supabase dashboard → **SQL Editor** and run, in order:

1. `supabase/migrations/0001_initial_schema.sql`
2. `supabase/migrations/0002_rls_policies.sql`

(You can also run them with `psql` against the direct connection URL.)

### 3. Create your first users

In **Authentication → Users → Invite user**, create:

- One clinician (e.g. `you@yourclinic.com`)
- One test patient (e.g. `testpatient@example.com`)

Copy their `auth.users.id` values from the dashboard.

### 4. Seed synthetic clinic + pillars

Open `supabase/seed.sql`, replace the two placeholder UUIDs at the top
(`v_clinician_id`, `v_patient_id`) with the IDs you just created, then run
the file in the SQL Editor. This creates:

- A clinic row
- Profile rows for the clinician and patient (linked to their auth users)
- A starter risk-factor library
- Two pillars (CV, Metabolic) on the test patient with a few factors

### 5. Set environment variables

```bash
cp .env.example .env.local
```

Fill in:
- `NEXT_PUBLIC_SUPABASE_URL` — from Supabase → Settings → API
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — same page, anon/public key
- `DATABASE_URL` — Settings → Database → Connection string (pooled, port 6543)
- `DIRECT_DATABASE_URL` — same page, direct (port 5432). Used by Drizzle
  migrations only.
- `SUPABASE_SERVICE_ROLE_KEY` — Settings → API (treat like a password)
- `NEXT_PUBLIC_SITE_URL` — `http://localhost:3000` for local

### 6. Install + run

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. Click "Sign in", enter the clinician email
you invited, click the magic link in your inbox — you should land on
`/clinician/dashboard` and see the test patient in the roster.

---

## Useful scripts

```bash
npm run dev         # local dev server
npm run build       # production build
npm run start       # serve the build
npm run typecheck   # run tsc --noEmit
npm run lint        # next lint
npm run db:generate # drizzle-kit generate (from schema.ts)
npm run db:migrate  # apply drizzle-generated migrations
npm run db:studio   # open Drizzle Studio
npm run db:push     # push schema.ts directly (dev only)
```

Drizzle is wired up but **the source of truth for the current schema is
the SQL migrations in `supabase/migrations/`**, not Drizzle's generated
files. We use Drizzle for typed queries; we keep the SQL hand-written
because it needs to include things Drizzle can't model cleanly (RLS,
auth.users foreign keys, helper functions).

---

## Deploying to AWS Amplify

1. Push this repo to GitHub.
2. AWS console → **Amplify** → "Create new app" → "Host web app" → GitHub.
3. Pick the repo + branch. Set the app root to `grand-health-app` if the
   prototype is in the same monorepo.
4. Amplify will auto-detect `amplify.yml`.
5. Add the same environment variables from `.env.local` under "Environment
   variables" in the Amplify console — Amplify injects them at build time.
6. Add your custom domain (optional).
7. Deploy.

The first build takes ~5 min. Subsequent builds run on every push.

---

## File map

```
src/
├── app/
│   ├── layout.tsx                # root html shell
│   ├── page.tsx                  # public landing (auto-redirects when logged in)
│   ├── globals.css               # tailwind base
│   ├── login/                    # magic-link login page
│   ├── auth/
│   │   ├── actions.ts            # server actions (signOut)
│   │   └── callback/route.ts     # magic-link callback handler
│   ├── home/                     # patient portal (mobile-shaped, more screens coming)
│   └── clinician/
│       ├── layout.tsx            # clinician chrome + role gate
│       ├── dashboard/page.tsx    # patient roster
│       └── patient/[id]/page.tsx # patient detail
├── lib/
│   ├── supabase/
│   │   ├── client.ts             # browser supabase client
│   │   ├── server.ts             # server supabase client
│   │   └── middleware.ts         # session refresh + role-based redirects
│   └── db/
│       ├── index.ts              # Drizzle client (postgres-js)
│       └── schema.ts             # Drizzle table definitions
└── middleware.ts                 # runs updateSession on every request

supabase/
├── migrations/
│   ├── 0001_initial_schema.sql   # tables, enums, indexes
│   └── 0002_rls_policies.sql     # row-level security
└── seed.sql                      # synthetic data for local dev

amplify.yml                       # AWS Amplify build spec
```

---

## What's next

In the next session:
- Migrate the **Pillar Configuration / Personalize Content** drawer from
  the prototype into a real screen, backed by `pillars` + `pillar_factors`.
- Migrate the **Risk Factor Library** drawer (CRUD against
  `risk_factor_library` + `risk_factor_sets`).
- Add an **audit log** wrapper around every database mutation so all PHI
  writes hit `audit_log`.

Then the Training library, Diet plan, and Grand 100 in subsequent sessions.
