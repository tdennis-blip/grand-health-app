"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePatient } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { recordAudit } from "@/lib/audit";

const upsertSchema = z.object({
  logDate: z.string().min(8).max(10),    // 'YYYY-MM-DD'
  kcal: z.number().int().min(0).max(15000).nullish(),
  proteinG: z.number().int().min(0).max(1000).nullish(),
  carbsG: z.number().int().min(0).max(2000).nullish(),
  fatG: z.number().int().min(0).max(1000).nullish(),
  fiberG: z.number().int().min(0).max(200).nullish(),
  notes: z.string().max(2000).nullish(),
  // Optional override — used by clinician-entered logs. Defaults to caller.
  patientId: z.string().uuid().optional(),
  source: z.enum(["manual", "in-app", "cronometer", "clinician"]).default("in-app"),
});

export async function upsertFoodLog(input: z.infer<typeof upsertSchema>) {
  const parsed = upsertSchema.parse(input);
  const user = await requirePatient();
  const targetPatientId = parsed.patientId ?? user.id;

  const [patient] = await withAuth(user, (sql) =>
    sql`SELECT clinic_id FROM patient_profiles WHERE profile_id = ${targetPatientId} LIMIT 1`
  );
  if (!patient) throw new Error("Patient not found");

  const [before] = await withAuth(user, (sql) =>
    sql`SELECT * FROM food_logs WHERE patient_id = ${targetPatientId} AND log_date = ${parsed.logDate} LIMIT 1`
  );

  await withAuth(user, (sql) =>
    sql`
      INSERT INTO food_logs (patient_id, clinic_id, log_date, source, kcal, protein_g, carbs_g, fat_g, fiber_g, notes, updated_at)
      VALUES (${targetPatientId}, ${patient.clinic_id}, ${parsed.logDate}, ${parsed.source},
              ${parsed.kcal ?? null}, ${parsed.proteinG ?? null}, ${parsed.carbsG ?? null},
              ${parsed.fatG ?? null}, ${parsed.fiberG ?? null}, ${parsed.notes ?? null}, ${new Date().toISOString()})
      ON CONFLICT (patient_id, log_date) DO UPDATE
        SET source = EXCLUDED.source, kcal = EXCLUDED.kcal, protein_g = EXCLUDED.protein_g,
            carbs_g = EXCLUDED.carbs_g, fat_g = EXCLUDED.fat_g, fiber_g = EXCLUDED.fiber_g,
            notes = EXCLUDED.notes, updated_at = EXCLUDED.updated_at
    `
  );

  await recordAudit({
    action: before ? "update" : "create",
    entityType: "food_log",
    entityId: before?.id ?? null,
    patientId: targetPatientId,
    meta: { before: before ?? null },
  });

  revalidatePath("/home/diet");
  revalidatePath("/home");
  revalidatePath(`/clinician/patient/${targetPatientId}`);
}

export async function deleteFoodLog(input: { logDate: string; patientId?: string }) {
  const user = await requirePatient();
  const targetPatientId = input.patientId ?? user.id;

  const [before] = await withAuth(user, (sql) =>
    sql`SELECT * FROM food_logs WHERE patient_id = ${targetPatientId} AND log_date = ${input.logDate} LIMIT 1`
  );

  await withAuth(user, (sql) =>
    sql`DELETE FROM food_logs WHERE patient_id = ${targetPatientId} AND log_date = ${input.logDate}`
  );

  await recordAudit({
    action: "delete",
    entityType: "food_log",
    entityId: before?.id ?? null,
    patientId: targetPatientId,
    meta: { before },
  });

  revalidatePath("/home/diet");
  revalidatePath(`/clinician/patient/${targetPatientId}`);
}
