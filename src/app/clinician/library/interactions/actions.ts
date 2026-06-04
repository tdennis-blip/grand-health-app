"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireClinician } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { recordAudit } from "@/lib/audit";

const SEVERITIES = ["info", "warn", "severe"] as const;

const upsertSchema = z.object({
  id: z.string().uuid().nullish(),
  namePatternA: z.string().min(1).max(200),
  namePatternB: z.string().min(1).max(200),
  severity: z.enum(SEVERITIES),
  message: z.string().min(1).max(2000),
  source: z.string().max(200).nullish(),
  active: z.boolean(),
});

export async function upsertInteractionRule(input: z.infer<typeof upsertSchema>) {
  const parsed = upsertSchema.parse(input);
  const user = await requireClinician();

  let id = parsed.id ?? null;
  if (id) {
    await withAuth(user, (sql) =>
      sql`UPDATE medication_interactions SET clinic_id = ${user.clinicId}, name_pattern_a = ${parsed.namePatternA.trim()}, name_pattern_b = ${parsed.namePatternB.trim()}, severity = ${parsed.severity}, message = ${parsed.message.trim()}, source = ${parsed.source?.trim() || null}, active = ${parsed.active}, updated_at = ${new Date().toISOString()} WHERE id = ${id}`
    );
    await recordAudit({ action: "update", entityType: "medication_interaction", entityId: id });
  } else {
    const [inserted] = await withAuth(user, (sql) =>
      sql`INSERT INTO medication_interactions (clinic_id, name_pattern_a, name_pattern_b, severity, message, source, active, updated_at) VALUES (${user.clinicId}, ${parsed.namePatternA.trim()}, ${parsed.namePatternB.trim()}, ${parsed.severity}, ${parsed.message.trim()}, ${parsed.source?.trim() || null}, ${parsed.active}, ${new Date().toISOString()}) RETURNING id`
    );
    if (!inserted) throw new Error("Failed to insert");
    id = inserted.id;
    await recordAudit({ action: "create", entityType: "medication_interaction", entityId: id });
  }

  revalidatePath("/clinician/library/interactions");
  return { id };
}

export async function deleteInteractionRule(id: string) {
  const user = await requireClinician();
  await withAuth(user, (sql) => sql`DELETE FROM medication_interactions WHERE id = ${id}`);
  await recordAudit({ action: "delete", entityType: "medication_interaction", entityId: id });
  revalidatePath("/clinician/library/interactions");
}
