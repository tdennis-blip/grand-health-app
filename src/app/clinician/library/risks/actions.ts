"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireClinician } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { recordAudit } from "@/lib/audit";

const STATUSES = ["on-target", "borderline", "off-target"] as const;
const WEIGHTS = ["low", "medium", "high"] as const;

const factorSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  unit: z.string().max(50).nullish(),
  defaultGoal: z.string().max(200).nullish(),
  weight: z.enum(WEIGHTS).default("medium"),
  defaultStatus: z.enum(STATUSES).default("borderline"),
  source: z.string().max(200).nullish(),
  note: z.string().max(2000).nullish(),
  category: z.string().max(100).nullish(),
});

const setSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  pillarKind: z.enum(["cv", "metabolic", "neuro", "cancer", "physical", "endocrine"]).nullish(),
  factorIds: z.array(z.string().uuid()).default([]),
});

const revalidateLibrary = () => revalidatePath("/clinician/library/risks");

export async function createFactor(input: z.infer<typeof factorSchema>) {
  const parsed = factorSchema.parse(input);
  const user = await requireClinician();

  const [inserted] = await withAuth(user, (sql) =>
    sql`INSERT INTO risk_factor_library (clinic_id, name, unit, default_goal, weight, default_status, source, note, category) VALUES (${user.clinicId}, ${parsed.name}, ${parsed.unit ?? null}, ${parsed.defaultGoal ?? null}, ${parsed.weight}, ${parsed.defaultStatus}, ${parsed.source ?? null}, ${parsed.note ?? null}, ${parsed.category ?? null}) RETURNING id`
  );
  if (!inserted) throw new Error("Insert failed");

  await recordAudit({ action: "create", entityType: "risk_factor_library", entityId: inserted.id, meta: { name: parsed.name } });
  revalidateLibrary();
  return inserted.id as string;
}

export async function updateFactor(input: z.infer<typeof factorSchema> & { id: string }) {
  const parsed = factorSchema.extend({ id: z.string().uuid() }).parse(input);
  const user = await requireClinician();

  const [before] = await withAuth(user, (sql) =>
    sql`SELECT name, unit, default_goal, weight, default_status, source, note, category FROM risk_factor_library WHERE id = ${parsed.id} LIMIT 1`
  );

  await withAuth(user, (sql) =>
    sql`UPDATE risk_factor_library SET name = ${parsed.name}, unit = ${parsed.unit ?? null}, default_goal = ${parsed.defaultGoal ?? null}, weight = ${parsed.weight}, default_status = ${parsed.defaultStatus}, source = ${parsed.source ?? null}, note = ${parsed.note ?? null}, category = ${parsed.category ?? null}, updated_at = ${new Date().toISOString()} WHERE id = ${parsed.id}`
  );

  await recordAudit({ action: "update", entityType: "risk_factor_library", entityId: parsed.id, meta: { before } });
  revalidateLibrary();
}

export async function deleteFactor(id: string) {
  const user = await requireClinician();

  const [before] = await withAuth(user, (sql) =>
    sql`SELECT name FROM risk_factor_library WHERE id = ${id} LIMIT 1`
  );

  await withAuth(user, (sql) => sql`DELETE FROM risk_factor_library WHERE id = ${id}`);

  await recordAudit({ action: "delete", entityType: "risk_factor_library", entityId: id, meta: { before } });
  revalidateLibrary();
}

export async function createSet(input: z.infer<typeof setSchema>) {
  const parsed = setSchema.parse(input);
  const user = await requireClinician();

  const [inserted] = await withAuth(user, (sql) =>
    sql`INSERT INTO risk_factor_sets (clinic_id, name, description, pillar_kind) VALUES (${user.clinicId}, ${parsed.name}, ${parsed.description ?? null}, ${parsed.pillarKind ?? null}) RETURNING id`
  );
  if (!inserted) throw new Error("Insert failed");

  for (let i = 0; i < parsed.factorIds.length; i++) {
    await withAuth(user, (sql) =>
      sql`INSERT INTO risk_factor_set_items (set_id, factor_id, sort_order) VALUES (${inserted.id}, ${parsed.factorIds[i]}, ${i})`
    );
  }

  await recordAudit({ action: "create", entityType: "risk_factor_set", entityId: inserted.id, meta: { name: parsed.name, factor_count: parsed.factorIds.length } });
  revalidateLibrary();
  return inserted.id as string;
}

export async function updateSet(input: z.infer<typeof setSchema> & { id: string }) {
  const parsed = setSchema.extend({ id: z.string().uuid() }).parse(input);
  const user = await requireClinician();

  const [before] = await withAuth(user, (sql) =>
    sql`SELECT name, description, pillar_kind FROM risk_factor_sets WHERE id = ${parsed.id} LIMIT 1`
  );

  await withAuth(user, (sql) =>
    sql`UPDATE risk_factor_sets SET name = ${parsed.name}, description = ${parsed.description ?? null}, pillar_kind = ${parsed.pillarKind ?? null}, updated_at = ${new Date().toISOString()} WHERE id = ${parsed.id}`
  );

  await withAuth(user, (sql) => sql`DELETE FROM risk_factor_set_items WHERE set_id = ${parsed.id}`);
  for (let i = 0; i < parsed.factorIds.length; i++) {
    await withAuth(user, (sql) =>
      sql`INSERT INTO risk_factor_set_items (set_id, factor_id, sort_order) VALUES (${parsed.id}, ${parsed.factorIds[i]}, ${i})`
    );
  }

  await recordAudit({ action: "update", entityType: "risk_factor_set", entityId: parsed.id, meta: { before } });
  revalidateLibrary();
}

export async function deleteSet(id: string) {
  const user = await requireClinician();

  const [before] = await withAuth(user, (sql) =>
    sql`SELECT name FROM risk_factor_sets WHERE id = ${id} LIMIT 1`
  );

  await withAuth(user, (sql) => sql`DELETE FROM risk_factor_sets WHERE id = ${id}`);

  await recordAudit({ action: "delete", entityType: "risk_factor_set", entityId: id, meta: { before } });
  revalidateLibrary();
}
