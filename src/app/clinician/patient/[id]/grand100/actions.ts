"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireClinician } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { recordAudit } from "@/lib/audit";

const baselineSchema = z.object({
  patientId: z.string().uuid(),
  vo2Now: z.number().int().min(5).max(90).nullish(),
  gripKg: z.number().int().min(5).max(200).nullish(),
  squat1rmLb: z.number().int().min(0).max(1000).nullish(),
  strengthPercentile: z.number().int().min(0).max(100).nullish(),
  mobilityPercentile: z.number().int().min(0).max(100).nullish(),
  measuredOn: z.string().nullish(),
});

export async function upsertGrand100Baseline(input: z.infer<typeof baselineSchema>) {
  const parsed = baselineSchema.parse(input);
  const user = await requireClinician();

  const [patient] = await withAuth(user, (sql) =>
    sql`SELECT clinic_id FROM patient_profiles WHERE profile_id = ${parsed.patientId} LIMIT 1`
  );
  if (!patient) throw new Error("Patient not found");

  const [before] = await withAuth(user, (sql) =>
    sql`SELECT * FROM grand100_baselines WHERE patient_id = ${parsed.patientId} LIMIT 1`
  );

  const [row] = await withAuth(user, (sql) =>
    sql`
      INSERT INTO grand100_baselines (patient_id, clinic_id, vo2_now, grip_kg, squat_1rm_lb, strength_percentile, mobility_percentile, measured_on, updated_at)
      VALUES (${parsed.patientId}, ${patient.clinic_id}, ${parsed.vo2Now ?? null}, ${parsed.gripKg ?? null},
              ${parsed.squat1rmLb ?? null}, ${parsed.strengthPercentile ?? null}, ${parsed.mobilityPercentile ?? null},
              ${parsed.measuredOn || null}, ${new Date().toISOString()})
      ON CONFLICT (patient_id) DO UPDATE SET
        clinic_id = EXCLUDED.clinic_id, vo2_now = EXCLUDED.vo2_now, grip_kg = EXCLUDED.grip_kg,
        squat_1rm_lb = EXCLUDED.squat_1rm_lb, strength_percentile = EXCLUDED.strength_percentile,
        mobility_percentile = EXCLUDED.mobility_percentile, measured_on = EXCLUDED.measured_on, updated_at = EXCLUDED.updated_at
      RETURNING *
    `
  );

  await recordAudit({
    action: before ? "update" : "create",
    entityType: "grand100_baseline",
    entityId: parsed.patientId,
    patientId: parsed.patientId,
    meta: { before, after: row },
  });

  revalidatePath(`/clinician/patient/${parsed.patientId}`);
  revalidatePath(`/home/grand100`);
}
