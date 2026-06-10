// Postgres client used by server-side code (Server Components, Route Handlers,
// migrations). Never imported into client components.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
// Don't throw at import time: Next.js imports every server module during the
// production build, before runtime env (Secrets Manager) is injected. postgres()
// is lazy and won't connect until a query runs.
if (!connectionString && process.env.NODE_ENV === "production") {
  console.warn("DATABASE_URL is not set; DB queries will fail until it is provided.");
}

// `prepare: false` is required when using a pooled (pgbouncer) connection in
// transaction mode. Switch to a direct connection if you need prepared statements.
const queryClient = postgres(connectionString ?? "", { prepare: false });

export const db = drizzle(queryClient, { schema });
export { schema };
