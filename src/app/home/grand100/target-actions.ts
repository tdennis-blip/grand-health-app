"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePatient } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { recordAudit } from "@/lib/audit";

const schema = z.object({
  activityId: z.string().uuid(),
  targetAge: z.number().int().min(40).max(120),
});

export async function setTargetAge(input: z.infer<typeof schema>) {
  const parsed = schema.parse(input);
  const user = await requirePatient();

  const [before] = await withAuth(user, (sql) =>
    sql`SELECT target_age FROM grand100_patient_targets WHERE patient_id = ${user.id} AND activity_id = ${parsed.activityId} LIMIT 1`
  );

  await withAuth(user, (sql) =>
    sql`
      INSERT INTO grand100_patient_targets (patient_id, activity_id, clinic_id, target_age, updated_at)
      VALUES (${user.id}, ${parsed.activityId}, ${user.clinicId}, ${parsed.targetAge}, ${new Date().toISOString()})
      ON CONFLICT (patient_id, activity_id) DO UPDATE SET target_age = EXCLUDED.target_age, updated_at = EXCLUDED.updated_at
    `
  );

  await recordAudit({
    action: before ? "update" : "create",
    entityType: "grand100_patient_target",
    entityId: parsed.activityId,
    patientId: user.id,
    meta: { before, after: { target_age: parsed.targetAge } },
  });

  revalidatePath("/home/grand100");
}
