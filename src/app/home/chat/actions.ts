"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePatient } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { recordAudit } from "@/lib/audit";

const sendSchema = z.object({
  recipientId: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
});

export async function sendMessage(input: z.infer<typeof sendSchema>) {
  const parsed = sendSchema.parse(input);
  const user = await requirePatient();

  // Recipient must be an ACTIVE clinician in the same clinic. Deactivated
  // clinicians can't open their inbox (RLS blocks them), so a message sent
  // there would silently vanish — a clinical-safety problem if the patient
  // is reporting symptoms.
  const [rcpt] = await withAuth(user, (sql) =>
    sql`
      SELECT p.clinic_id, p.role, cp.deactivated_at
      FROM profiles p
      LEFT JOIN clinician_profiles cp ON cp.profile_id = p.id
      WHERE p.id = ${parsed.recipientId} LIMIT 1
    `
  );
  if (!rcpt || rcpt.role !== "clinician" || rcpt.clinic_id !== user.clinicId) {
    throw new Error("Recipient must be a clinician in your clinic");
  }
  if (rcpt.deactivated_at != null) {
    throw new Error("That clinician is no longer active — please message another member of your care team.");
  }

  const [inserted] = await withAuth(user, (sql) =>
    sql`INSERT INTO messages (clinic_id, patient_id, sender_id, sender_role, recipient_id, body) VALUES (${user.clinicId}, ${user.id}, ${user.id}, 'patient', ${parsed.recipientId}, ${parsed.body}) RETURNING id`
  );
  if (!inserted) throw new Error("Failed to send");

  await recordAudit({
    action: "create",
    entityType: "message",
    entityId: inserted.id,
    patientId: user.id,
    meta: { recipient_id: parsed.recipientId, chars: parsed.body.length },
  });

  revalidatePath("/home/chat");
  revalidatePath(`/clinician/messages/${user.id}`);
  revalidatePath("/clinician/messages");
}

export async function markThreadRead() {
  let user;
  try { user = await requirePatient(); } catch { return; }

  await withAuth(user, (sql) =>
    sql`UPDATE messages SET recipient_read_at = ${new Date().toISOString()} WHERE patient_id = ${user.id} AND recipient_id = ${user.id} AND recipient_read_at IS NULL`
  );

  revalidatePath("/home/chat");
}
