"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireClinician } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { recordAudit } from "@/lib/audit";

const schema = z.object({
  patientId: z.string().uuid(),
  activityId: z.string().uuid(),
  targetAge: z.number().int().min(40).max(120),
});

export async function setPatientTargetAge(input: z.infer<typeof schema>) {
  const parsed = schema.parse(input);
  const user = await requireClinician();

  const [pp] = await withAuth(user, (sql) =>
    sql`SELECT clinic_id FROM patient_profiles WHERE profile_id = ${parsed.patientId} LIMIT 1`
  );
  if (!pp?.clinic_id) throw new Error("Patient not found");

  const [before] = await withAuth(user, (sql) =>
    sql`SELECT target_age FROM grand100_patient_targets WHERE patient_id = ${parsed.patientId} AND activity_id = ${parsed.activityId} LIMIT 1`
  );

  await withAuth(user, (sql) =>
    sql`
      INSERT INTO grand100_patient_targets (patient_id, activity_id, clinic_id, target_age, updated_at)
      VALUES (${parsed.patientId}, ${parsed.activityId}, ${pp.clinic_id}, ${parsed.targetAge}, ${new Date().toISOString()})
      ON CONFLICT (patient_id, activity_id) DO UPDATE SET target_age = EXCLUDED.target_age, updated_at = EXCLUDED.updated_at
    `
  );

  await recordAudit({
    action: before ? "update" : "create",
    entityType: "grand100_patient_target",
    entityId: parsed.activityId,
    patientId: parsed.patientId,
    meta: { before, after: { target_age: parsed.targetAge } },
  });

  revalidatePath(`/clinician/patient/${parsed.patientId}`);
  revalidatePath(`/home/grand100`);
}
