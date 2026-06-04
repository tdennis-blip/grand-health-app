"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePatient } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { recordAudit } from "@/lib/audit";

const SEXES = ["male", "female", "other", "prefer-not-to-say"] as const;

const profileSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  dob: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "DOB must be YYYY-MM-DD")
    .nullish(),
  sex: z.enum(SEXES).nullish(),
  heightCm: z.number().int().min(100).max(250).nullish(),
  weightKg: z.number().int().min(30).max(300).nullish(),
  dietaryPreferences: z.string().max(1000).nullish(),
});

export async function updateMyProfile(input: z.infer<typeof profileSchema>) {
  const parsed = profileSchema.parse(input);
  const user = await requirePatient();
  const now = new Date().toISOString();

  const [[beforeProfile], [beforePp]] = await Promise.all([
    withAuth(user, (sql) => sql`SELECT first_name, last_name FROM profiles WHERE id = ${user.id} LIMIT 1`),
    withAuth(user, (sql) => sql`SELECT date_of_birth, sex, height_cm, weight_kg FROM patient_profiles WHERE profile_id = ${user.id} LIMIT 1`),
  ]);

  await withAuth(user, (sql) =>
    sql`UPDATE profiles SET first_name = ${parsed.firstName.trim()}, last_name = ${parsed.lastName.trim()}, updated_at = ${now} WHERE id = ${user.id}`
  );

  await withAuth(user, (sql) =>
    sql`UPDATE patient_profiles SET date_of_birth = ${parsed.dob ?? null}, sex = ${parsed.sex ?? null}, height_cm = ${parsed.heightCm ?? null}, weight_kg = ${parsed.weightKg ?? null}, dietary_preferences = ${parsed.dietaryPreferences?.trim() || null}, updated_at = ${now} WHERE profile_id = ${user.id}`
  );

  await recordAudit({
    action: "update",
    entityType: "patient_profile",
    entityId: user.id,
    patientId: user.id,
    meta: {
      before: { ...(beforeProfile ?? {}), ...(beforePp ?? {}) },
    },
  });

  // Anything that derives from weight (diet targets) or DOB (Grand 100 age).
  revalidatePath("/home/profile");
  revalidatePath("/home");
  revalidatePath("/home/diet");
  revalidatePath("/home/grand100");
}
