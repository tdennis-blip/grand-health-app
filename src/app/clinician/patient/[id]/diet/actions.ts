"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireClinician } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { recordAudit } from "@/lib/audit";

const dietSchema = z.object({
  patientId: z.string().uuid(),
  rmrValue: z.number().int().min(800).max(5000).nullish(),
  rmrMethod: z.string().max(100).nullish(),
  rmrMeasuredOn: z.string().nullish(),   // 'YYYY-MM-DD' or empty
  rmrMeasuredBy: z.string().max(200).nullish(),
  activityMultiplier: z.number().min(1.0).max(2.5),
  deficitKcal: z.number().int().min(-2000).max(2000),
  proteinPerKg: z.number().min(0).max(5),
  carbsPct: z.number().int().min(0).max(100),
  fatPct: z.number().int().min(0).max(100),
  fiberG: z.number().int().min(0).max(150),
  mealsPerDay: z.number().int().min(1).max(8),
  waterL: z.number().min(0).max(10),
  notes: z.string().max(4000).nullish(),
});

export async function upsertDietPlan(input: z.infer<typeof dietSchema>) {
  const parsed = dietSchema.parse(input);
  const user = await requireClinician();

  const [patient] = await withAuth(user, (sql) =>
    sql`SELECT clinic_id FROM patient_profiles WHERE profile_id = ${parsed.patientId} LIMIT 1`
  );
  if (!patient) throw new Error("Patient not found");

  const [before] = await withAuth(user, (sql) =>
    sql`SELECT * FROM diet_plans WHERE patient_id = ${parsed.patientId} LIMIT 1`
  );

  await withAuth(user, (sql) =>
    sql`
      INSERT INTO diet_plans (patient_id, clinic_id, rmr_value, rmr_method, rmr_measured_on, rmr_measured_by,
        activity_multiplier, deficit_kcal, protein_per_kg, carbs_pct, fat_pct, fiber_g, meals_per_day, water_l, notes, updated_at)
      VALUES (${parsed.patientId}, ${patient.clinic_id}, ${parsed.rmrValue ?? null}, ${parsed.rmrMethod ?? null},
        ${parsed.rmrMeasuredOn || null}, ${parsed.rmrMeasuredBy ?? null},
        ${parsed.activityMultiplier.toFixed(2)}, ${parsed.deficitKcal}, ${parsed.proteinPerKg.toFixed(1)},
        ${parsed.carbsPct}, ${parsed.fatPct}, ${parsed.fiberG}, ${parsed.mealsPerDay},
        ${parsed.waterL.toFixed(1)}, ${parsed.notes ?? null}, ${new Date().toISOString()})
      ON CONFLICT (patient_id) DO UPDATE SET
        clinic_id = EXCLUDED.clinic_id, rmr_value = EXCLUDED.rmr_value, rmr_method = EXCLUDED.rmr_method,
        rmr_measured_on = EXCLUDED.rmr_measured_on, rmr_measured_by = EXCLUDED.rmr_measured_by,
        activity_multiplier = EXCLUDED.activity_multiplier, deficit_kcal = EXCLUDED.deficit_kcal,
        protein_per_kg = EXCLUDED.protein_per_kg, carbs_pct = EXCLUDED.carbs_pct, fat_pct = EXCLUDED.fat_pct,
        fiber_g = EXCLUDED.fiber_g, meals_per_day = EXCLUDED.meals_per_day, water_l = EXCLUDED.water_l,
        notes = EXCLUDED.notes, updated_at = EXCLUDED.updated_at
    `
  );

  await recordAudit({
    action: before ? "update" : "create",
    entityType: "diet_plan",
    entityId: parsed.patientId,
    patientId: parsed.patientId,
    meta: { before, after: row },
  });

  revalidatePath(`/clinician/patient/${parsed.patientId}`);
  revalidatePath(`/home/diet`);
  revalidatePath(`/home`);
}
