"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireClinician } from "@/lib/auth/server";
import { serviceRoleSql } from "@/lib/db/connection";
import { recordAudit } from "@/lib/audit";
import { createCognitoUser, EmailInUseError } from "@/lib/cognito-admin";

const createUserSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().max(254),
  role: z.enum(["patient", "clinician"]),
});

export type CreateUserResult =
  | { ok: true; email: string }
  | { ok: false; error: string };

// Clinician provisions a new account: creates the Cognito user (which emails a
// temp password) then inserts the matching DB rows keyed to the Cognito sub.
// Uses serviceRoleSql because creating another user's profile is an admin
// provisioning step, not a self-scoped write.
export async function createUserAccount(input: z.infer<typeof createUserSchema>): Promise<CreateUserResult> {
  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please fill in name, a valid email, and a role." };
  const { firstName, lastName, email, role } = parsed.data;

  const user = await requireClinician();
  const clinicId = user.clinicId;

  let sub: string;
  try {
    sub = await createCognitoUser({ email: email.toLowerCase(), role, clinicId });
  } catch (err) {
    if (err instanceof EmailInUseError) return { ok: false, error: err.message };
    return { ok: false, error: "Couldn't create the login. Please try again." };
  }

  try {
    // FK target stub (profiles.id → auth.users.id).
    await serviceRoleSql`
      INSERT INTO auth.users (id, email) VALUES (${sub}, ${email.toLowerCase()})
      ON CONFLICT (id) DO NOTHING
    `;
    await serviceRoleSql`
      INSERT INTO public.profiles (id, clinic_id, role, email, first_name, last_name)
      VALUES (${sub}, ${clinicId}, ${role}, ${email.toLowerCase()}, ${firstName.trim()}, ${lastName.trim()})
      ON CONFLICT (id) DO NOTHING
    `;
    if (role === "patient") {
      await serviceRoleSql`
        INSERT INTO public.patient_profiles (profile_id, clinic_id, primary_clinician_id)
        VALUES (${sub}, ${clinicId}, ${user.id})
        ON CONFLICT (profile_id) DO NOTHING
      `;
    } else {
      await serviceRoleSql`
        INSERT INTO public.clinician_profiles (profile_id, clinic_id, title, credentials)
        VALUES (${sub}, ${clinicId}, '', '')
        ON CONFLICT (profile_id) DO NOTHING
      `;
    }
  } catch {
    return { ok: false, error: "Login created, but saving the profile failed. Contact support before retrying." };
  }

  await recordAudit({
    action: "create",
    entityType: role === "patient" ? "patient_profile" : "clinician_profile",
    entityId: sub,
    patientId: role === "patient" ? sub : undefined,
    meta: { email: email.toLowerCase(), role },
  }).catch(() => undefined);

  revalidatePath("/clinician/dashboard");
  return { ok: true, email: email.toLowerCase() };
}
