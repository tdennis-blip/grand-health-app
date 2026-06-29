"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePatient } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { recordAudit } from "@/lib/audit";

const schema = z.object({ mode: z.enum(["tracking", "targets"]) });

// Patient sets their own diet screen mode (tracking vs targets-only).
export async function setDietViewMode(input: z.infer<typeof schema>) {
  const { mode } = schema.parse(input);
  const user = await requirePatient();

  await withAuth(user, (sql) =>
    sql`UPDATE patient_profiles SET diet_view_mode = ${mode} WHERE profile_id = ${user.id}`
  );

  await recordAudit({
    action: "update",
    entityType: "patient_profile",
    entityId: user.id,
    patientId: user.id,
    meta: { dietViewMode: mode },
  });

  revalidatePath("/home/diet");
  revalidatePath("/home");
}
