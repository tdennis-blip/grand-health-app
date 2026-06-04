"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePatient } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { recordAudit } from "@/lib/audit";

const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;

const toggleSchema = z.object({
  foodId: z.string().uuid(),
  defaultQuantityG: z.number().min(1).max(5000).nullish(),
  defaultMeal: z.enum(MEALS).nullish(),
});

// Idempotent: if a favorite exists for (patient, food) it's removed; otherwise
// it's created. Returns the new state so the client can flip its UI without
// waiting for a revalidate.
export async function toggleFoodFavorite(
  input: z.infer<typeof toggleSchema>,
): Promise<{ favorited: boolean }> {
  const parsed = toggleSchema.parse(input);
  const user = await requirePatient();

  const [existing] = await withAuth(user, (sql) =>
    sql`SELECT id FROM food_favorites WHERE patient_id = ${user.id} AND food_id = ${parsed.foodId} LIMIT 1`
  );

  if (existing?.id) {
    await withAuth(user, (sql) => sql`DELETE FROM food_favorites WHERE id = ${existing.id}`);
    await recordAudit({
      action: "delete",
      entityType: "food_favorite",
      entityId: existing.id,
      patientId: user.id,
      meta: { foodId: parsed.foodId },
    });
    revalidatePath("/home/diet");
    return { favorited: false };
  }

  const [inserted] = await withAuth(user, (sql) =>
    sql`
      INSERT INTO food_favorites (patient_id, clinic_id, food_id, default_quantity_g, default_meal)
      VALUES (${user.id}, ${user.clinicId}, ${parsed.foodId},
              ${parsed.defaultQuantityG != null ? parsed.defaultQuantityG.toFixed(2) : null},
              ${parsed.defaultMeal ?? null})
      RETURNING id
    `
  );
  if (!inserted) throw new Error("Failed to favorite");

  await recordAudit({
    action: "create",
    entityType: "food_favorite",
    entityId: inserted.id,
    patientId: user.id,
    meta: { foodId: parsed.foodId, defaultQuantityG: parsed.defaultQuantityG ?? null, defaultMeal: parsed.defaultMeal ?? null },
  });

  revalidatePath("/home/diet");
  return { favorited: true };
}

const updateDefaultsSchema = z.object({
  foodId: z.string().uuid(),
  defaultQuantityG: z.number().min(1).max(5000).nullish(),
  defaultMeal: z.enum(MEALS).nullish(),
});

// Tweak a favorite's remembered quantity / meal. No-op if not favorited.
export async function updateFavoriteDefaults(input: z.infer<typeof updateDefaultsSchema>) {
  const parsed = updateDefaultsSchema.parse(input);
  const user = await requirePatient();

  await withAuth(user, (sql) =>
    sql`UPDATE food_favorites SET default_quantity_g = ${parsed.defaultQuantityG != null ? parsed.defaultQuantityG.toFixed(2) : null}, default_meal = ${parsed.defaultMeal ?? null}, updated_at = ${new Date().toISOString()} WHERE patient_id = ${user.id} AND food_id = ${parsed.foodId}`
  );

  revalidatePath("/home/diet");
}
