import type { Config } from "drizzle-kit";

export default {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    // Migrations need a direct (non-pooled) connection. Use the DIRECT_DATABASE_URL
    // from .env.local for `drizzle-kit migrate`.
    url: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL!,
  },
  // Supabase manages its own auth + storage schemas; we only own `public` here.
  schemaFilter: ["public"],
  verbose: true,
  strict: true,
} satisfies Config;
