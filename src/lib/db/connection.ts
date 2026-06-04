// Authenticated DB connection wrapper.
//
// Every query that needs RLS must go through `withAuth(user, fn)` which sets
// the three Postgres session variables our RLS policies read:
//   app.current_user_id   → user.id (Cognito sub)
//   app.current_user_role → 'clinician' | 'patient'
//   app.current_clinic_id → user.clinicId
//
// Usage in a Server Action or Route Handler:
//
//   const user = await requireUser();
//   const rows = await withAuth(user, (sql) =>
//     sql`SELECT * FROM pillars WHERE patient_id = ${patientId}`
//   );
import postgres from "postgres";
import type { AuthUser } from "@/lib/auth/server";

const connectionString = process.env.DATABASE_URL;
if (!connectionString && process.env.NODE_ENV !== "test") {
  throw new Error("DATABASE_URL is not set.");
}

// Shared pool — postgres-js handles connection pooling internally.
// `prepare: false` is required if you're behind PgBouncer in transaction mode.
export const sql = postgres(connectionString ?? "", {
  prepare: false,
  max: 10,
});

/**
 * Run `fn` inside a transaction with RLS session variables set.
 * The variables are LOCAL to the transaction so they don't leak across
 * connections in the pool.
 */
export async function withAuth<T>(
  user: AuthUser,
  fn: (sql: postgres.Sql) => Promise<T>
): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`
      SELECT
        set_config('app.current_user_id',   ${user.id},       true),
        set_config('app.current_user_role',  ${user.role},     true),
        set_config('app.current_clinic_id',  ${user.clinicId}, true)
    `;
    return fn(tx);
  });
}

/**
 * Service-role queries: bypass RLS entirely by using a separate connection
 * with the service user (e.g., for cron jobs, audit log writes, seed scripts).
 * Only available on the server — never import this in client components.
 */
export const serviceRoleSql = postgres(
  process.env.SERVICE_ROLE_DATABASE_URL ?? connectionString ?? "",
  { prepare: false, max: 5 }
);
