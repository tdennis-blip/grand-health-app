"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireClinician } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { recordAudit } from "@/lib/audit";

const zoneSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  shortName: z.string().min(1).max(10),
  lowBpm: z.number().int().min(40).max(220),
  highBpm: z.number().int().min(40).max(220),
});

const targetsSchema = z.object({
  strengthPerWeek: z.number().int().min(0).max(20),
  zone2MinutesPerWeek: z.number().int().min(0).max(2000),
  vo2maxMinutesPerWeek: z.number().int().min(0).max(2000),
  mobilityPerWeek: z.number().int().min(0).max(20),
});

const revalidateAll = () => revalidatePath("/clinician/library/training/zones");

export async function updateZone(input: z.infer<typeof zoneSchema>) {
  const parsed = zoneSchema.parse(input);
  const user = await requireClinician();

  await withAuth(user, (sql) =>
    sql`UPDATE hr_zones SET name = ${parsed.name}, short_name = ${parsed.shortName}, low_bpm = ${parsed.lowBpm}, high_bpm = ${parsed.highBpm}, updated_at = ${new Date().toISOString()} WHERE id = ${parsed.id}`
  );

  await recordAudit({ action: "update", entityType: "hr_zone", entityId: parsed.id, meta: { low: parsed.lowBpm, high: parsed.highBpm } });
  revalidateAll();
}

export async function updateTargets(input: z.infer<typeof targetsSchema>) {
  const parsed = targetsSchema.parse(input);
  const user = await requireClinician();

  await withAuth(user, (sql) =>
    sql`UPDATE training_targets SET strength_per_week = ${parsed.strengthPerWeek}, zone2_minutes_per_week = ${parsed.zone2MinutesPerWeek}, vo2max_minutes_per_week = ${parsed.vo2maxMinutesPerWeek}, mobility_per_week = ${parsed.mobilityPerWeek}, updated_at = ${new Date().toISOString()} WHERE clinic_id = ${user.clinicId}`
  );

  await recordAudit({ action: "update", entityType: "training_targets", entityId: null, meta: parsed });
  revalidateAll();
}
