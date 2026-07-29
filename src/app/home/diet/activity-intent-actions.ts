"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePatient } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { recordAudit } from "@/lib/audit";
import { estimateCustomKcal } from "@/lib/activity-calories";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const KINDS = ["strength", "zone2", "vo2max", "mobility"] as const;

// Set (upsert) the patient's intent status for a PRESCRIBED session on a date.
// expectedKcal is passed from the check-in (the MET estimate we showed them) so
// the goal and the provider view agree on the number.
const prescribedSchema = z.object({
  logDate: z.string().regex(ISO),
  sessionId: z.string().uuid(),
  kind: z.enum(KINDS),
  status: z.enum(["planned", "declined", "done"]),
  expectedKcal: z.number().int().min(0).max(10000),
});

export async function setPrescribedIntent(input: z.infer<typeof prescribedSchema>) {
  const parsed = prescribedSchema.parse(input);
  const user = await requirePatient();

  // Declined rows keep expected_kcal null so they never credit the goal.
  const kcal = parsed.status === "declined" ? null : parsed.expectedKcal;

  await withAuth(user, (sql) =>
    sql`
      INSERT INTO daily_activity_intents
        (clinic_id, patient_id, intent_date, session_id, kind, status, expected_kcal)
      VALUES
        (${user.clinicId}, ${user.id}, ${parsed.logDate}, ${parsed.sessionId}, ${parsed.kind}, ${parsed.status}, ${kcal})
      ON CONFLICT (patient_id, session_id, intent_date) DO UPDATE SET
        status = EXCLUDED.status,
        expected_kcal = EXCLUDED.expected_kcal,
        kind = EXCLUDED.kind,
        updated_at = now()
    `
  );

  await recordAudit({
    action: "update", entityType: "activity_intent", entityId: parsed.sessionId,
    patientId: user.id, meta: { status: parsed.status, kcal, date: parsed.logDate },
  });
  revalidatePath("/home/diet");
}

// Add a custom (off-plan) activity. Either minutes (→MET estimate) or a manual
// kcal figure. At least one must be provided.
const customSchema = z.object({
  logDate: z.string().regex(ISO),
  label: z.string().trim().min(1).max(120),
  minutes: z.number().int().min(0).max(600).nullable(),
  manualKcal: z.number().int().min(0).max(10000).nullable(),
  weightKg: z.number().int().min(0).max(500).nullable(),
});

export async function addCustomIntent(input: z.infer<typeof customSchema>) {
  const parsed = customSchema.parse(input);
  const user = await requirePatient();

  const kcal = parsed.manualKcal != null
    ? parsed.manualKcal
    : parsed.minutes != null
      ? estimateCustomKcal(parsed.weightKg, parsed.minutes)
      : 0;

  await withAuth(user, (sql) =>
    sql`
      INSERT INTO daily_activity_intents
        (clinic_id, patient_id, intent_date, session_id, kind, label, status, expected_kcal, minutes)
      VALUES
        (${user.clinicId}, ${user.id}, ${parsed.logDate}, NULL, 'custom', ${parsed.label}, 'planned', ${kcal}, ${parsed.minutes})
    `
  );

  await recordAudit({
    action: "create", entityType: "activity_intent", entityId: parsed.logDate,
    patientId: user.id, meta: { label: parsed.label, kcal, custom: true },
  });
  revalidatePath("/home/diet");
}

export async function removeCustomIntent(input: { id: string }) {
  const user = await requirePatient();
  await withAuth(user, (sql) =>
    sql`DELETE FROM daily_activity_intents WHERE id = ${input.id} AND patient_id = ${user.id} AND session_id IS NULL`
  );
  await recordAudit({ action: "delete", entityType: "activity_intent", entityId: input.id, patientId: user.id });
  revalidatePath("/home/diet");
}

// Patient opt-in/out of intent-based diet planning.
export async function setActivityPlanning(input: { enabled: boolean }) {
  const user = await requirePatient();
  await withAuth(user, (sql) =>
    sql`UPDATE patient_profiles SET diet_activity_planning = ${input.enabled}, updated_at = now() WHERE profile_id = ${user.id}`
  );
  await recordAudit({ action: "update", entityType: "patient_profile", entityId: user.id, patientId: user.id, meta: { diet_activity_planning: input.enabled } });
  revalidatePath("/home/diet");
}
