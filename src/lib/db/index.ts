// Postgres client used by server-side code (Server Components, Route Handlers,
// migrations). Never imported into client components.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and fill in your Supabase Postgres connection string."
  );
}

// `prepare: false` is required when using Supabase's pooled (pgbouncer)
// connection in transaction mode. Switch to a direct connection if you
// need prepared statements.
const queryClient = postgres(connectionString, { prepare: false });

export const db = drizzle(queryClient, { schema });
export { schema };
