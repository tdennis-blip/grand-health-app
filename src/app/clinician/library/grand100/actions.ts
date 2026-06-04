"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireClinician } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { recordAudit } from "@/lib/audit";

const TIERS = ["essential", "important", "stretch"] as const;
const LEVELS = ["low", "moderate", "high"] as const;

const activitySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  icon: z.string().max(60).nullish(),
  accent: z.string().max(120).nullish(),
  tier: z.enum(TIERS).default("important"),
  requiredVo2: z.number().int().min(5).max(80),
  requiredStrengthLb: z.number().int().min(0).max(800).nullish(),
  requiredStrengthLevel: z.enum(LEVELS).default("moderate"),
  requiredMobilityLevel: z.enum(LEVELS).default("moderate"),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

const revalidateAll = () => {
  revalidatePath("/clinician/library/grand100");
  revalidatePath("/home/grand100");
};

export async function createActivity(input: z.infer<typeof activitySchema>) {
  const parsed = activitySchema.parse(input);
  const user = await requireClinician();

  let nextSort = parsed.sortOrder;
  if (nextSort == null) {
    const [maxRow] = await withAuth(user, (sql) =>
      sql`SELECT sort_order FROM grand100_activities WHERE clinic_id = ${user.clinicId} ORDER BY sort_order DESC LIMIT 1`
    );
    nextSort = (maxRow?.sort_order ?? -1) + 1;
  }

  const [inserted] = await withAuth(user, (sql) =>
    sql`INSERT INTO grand100_activities (clinic_id, name, description, icon, accent, tier, required_vo2, required_strength_lb, required_strength_level, required_mobility_level, sort_order) VALUES (${user.clinicId}, ${parsed.name}, ${parsed.description ?? null}, ${parsed.icon ?? null}, ${parsed.accent ?? null}, ${parsed.tier}, ${parsed.requiredVo2}, ${parsed.requiredStrengthLb ?? null}, ${parsed.requiredStrengthLevel}, ${parsed.requiredMobilityLevel}, ${nextSort}) RETURNING id`
  );
  if (!inserted) throw new Error("Insert failed");

  await recordAudit({ action: "create", entityType: "grand100_activity", entityId: inserted.id, meta: { name: parsed.name } });
  revalidateAll();
  return inserted.id as string;
}

export async function updateActivity(input: z.infer<typeof activitySchema> & { id: string }) {
  const parsed = activitySchema.extend({ id: z.string().uuid() }).parse(input);
  const user = await requireClinician();

  const [before] = await withAuth(user, (sql) =>
    sql`SELECT name, description, icon, accent, tier, required_vo2, required_strength_lb, required_strength_level, required_mobility_level, sort_order FROM grand100_activities WHERE id = ${parsed.id} LIMIT 1`
  );

  await withAuth(user, (sql) =>
    sql`UPDATE grand100_activities SET name = ${parsed.name}, description = ${parsed.description ?? null}, icon = ${parsed.icon ?? null}, accent = ${parsed.accent ?? null}, tier = ${parsed.tier}, required_vo2 = ${parsed.requiredVo2}, required_strength_lb = ${parsed.requiredStrengthLb ?? null}, required_strength_level = ${parsed.requiredStrengthLevel}, required_mobility_level = ${parsed.requiredMobilityLevel}, sort_order = ${parsed.sortOrder ?? before?.sort_order}, updated_at = ${new Date().toISOString()} WHERE id = ${parsed.id}`
  );

  await recordAudit({ action: "update", entityType: "grand100_activity", entityId: parsed.id, meta: { before } });
  revalidateAll();
}

export async function setActivityHidden(id: string, hidden: boolean) {
  const user = await requireClinician();

  const [before] = await withAuth(user, (sql) =>
    sql`SELECT name, hidden FROM grand100_activities WHERE id = ${id} LIMIT 1`
  );

  await withAuth(user, (sql) =>
    sql`UPDATE grand100_activities SET hidden = ${hidden}, updated_at = ${new Date().toISOString()} WHERE id = ${id}`
  );

  await recordAudit({ action: "update", entityType: "grand100_activity", entityId: id, meta: { before, after: { hidden } } });
  revalidateAll();
}

export async function deleteActivity(id: string) {
  const user = await requireClinician();

  const [before] = await withAuth(user, (sql) =>
    sql`SELECT name FROM grand100_activities WHERE id = ${id} LIMIT 1`
  );

  await withAuth(user, (sql) => sql`DELETE FROM grand100_activities WHERE id = ${id}`);

  await recordAudit({ action: "delete", entityType: "grand100_activity", entityId: id, meta: { before } });
  revalidateAll();
}

const reorderSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1),
});

export async function reorderActivities(input: z.infer<typeof reorderSchema>) {
  const parsed = reorderSchema.parse(input);
  const user = await requireClinician();

  for (let i = 0; i < parsed.orderedIds.length; i++) {
    await withAuth(user, (sql) =>
      sql`UPDATE grand100_activities SET sort_order = ${i}, updated_at = ${new Date().toISOString()} WHERE id = ${parsed.orderedIds[i]}`
    );
  }

  await recordAudit({ action: "update", entityType: "grand100_activity", meta: { reorder: parsed.orderedIds } });
  revalidateAll();
}
