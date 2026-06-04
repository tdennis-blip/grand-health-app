"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireClinician } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { recordAudit } from "@/lib/audit";

const refillSchema = z.object({
  medicationId: z.string().uuid(),
  patientId: z.string().uuid(),
  // "set" replaces the on-hand qty; "add" adds to it.
  mode: z.enum(["set", "add"]),
  amount: z.number().min(0).max(100000),
  refillDate: z.string().min(8).max(10).nullish(),     // ISO date; defaults to today
});

export async function recordRefill(input: z.infer<typeof refillSchema>) {
  const parsed = refillSchema.parse(input);
  const user = await requireClinician();

  let newQty = parsed.amount;
  if (parsed.mode === "add") {
    const [current] = await withAuth(user, (sql) =>
      sql`SELECT quantity_on_hand FROM medications WHERE id = ${parsed.medicationId} LIMIT 1`
    );
    const existing = current?.quantity_on_hand == null ? 0 : Number(current.quantity_on_hand);
    newQty = existing + parsed.amount;
  }

  const today = parsed.refillDate ?? new Date().toISOString().slice(0, 10);
  await withAuth(user, (sql) =>
    sql`UPDATE medications SET quantity_on_hand = ${newQty}, last_refill_on = ${today}, updated_at = ${new Date().toISOString()} WHERE id = ${parsed.medicationId}`
  );

  await recordAudit({
    action: "update",
    entityType: "medication_refill",
    entityId: parsed.medicationId,
    patientId: parsed.patientId,
    meta: { mode: parsed.mode, amount: parsed.amount, newQty, on: today },
  });

  revalidatePath(`/clinician/patient/${parsed.patientId}`);
  revalidatePath(`/clinician/patient/${parsed.patientId}/stack`);
  revalidatePath(`/clinician/patient/${parsed.patientId}/stack/history`);
  revalidatePath("/home/stack");
  revalidatePath("/home");
  return { newQty };
}
