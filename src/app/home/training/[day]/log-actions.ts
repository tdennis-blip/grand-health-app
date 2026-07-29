"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePatient } from "@/lib/auth/server";
import { withAuth, serviceRoleSql } from "@/lib/db/connection";
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

// ── End-of-workout feedback: RPE (1–10) + optional comment/question ─────────
const feedbackSchema = z.object({
  sessionId: z.string().uuid(),
  sessionName: z.string().max(200).optional(),
  day: z.string().min(1).max(8),
  logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rpe: z.number().int().min(1).max(10).nullable(),
  comment: z.string().trim().max(4000).nullable(),
});

// Resolve the patient's trainer to message: their primary clinician if set,
// else the first active clinician on their care team. Uses the service role
// so the lookup isn't blocked by patient-scoped RLS.
async function resolveTrainer(patientId: string): Promise<string | null> {
  const [prof] = await serviceRoleSql<{ primary_clinician_id: string | null }[]>`
    SELECT pp.primary_clinician_id
    FROM public.patient_profiles pp
    LEFT JOIN public.clinician_profiles cp ON cp.profile_id = pp.primary_clinician_id
    WHERE pp.profile_id = ${patientId}
      AND cp.deactivated_at IS NULL
    LIMIT 1
  `;
  if (prof?.primary_clinician_id) return prof.primary_clinician_id;

  const [ct] = await serviceRoleSql<{ clinician_id: string }[]>`
    SELECT ct.clinician_id
    FROM public.patient_care_team ct
    JOIN public.clinician_profiles cp ON cp.profile_id = ct.clinician_id
    WHERE ct.patient_id = ${patientId}
      AND cp.deactivated_at IS NULL
    ORDER BY ct.created_at ASC NULLS LAST
    LIMIT 1
  `;
  return ct?.clinician_id ?? null;
}

export async function saveWorkoutFeedback(input: z.infer<typeof feedbackSchema>) {
  const parsed = feedbackSchema.parse(input);
  const user = await requirePatient();

  await withAuth(user, (sql) =>
    sql`
      INSERT INTO session_feedback_logs
        (clinic_id, patient_id, session_id, log_date, rpe, comment)
      VALUES
        (${user.clinicId}, ${user.id}, ${parsed.sessionId}, ${parsed.logDate}, ${parsed.rpe}, ${parsed.comment})
      ON CONFLICT (patient_id, session_id, log_date) DO UPDATE SET
        rpe = EXCLUDED.rpe,
        comment = EXCLUDED.comment,
        updated_at = now()
    `
  );

  // If the client left a comment/question, forward it to their trainer as an
  // in-app message so it lands in the clinician inbox.
  let messaged = false;
  if (parsed.comment && parsed.comment.length > 0) {
    const trainerId = await resolveTrainer(user.id);
    if (trainerId) {
      const label = parsed.sessionName ? `“${parsed.sessionName}”` : "today’s workout";
      const rpeLine = parsed.rpe != null ? `RPE ${parsed.rpe}/10. ` : "";
      const body = `[Workout feedback · ${parsed.logDate}] ${label}\n${rpeLine}${parsed.comment}`;
      await serviceRoleSql`
        INSERT INTO public.messages (clinic_id, patient_id, sender_id, sender_role, recipient_id, body)
        VALUES (${user.clinicId}, ${user.id}, ${user.id}, 'patient', ${trainerId}, ${body})
      `;
      messaged = true;
      revalidatePath(`/clinician/messages/${user.id}`);
      revalidatePath("/clinician/messages");
      revalidatePath("/home/chat");
    }
  }

  await recordAudit({
    action: "create",
    entityType: "session_feedback_log",
    entityId: parsed.sessionId,
    patientId: user.id,
    meta: { rpe: parsed.rpe, has_comment: !!parsed.comment, messaged, date: parsed.logDate },
  });

  revalidatePath(`/home/training/${parsed.day}`);
  return { messaged };
}

// ── Patient ad-hoc activity (workouts not in the prescribed program) ────────
const addActivitySchema = z.object({
  day: z.string().min(1).max(8),
  logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(["zone2", "vo2max", "cardio", "strength", "mobility"]),
  name: z.string().min(1).max(200),
  minutes: z.number().int().min(0).max(1440).nullable().default(null),
  sets: z
    .array(
      z.object({
        reps: z.number().int().min(0).max(100000).nullable(),
        weight: z.number().int().min(0).max(100000).nullable(),
        durationSeconds: z.number().int().min(0).max(100000).nullable(),
      })
    )
    .max(50)
    .default([]),
});

export async function addPatientActivity(input: z.infer<typeof addActivitySchema>) {
  const parsed = addActivitySchema.parse(input);
  const user = await requirePatient();

  const [activity] = await withAuth(user, (sql) =>
    sql`
      INSERT INTO patient_activities (clinic_id, patient_id, log_date, kind, name, minutes)
      VALUES (${user.clinicId}, ${user.id}, ${parsed.logDate}, ${parsed.kind}, ${parsed.name.trim()}, ${parsed.minutes})
      RETURNING id
    `
  );
  if (!activity) throw new Error("Could not save activity");

  if (parsed.sets.length > 0) {
    for (let i = 0; i < parsed.sets.length; i++) {
      const s = parsed.sets[i];
      await withAuth(user, (sql) =>
        sql`
          INSERT INTO patient_activity_sets (activity_id, set_number, reps, weight, duration_seconds)
          VALUES (${activity.id}, ${i + 1}, ${s.reps}, ${s.weight}, ${s.durationSeconds})
        `
      );
    }
  }

  await recordAudit({
    action: "create",
    entityType: "patient_activity",
    entityId: activity.id,
    patientId: user.id,
    meta: { kind: parsed.kind, name: parsed.name, minutes: parsed.minutes, sets: parsed.sets.length, date: parsed.logDate },
  });

  revalidatePath(`/home/training/${parsed.day}`);
  revalidatePath(`/home/training`);
  revalidatePath(`/home`);
}

export async function deletePatientActivity(input: { id: string; day: string }) {
  const user = await requirePatient();
  await withAuth(user, (sql) =>
    sql`DELETE FROM patient_activities WHERE id = ${input.id} AND patient_id = ${user.id}`
  );
  await recordAudit({ action: "delete", entityType: "patient_activity", entityId: input.id, patientId: user.id });
  revalidatePath(`/home/training/${input.day}`);
  revalidatePath(`/home/training`);
  revalidatePath(`/home`);
}
