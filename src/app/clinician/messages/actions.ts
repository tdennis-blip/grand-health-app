"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireClinician } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { recordAudit } from "@/lib/audit";

const sendSchema = z.object({
  patientId: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
});

export async function sendMessageToPatient(input: z.infer<typeof sendSchema>) {
  const parsed = sendSchema.parse(input);
  const user = await requireClinician();

  // Verify patient is in my clinic.
  const [pp] = await withAuth(user, (sql) =>
    sql`SELECT clinic_id FROM patient_profiles WHERE profile_id = ${parsed.patientId} LIMIT 1`
  );
  if (!pp || pp.clinic_id !== user.clinicId) throw new Error("Patient not in your clinic");

  const [inserted] = await withAuth(user, (sql) =>
    sql`INSERT INTO messages (clinic_id, patient_id, sender_id, sender_role, recipient_id, body) VALUES (${user.clinicId}, ${parsed.patientId}, ${user.id}, 'clinician', ${parsed.patientId}, ${parsed.body}) RETURNING id`
  );
  if (!inserted) throw new Error("Failed to send");

  await recordAudit({
    action: "create",
    entityType: "message",
    entityId: inserted.id,
    patientId: parsed.patientId,
    meta: { recipient_id: parsed.patientId, chars: parsed.body.length },
  });

  revalidatePath(`/clinician/messages/${parsed.patientId}`);
  revalidatePath("/clinician/messages");
  revalidatePath("/home/chat");
}

const readSchema = z.object({
  patientId: z.string().uuid(),
});

// Mark every message in this patient's thread that was addressed to me as read.
export async function markThreadRead(input: z.infer<typeof readSchema>) {
  const parsed = readSchema.parse(input);
  let user; try { user = await requireClinician(); } catch { return; }

  await withAuth(user, (sql) =>
    sql`UPDATE messages SET recipient_read_at = ${new Date().toISOString()} WHERE patient_id = ${parsed.patientId} AND recipient_id = ${user.id} AND recipient_read_at IS NULL`
  );

  revalidatePath(`/clinician/messages/${parsed.patientId}`);
  revalidatePath("/clinician/messages");
}
