"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePatient } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { recordAudit } from "@/lib/audit";

const markSchema = z.object({
  doseId: z.string().uuid(),
  scheduledFor: z.string().min(8).max(10),
});

// Mark a dose taken for a given local date. Idempotent — if it's already
// marked, returns silently.
export async function markDoseTaken(input: z.infer<typeof markSchema>) {
  const parsed = markSchema.parse(input);
  const user = await requirePatient();

  const [dose] = await withAuth(user, (sql) =>
    sql`SELECT id, clinic_id, patient_id, medication_id FROM medication_doses WHERE id = ${parsed.doseId} LIMIT 1`
  );
  if (!dose) throw new Error("Dose not found");

  const [inserted] = await withAuth(user, (sql) =>
    sql`
      INSERT INTO medication_dose_logs (clinic_id, patient_id, medication_id, dose_id, scheduled_for, taken_at, recorded_by, recorded_role)
      VALUES (${dose.clinic_id}, ${dose.patient_id}, ${dose.medication_id}, ${dose.id}, ${parsed.scheduledFor}, ${new Date().toISOString()}, ${user.id}, ${user.role})
      ON CONFLICT (dose_id, scheduled_for) DO UPDATE SET taken_at = EXCLUDED.taken_at, recorded_by = EXCLUDED.recorded_by
      RETURNING id
    `
  );
  if (!inserted) throw new Error("Failed to record dose");

  await recordAudit({
    action: "create",
    entityType: "medication_dose_log",
    entityId: inserted.id,
    patientId: dose.patient_id,
    meta: { doseId: dose.id, scheduledFor: parsed.scheduledFor },
  });

  revalidatePath("/home/stack");
  revalidatePath("/home");
  revalidatePath(`/clinician/patient/${dose.patient_id}`);
  revalidatePath(`/clinician/patient/${dose.patient_id}/stack`);
}

// Undo a check-off (delete the log row for the day).
export async function unmarkDoseTaken(input: z.infer<typeof markSchema>) {
  const parsed = markSchema.parse(input);
  const user = await requirePatient();

  const [existing] = await withAuth(user, (sql) =>
    sql`SELECT id, patient_id FROM medication_dose_logs WHERE dose_id = ${parsed.doseId} AND scheduled_for = ${parsed.scheduledFor} LIMIT 1`
  );
  if (!existing) {
    revalidatePath("/home/stack");
    revalidatePath("/home");
    return;
  }

  await withAuth(user, (sql) =>
    sql`DELETE FROM medication_dose_logs WHERE id = ${existing.id}`
  );

  await recordAudit({
    action: "delete",
    entityType: "medication_dose_log",
    entityId: existing.id,
    patientId: existing.patient_id,
    meta: { doseId: parsed.doseId, scheduledFor: parsed.scheduledFor },
  });

  revalidatePath("/home/stack");
  revalidatePath("/home");
  revalidatePath(`/clinician/patient/${existing.patient_id}`);
  revalidatePath(`/clinician/patient/${existing.patient_id}/stack`);
}
