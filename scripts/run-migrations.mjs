// Self-contained DB migration runner — runs INSIDE the VPC as a one-off ECS
// task (see infra/lib/app-runtime.ts "MigrateTask"), so no bastion tunnel is
// needed. Uses the owner role via MIGRATE_DATABASE_URL (= SERVICE_ROLE_DATABASE_URL).
//
// Two modes:
//   • MIGRATE_FILE=0040_x.sql  → apply exactly that one file (idempotent-safe,
//     no state tracking). Mirrors the old `psql -f <file>` workflow. PREFERRED
//     until schema_migrations has been baselined.
//   • MIGRATE_MODE=baseline    → record EVERY *.sql file currently in the image
//     as already-applied WITHOUT running any of them. Run this once to adopt an
//     existing hand-migrated database; afterward apply-all only runs new files.
//   • (no MIGRATE_FILE)        → apply every *.sql in supabase/migrations not yet
//     recorded in public.schema_migrations, in filename order, each in its own
//     transaction. For future auto-migrate-on-deploy.
//
// postgres-js has zero dependencies, so the runner image only needs that one
// module + the migrations directory copied in (see Dockerfile).

import postgres from "postgres";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const url = process.env.MIGRATE_DATABASE_URL;
if (!url) {
  console.error("MIGRATE_DATABASE_URL is not set");
  process.exit(1);
}

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const sql = postgres(url, { ssl: "require", max: 1, idle_timeout: 5 });

async function applyOne(filename) {
  const path = join(migrationsDir, filename);
  if (!existsSync(path)) throw new Error(`Migration not found: ${filename}`);
  const text = readFileSync(path, "utf8");
  console.log(`Applying ${filename} ...`);
  await sql.begin(async (tx) => {
    await tx.unsafe(text);
    await tx`
      insert into public.schema_migrations (filename)
      values (${filename})
      on conflict (filename) do nothing
    `;
  });
  console.log(`  ✓ ${filename}`);
}

async function main() {
  await sql`
    create table if not exists public.schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    )
  `;

  // Baseline: mark all present files as applied, run nothing.
  if (process.env.MIGRATE_MODE === "baseline") {
    const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
    for (const f of files) {
      await sql`
        insert into public.schema_migrations (filename)
        values (${f})
        on conflict (filename) do nothing
      `;
    }
    console.log(`Baselined ${files.length} migration file(s) as applied (none executed):`);
    for (const f of files) console.log(`  · ${f}`);
    return;
  }

  const single = process.env.MIGRATE_FILE;
  if (single) {
    await applyOne(single);
    console.log("Done (single file).");
    return;
  }

  const applied = new Set(
    (await sql`select filename from public.schema_migrations`).map((r) => r.filename)
  );
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  const pending = files.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log("No pending migrations.");
    return;
  }
  for (const f of pending) await applyOne(f);
  console.log(`Applied ${pending.length} migration(s).`);
}

main()
  .then(async () => { await sql.end({ timeout: 5 }); process.exit(0); })
  .catch(async (err) => {
    console.error("Migration failed:", err?.message ?? err);
    try { await sql.end({ timeout: 5 }); } catch {}
    process.exit(1);
  });
