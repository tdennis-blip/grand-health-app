"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePatient } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { recordAudit } from "@/lib/audit";

const requestSchema = z.object({
  medicationId: z.string().uuid(),
  // Optional patient-supplied note appended to the message.
  note: z.string().trim().max(500).nullish(),
});

// Patient asks their care team for a refill.
export async function requestRefill(input: z.infer<typeof requestSchema>) {
  const parsed = requestSchema.parse(input);
  const user = await requirePatient();

  const [[patient], [med]] = await Promise.all([
    withAuth(user, (sql) =>
      sql`SELECT primary_clinician_id FROM patient_profiles WHERE profile_id = ${user.id} LIMIT 1`
    ),
    withAuth(user, (sql) =>
      sql`SELECT id, name, dose, patient_id, quantity_on_hand, last_refill_on FROM medications WHERE id = ${parsed.medicationId} LIMIT 1`
    ),
  ]);
  if (!med) throw new Error("Medication not found");
  if (med.patient_id !== user.id) throw new Error("Not your medication");

  let recipientId = patient?.primary_clinician_id ?? null;
  if (!recipientId) {
    const [anyClin] = await withAuth(user, (sql) =>
      sql`SELECT id FROM profiles WHERE clinic_id = ${user.clinicId} AND role = 'clinician' ORDER BY last_name ASC LIMIT 1`
    );
    recipientId = anyClin?.id ?? null;
  }
  if (!recipientId) throw new Error("No clinician available to receive your request");

  const bodyLines: string[] = [];
  bodyLines.push(`Refill request: ${med.name}${med.dose ? " · " + med.dose : ""}`);
  if (med.quantity_on_hand != null) bodyLines.push(`On hand: ${Number(med.quantity_on_hand)}`);
  if (med.last_refill_on) bodyLines.push(`Last refill: ${med.last_refill_on}`);
  if (parsed.note) { bodyLines.push(""); bodyLines.push(parsed.note); }
  const body = bodyLines.join("\n");

  const [inserted] = await withAuth(user, (sql) =>
    sql`INSERT INTO messages (clinic_id, patient_id, sender_id, sender_role, recipient_id, body) VALUES (${user.clinicId}, ${user.id}, ${user.id}, 'patient', ${recipientId}, ${body}) RETURNING id`
  );
  if (!inserted) throw new Error("Failed to send");

  await recordAudit({
    action: "create",
    entityType: "medication_refill_request",
    entityId: parsed.medicationId,
    patientId: user.id,
    meta: { messageId: inserted.id, recipientId },
  });

  revalidatePath("/home/stack");
  revalidatePath("/home/chat");
  revalidatePath(`/clinician/messages/${user.id}`);
  revalidatePath("/clinician/messages");
}
