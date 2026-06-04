"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePatient } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { recordAudit } from "@/lib/audit";

// All nutrient values are per 100g.
const nutrientSchema = z.object({
  kcal: z.number().min(0).max(2000).nullish(),
  proteinG: z.number().min(0).max(200).nullish(),
  carbsG: z.number().min(0).max(200).nullish(),
  fatG: z.number().min(0).max(200).nullish(),
  fiberG: z.number().min(0).max(100).nullish(),
  vitaminDIu: z.number().min(0).max(20000).nullish(),
  vitaminB12Ug: z.number().min(0).max(1000).nullish(),
  ironMg: z.number().min(0).max(500).nullish(),
  magnesiumMg: z.number().min(0).max(2000).nullish(),
  calciumMg: z.number().min(0).max(5000).nullish(),
  potassiumMg: z.number().min(0).max(10000).nullish(),
  sodiumMg: z.number().min(0).max(10000).nullish(),
  omega3Mg: z.number().min(0).max(50000).nullish(),
});

const createSchema = z.object({
  name: z.string().min(1).max(200),
  brand: z.string().max(200).nullish(),
  category: z.string().max(200).nullish(),
  barcode: z.string().max(32).nullish(),
  nutrients: nutrientSchema,
});

const numOrNull = (n: number | null | undefined) => (n == null ? null : Number(n.toFixed(2)));

// Returns the new foods.id so the caller can chain into addEntry / favorite.
export async function createCustomFood(input: z.infer<typeof createSchema>): Promise<{ id: string }> {
  const parsed = createSchema.parse(input);
  const user = await requirePatient();
  const cleanedBarcode = parsed.barcode ? parsed.barcode.replace(/\D/g, "") || null : null;

  const [inserted] = await withAuth(user, (sql) =>
    sql`
      INSERT INTO foods (source, source_id, name, brand, category, barcode, clinic_id, created_by,
        kcal_per_100, protein_g_per_100, carbs_g_per_100, fat_g_per_100, fiber_g_per_100,
        vitamin_d_iu_per_100, vitamin_b12_ug_per_100, iron_mg_per_100, magnesium_mg_per_100,
        calcium_mg_per_100, potassium_mg_per_100, sodium_mg_per_100, omega3_mg_per_100)
      VALUES ('custom', ${null}, ${parsed.name.trim()}, ${parsed.brand?.trim() || null},
        ${parsed.category?.trim() || null}, ${cleanedBarcode}, ${user.clinicId}, ${user.id},
        ${numOrNull(parsed.nutrients.kcal)}, ${numOrNull(parsed.nutrients.proteinG)},
        ${numOrNull(parsed.nutrients.carbsG)}, ${numOrNull(parsed.nutrients.fatG)},
        ${numOrNull(parsed.nutrients.fiberG)}, ${numOrNull(parsed.nutrients.vitaminDIu)},
        ${numOrNull(parsed.nutrients.vitaminB12Ug)}, ${numOrNull(parsed.nutrients.ironMg)},
        ${numOrNull(parsed.nutrients.magnesiumMg)}, ${numOrNull(parsed.nutrients.calciumMg)},
        ${numOrNull(parsed.nutrients.potassiumMg)}, ${numOrNull(parsed.nutrients.sodiumMg)},
        ${numOrNull(parsed.nutrients.omega3Mg)})
      RETURNING id
    `
  );
  if (!inserted) throw new Error("Failed to create custom food");

  await recordAudit({
    action: "create",
    entityType: "food",
    entityId: inserted.id,
    meta: { source: "custom", name: parsed.name, brand: parsed.brand ?? null, barcode: cleanedBarcode },
  });

  revalidatePath("/home/diet");
  return { id: inserted.id };
}
