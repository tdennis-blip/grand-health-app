"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePatient } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { recordAudit } from "@/lib/audit";

const logSetSchema = z.object({
  sessionId: z.string().uuid(),
  setId: z.string().uuid(),
  day: z.string().min(1).max(8),
  logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  actualReps: z.number().int().min(0).max(100000).nullable(),
  actualWeight: z.number().int().min(0).max(100000).nullable(),
  done: z.boolean(),
});

// Upsert the patient's logged actuals for one prescribed set on a given date.
export async function logSet(input: z.infer<typeof logSetSchema>) {
  const parsed = logSetSchema.parse(input);
  const user = await requirePatient();

  await withAuth(user, (sql) =>
    sql`
      INSERT INTO exercise_set_logs
        (clinic_id, patient_id, session_id, set_id, log_date, actual_reps, actual_weight, done)
      VALUES
        (${user.clinicId}, ${user.id}, ${parsed.sessionId}, ${parsed.setId}, ${parsed.logDate},
         ${parsed.actualReps}, ${parsed.actualWeight}, ${parsed.done})
      ON CONFLICT (patient_id, set_id, log_date) DO UPDATE SET
        actual_reps = EXCLUDED.actual_reps,
        actual_weight = EXCLUDED.actual_weight,
        done = EXCLUDED.done,
        updated_at = now()
    `
  );

  await recordAudit({
    action: "update",
    entityType: "exercise_set_log",
    entityId: parsed.setId,
    patientId: user.id,
    meta: { reps: parsed.actualReps, weight: parsed.actualWeight, done: parsed.done, date: parsed.logDate },
  });

  revalidatePath(`/home/training/${parsed.day}`);
}
