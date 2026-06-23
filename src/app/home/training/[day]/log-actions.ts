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
  side: z.enum(["na", "left", "right"]).default("na"),
  actualReps: z.number().int().min(0).max(100000).nullable(),
  actualWeight: z.number().int().min(0).max(100000).nullable(),
  actualSeconds: z.number().int().min(0).max(100000).nullable().default(null),
  done: z.boolean(),
});

// Upsert the patient's logged actuals for one prescribed set on a given date.
export async function logSet(input: z.infer<typeof logSetSchema>) {
  const parsed = logSetSchema.parse(input);
  const user = await requirePatient();

  await withAuth(user, (sql) =>
    sql`
      INSERT INTO exercise_set_logs
        (clinic_id, patient_id, session_id, set_id, log_date, side, actual_reps, actual_weight, actual_seconds, done)
      VALUES
        (${user.clinicId}, ${user.id}, ${parsed.sessionId}, ${parsed.setId}, ${parsed.logDate}, ${parsed.side},
         ${parsed.actualReps}, ${parsed.actualWeight}, ${parsed.actualSeconds}, ${parsed.done})
      ON CONFLICT (patient_id, set_id, log_date, side) DO UPDATE SET
        actual_reps = EXCLUDED.actual_reps,
        actual_weight = EXCLUDED.actual_weight,
        actual_seconds = EXCLUDED.actual_seconds,
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

const logCardioSchema = z.object({
  sessionId: z.string().uuid(),
  day: z.string().min(1).max(8),
  logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  actualMinutes: z.number().int().min(0).max(1440).nullable(),
  done: z.boolean(),
});

// Upsert the patient's completion + actual minutes for a cardio session (zone2
// / vo2max) on a given date.
export async function logCardioSession(input: z.infer<typeof logCardioSchema>) {
  const parsed = logCardioSchema.parse(input);
  const user = await requirePatient();

  await withAuth(user, (sql) =>
    sql`
      INSERT INTO cardio_session_logs
        (clinic_id, patient_id, session_id, log_date, actual_minutes, done)
      VALUES
        (${user.clinicId}, ${user.id}, ${parsed.sessionId}, ${parsed.logDate},
         ${parsed.actualMinutes}, ${parsed.done})
      ON CONFLICT (patient_id, session_id, log_date) DO UPDATE SET
        actual_minutes = EXCLUDED.actual_minutes,
        done = EXCLUDED.done,
        updated_at = now()
    `
  );

  await recordAudit({
    action: "update",
    entityType: "cardio_session_log",
    entityId: parsed.sessionId,
    patientId: user.id,
    meta: { minutes: parsed.actualMinutes, done: parsed.done, date: parsed.logDate },
  });

  revalidatePath(`/home/training/${parsed.day}`);
}
