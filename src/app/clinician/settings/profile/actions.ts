"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireClinician } from "@/lib/auth/server";
import { serviceRoleSql } from "@/lib/db/connection";
import { recordAudit } from "@/lib/audit";

const profileSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  professionalRole: z.string().trim().max(100).nullish(),
  title: z.string().trim().max(100).nullish(),
  credentials: z.string().trim().max(200).nullish(),
});

// Update the signed-in provider's own profile (name + clinician fields).
// Scoped strictly to the caller's id; uses serviceRoleSql so it works
// regardless of clinician_profiles update policies.
export async function updateClinicianProfile(input: z.infer<typeof profileSchema>) {
  const parsed = profileSchema.parse(input);
  const user = await requireClinician();

  await serviceRoleSql`
    UPDATE public.profiles
    SET first_name = ${parsed.firstName}, last_name = ${parsed.lastName}
    WHERE id = ${user.id}
  `;
  await serviceRoleSql`
    UPDATE public.clinician_profiles
    SET professional_role = ${parsed.professionalRole || null},
        title = ${parsed.title || null},
        credentials = ${parsed.credentials || null},
        updated_at = ${new Date().toISOString()}
    WHERE profile_id = ${user.id}
  `;

  await recordAudit({
    action: "update",
    entityType: "clinician_profile",
    entityId: user.id,
    meta: { self: true, fields: Object.keys(parsed) },
  });

  revalidatePath("/clinician/settings/profile");
}

// Sync our DB copies of the email AFTER Cognito has confirmed the change
// (the client does the Cognito updateUserAttributes + confirm dance). We keep
// profiles.email + auth.users.email aligned with the Cognito identity.
const emailSchema = z.object({ email: z.string().email().max(254) });

export async function syncEmailAfterChange(input: z.infer<typeof emailSchema>) {
  const { email } = emailSchema.parse(input);
  const user = await requireClinician();
  const lower = email.toLowerCase();

  await serviceRoleSql`UPDATE public.profiles SET email = ${lower} WHERE id = ${user.id}`;
  await serviceRoleSql`UPDATE auth.users SET email = ${lower} WHERE id = ${user.id}`;

  await recordAudit({
    action: "update",
    entityType: "clinician_profile",
    entityId: user.id,
    meta: { self: true, emailChanged: true },
  });

  revalidatePath("/clinician/settings/profile");
}
