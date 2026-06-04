"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePatient } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { recordAudit } from "@/lib/audit";

const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;

const usdaFoodSchema = z.object({
  fdcId: z.number().int(),
  name: z.string().min(1).max(300),
  brand: z.string().max(200).nullish(),
  category: z.string().max(200).nullish(),
  barcode: z.string().max(32).nullish(),
  nutrients: z.object({
    kcal: z.number().nullish(),
    proteinG: z.number().nullish(),
    carbsG: z.number().nullish(),
    fatG: z.number().nullish(),
    fiberG: z.number().nullish(),
    vitaminDIu: z.number().nullish(),
    vitaminB12Ug: z.number().nullish(),
    ironMg: z.number().nullish(),
    magnesiumMg: z.number().nullish(),
    calciumMg: z.number().nullish(),
    potassiumMg: z.number().nullish(),
    sodiumMg: z.number().nullish(),
    omega3Mg: z.number().nullish(),
  }),
});

const addEntrySchema = z.object({
  logDate: z.string().min(8).max(10),
  meal: z.enum(MEALS),
  quantityG: z.number().min(1).max(5000),
  notes: z.string().max(500).nullish(),
  food: usdaFoodSchema,
});

import type { AuthUser } from "@/lib/auth/server";

async function ensureFoodLog(user: AuthUser, patientId: string, logDate: string): Promise<string> {
  const [patient] = await withAuth(user, (sql) =>
    sql`SELECT clinic_id FROM patient_profiles WHERE profile_id = ${patientId} LIMIT 1`
  );
  if (!patient) throw new Error("Patient not found");

  const [existing] = await withAuth(user, (sql) =>
    sql`SELECT id FROM food_logs WHERE patient_id = ${patientId} AND log_date = ${logDate} LIMIT 1`
  );
  if (existing?.id) return existing.id as string;

  const [inserted] = await withAuth(user, (sql) =>
    sql`INSERT INTO food_logs (patient_id, clinic_id, log_date, source) VALUES (${patientId}, ${patient.clinic_id}, ${logDate}, 'in-app') RETURNING id`
  );
  if (!inserted) throw new Error("Failed to create food log");
  return inserted.id as string;
}

async function ensureFood(user: AuthUser, food: z.infer<typeof usdaFoodSchema>): Promise<string> {
  const [existing] = await withAuth(user, (sql) =>
    sql`SELECT id FROM foods WHERE source = 'usda' AND source_id = ${String(food.fdcId)} LIMIT 1`
  );
  if (existing?.id) return existing.id as string;

  const numOrNull = (n: number | null | undefined) => (n == null ? null : Number(n.toFixed(2)));
  const [inserted] = await withAuth(user, (sql) =>
    sql`
      INSERT INTO foods (source, source_id, name, brand, category, barcode,
        kcal_per_100, protein_g_per_100, carbs_g_per_100, fat_g_per_100, fiber_g_per_100,
        vitamin_d_iu_per_100, vitamin_b12_ug_per_100, iron_mg_per_100, magnesium_mg_per_100,
        calcium_mg_per_100, potassium_mg_per_100, sodium_mg_per_100, omega3_mg_per_100)
      VALUES ('usda', ${String(food.fdcId)}, ${food.name}, ${food.brand ?? null}, ${food.category ?? null}, ${food.barcode ?? null},
        ${numOrNull(food.nutrients.kcal)}, ${numOrNull(food.nutrients.proteinG)}, ${numOrNull(food.nutrients.carbsG)},
        ${numOrNull(food.nutrients.fatG)}, ${numOrNull(food.nutrients.fiberG)},
        ${numOrNull(food.nutrients.vitaminDIu)}, ${numOrNull(food.nutrients.vitaminB12Ug)},
        ${numOrNull(food.nutrients.ironMg)}, ${numOrNull(food.nutrients.magnesiumMg)},
        ${numOrNull(food.nutrients.calciumMg)}, ${numOrNull(food.nutrients.potassiumMg)},
        ${numOrNull(food.nutrients.sodiumMg)}, ${numOrNull(food.nutrients.omega3Mg)})
      RETURNING id
    `
  );
  if (!inserted) throw new Error("Failed to import food");
  return inserted.id as string;
}

export async function addFoodLogEntry(input: z.infer<typeof addEntrySchema>) {
  const parsed = addEntrySchema.parse(input);
  const user = await requirePatient();

  const logId = await ensureFoodLog(user, user.id, parsed.logDate);
  const foodId = await ensureFood(user, parsed.food);

  const [inserted] = await withAuth(user, (sql) =>
    sql`INSERT INTO food_log_entries (food_log_id, food_id, meal, quantity_g, notes) VALUES (${logId}, ${foodId}, ${parsed.meal}, ${parsed.quantityG.toFixed(2)}, ${parsed.notes ?? null}) RETURNING id`
  );
  if (!inserted) throw new Error("Failed to add entry");

  await recordAudit({
    action: "create",
    entityType: "food_log_entry",
    entityId: inserted.id,
    patientId: user.id,
    meta: { meal: parsed.meal, quantityG: parsed.quantityG, foodName: parsed.food.name },
  });

  revalidatePath("/home/diet");
  revalidatePath("/home");
}

export async function removeFoodLogEntry(input: { id: string }) {
  const user = await requirePatient();

  const [before] = await withAuth(user, (sql) =>
    sql`SELECT id, meal, quantity_g, food_id FROM food_log_entries WHERE id = ${input.id} LIMIT 1`
  );

  await withAuth(user, (sql) =>
    sql`DELETE FROM food_log_entries WHERE id = ${input.id}`
  );

  await recordAudit({
    action: "delete",
    entityType: "food_log_entry",
    entityId: input.id,
    patientId: user.id,
    meta: { before },
  });

  revalidatePath("/home/diet");
  revalidatePath("/home");
}

// Quick-add from a known foods.id — used by favorites / recent strip and
// barcode hits that re-resolve to a row we've already cached.
const quickAddSchema = z.object({
  logDate: z.string().min(8).max(10),
  meal: z.enum(MEALS),
  quantityG: z.number().min(1).max(5000),
  foodId: z.string().uuid(),
  notes: z.string().max(500).nullish(),
});

export async function quickAddFoodLogEntry(input: z.infer<typeof quickAddSchema>) {
  const parsed = quickAddSchema.parse(input);
  const user = await requirePatient();

  const [food] = await withAuth(user, (sql) =>
    sql`SELECT id, name FROM foods WHERE id = ${parsed.foodId} LIMIT 1`
  );
  if (!food) throw new Error("Food not found");

  const logId = await ensureFoodLog(user, user.id, parsed.logDate);

  const [inserted] = await withAuth(user, (sql) =>
    sql`INSERT INTO food_log_entries (food_log_id, food_id, meal, quantity_g, notes) VALUES (${logId}, ${parsed.foodId}, ${parsed.meal}, ${parsed.quantityG.toFixed(2)}, ${parsed.notes ?? null}) RETURNING id`
  );
  if (!inserted) throw new Error("Failed to add entry");

  await recordAudit({
    action: "create",
    entityType: "food_log_entry",
    entityId: inserted.id,
    patientId: user.id,
    meta: { meal: parsed.meal, quantityG: parsed.quantityG, foodId: parsed.foodId, foodName: food.name, via: "quick-add" },
  });

  // Bump the favorite's updated_at if this is a favorite.
  await withAuth(user, (sql) =>
    sql`UPDATE food_favorites SET updated_at = ${new Date().toISOString()} WHERE patient_id = ${user.id} AND food_id = ${parsed.foodId}`
  );

  revalidatePath("/home/diet");
  revalidatePath("/home");
}

export async function updateFoodLogEntry(input: { id: string; quantityG: number; meal: typeof MEALS[number] }) {
  const user = await requirePatient();

  await withAuth(user, (sql) =>
    sql`UPDATE food_log_entries SET quantity_g = ${input.quantityG.toFixed(2)}, meal = ${input.meal} WHERE id = ${input.id}`
  );

  await recordAudit({
    action: "update",
    entityType: "food_log_entry",
    entityId: input.id,
    patientId: user.id,
    meta: { quantityG: input.quantityG, meal: input.meal },
  });

  revalidatePath("/home/diet");
  revalidatePath("/home");
}
