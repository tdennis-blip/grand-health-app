"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireClinician } from "@/lib/auth/server";
import { serviceRoleSql } from "@/lib/db/connection";
import { recordAudit } from "@/lib/audit";
import { isAdminClinician } from "@/lib/care-team";
import { seedDefaultPillars } from "@/lib/default-pillars";
import { createCognitoUser, deleteCognitoUser, EmailInUseError } from "@/lib/cognito-admin";

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

  // Staff accounts are an admin-only provision. Any clinician may add
  // patients, but minting new clinician logins (clinic-wide profile reads,
  // libraries, etc.) must go through an admin.
  if (role === "clinician" && !(await isAdminClinician(user.id))) {
    return { ok: false, error: "Only administrators can create staff accounts." };
  }

  let sub: string;
  try {
    sub = await createCognitoUser({ email: email.toLowerCase(), role, clinicId });
  } catch (err) {
    if (err instanceof EmailInUseError) return { ok: false, error: err.message };
    return { ok: false, error: "Couldn't create the login. Please try again." };
  }

  try {
    // Only set primary_clinician_id if the creating clinician actually has a
    // profile row (the FK requires it) — otherwise leave it null.
    const [clin] = await serviceRoleSql`SELECT id FROM public.profiles WHERE id = ${user.id} LIMIT 1`;
    const primaryClinicianId = clin ? user.id : null;

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
        VALUES (${sub}, ${clinicId}, ${primaryClinicianId})
        ON CONFLICT (profile_id) DO NOTHING
      `;
      // Auto-add the creating clinician to the new patient's care team UNLESS
      // they're an admin (admins see everyone and want to join explicitly).
      if (primaryClinicianId && !(await isAdminClinician(user.id))) {
        await serviceRoleSql`
          INSERT INTO public.patient_care_team (clinic_id, patient_id, clinician_id, added_by)
          VALUES (${clinicId}, ${sub}, ${user.id}, ${user.id})
          ON CONFLICT (patient_id, clinician_id) DO NOTHING
        `;
      }
      // Give the new patient the default pillars + starter factors.
      await seedDefaultPillars(clinicId, sub).catch(() => undefined);
    } else {
      await serviceRoleSql`
        INSERT INTO public.clinician_profiles (profile_id, clinic_id, title, credentials)
        VALUES (${sub}, ${clinicId}, '', '')
        ON CONFLICT (profile_id) DO NOTHING
      `;
    }
  } catch {
    // Roll back the Cognito user so a failed DB write doesn't leave an orphan
    // that blocks recreating the same email.
    await deleteCognitoUser(email.toLowerCase()).catch(() => undefined);
    return { ok: false, error: "Couldn't save the account. Nothing was created — please try again." };
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

// Deactivate (soft-delete) or reactivate a patient. This is the default way
// to "remove" a patient: the login stops working (requireUser + RLS, 0036)
// but the medical record is retained, as HIPAA/state retention rules expect.
// Admin-only, mirroring staff deactivation.
export async function setPatientActive(
  input: { patientId: string; active: boolean }
): Promise<{ ok: boolean; error?: string }> {
  const parsed = z.object({ patientId: z.string().uuid(), active: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid patient." };
  const { patientId, active } = parsed.data;

  const user = await requireClinician();
  if (!(await isAdminClinician(user.id))) {
    return { ok: false, error: "Only administrators can deactivate or reactivate patients." };
  }

  const [target] = await serviceRoleSql<{ clinic_id: string; deactivated_at: string | null }[]>`
    SELECT clinic_id, deactivated_at FROM public.patient_profiles
    WHERE profile_id = ${patientId} LIMIT 1
  `;
  if (!target) return { ok: false, error: "Patient not found." };
  if (target.clinic_id !== user.clinicId) return { ok: false, error: "Not in your clinic." };
  if ((target.deactivated_at === null) === active) return { ok: true }; // no-op

  await serviceRoleSql`
    UPDATE public.patient_profiles
    SET deactivated_at = ${active ? null : new Date().toISOString()}
    WHERE profile_id = ${patientId} AND clinic_id = ${user.clinicId}
  `;

  // Also disable/re-enable the Cognito login (best-effort — the DB flag is
  // authoritative and requireUser/RLS already fence deactivated patients).
  try {
    const [prof] = await serviceRoleSql<{ email: string }[]>`
      SELECT email FROM public.profiles WHERE id = ${patientId} LIMIT 1
    `;
    if (prof?.email) {
      const { setCognitoUserEnabled } = await import("@/lib/cognito-admin");
      await setCognitoUserEnabled(prof.email, active);
    }
  } catch (err) {
    console.error("setPatientActive: Cognito enable/disable failed", { patientId, active, err });
  }

  await recordAudit({
    action: "update",
    entityType: "patient_deactivation",
    entityId: patientId,
    patientId,
    meta: { active },
  }).catch(() => undefined);

  revalidatePath("/clinician/dashboard");
  revalidatePath(`/clinician/patient/${patientId}`);
  return { ok: true };
}

// Permanently removes a patient: their messages, profile (cascades all PHI),
// and Cognito login. ADMIN-ONLY and a last resort (e.g. test accounts, or a
// verified patient request) — for routine offboarding use setPatientActive,
// which preserves the record for retention requirements.
export async function deletePatientAccount(input: { patientId: string }): Promise<{ ok: boolean; error?: string }> {
  const id = z.string().uuid().safeParse(input.patientId);
  if (!id.success) return { ok: false, error: "Invalid patient." };
  const patientId = id.data;

  const user = await requireClinician();
  if (!(await isAdminClinician(user.id))) {
    return { ok: false, error: "Only administrators can permanently delete a patient." };
  }

  // Confirm the target is a patient in this clinician's clinic.
  const [target] = await serviceRoleSql<{ email: string; role: string; clinic_id: string }[]>`
    SELECT email, role, clinic_id FROM public.profiles WHERE id = ${patientId} LIMIT 1
  `;
  if (!target) return { ok: false, error: "Patient not found." };
  if (target.clinic_id !== user.clinicId) return { ok: false, error: "Not in your clinic." };
  if (target.role !== "patient") return { ok: false, error: "Only patient accounts can be removed here." };

  try {
    // messages FKs are RESTRICT, so clear them before the cascading profile delete.
    await serviceRoleSql`
      DELETE FROM public.messages
      WHERE patient_id = ${patientId} OR sender_id = ${patientId} OR recipient_id = ${patientId}
    `;
    // Delete medications explicitly FIRST, while the profile still exists.
    // The log_medication_change() trigger inserts a "delete" row into
    // medication_change_log on each med delete, and that row FKs to profiles —
    // so it must run before the profile is gone. (If we let the profile-delete
    // cascade remove medications, the trigger fires mid-statement and the log
    // insert violates the FK, aborting the whole delete.) The change-log rows
    // we just created are then cleaned up by the profile cascade below.
    await serviceRoleSql`DELETE FROM public.medications WHERE patient_id = ${patientId}`;
    await serviceRoleSql`DELETE FROM public.medication_change_log WHERE patient_id = ${patientId}`;
    // auth.users has no dependents; harmless if the row is already gone.
    await serviceRoleSql`DELETE FROM auth.users WHERE id = ${patientId}`;
    // Deleting the profile cascades → patient_profiles + all remaining PHI tables.
    await serviceRoleSql`DELETE FROM public.profiles WHERE id = ${patientId}`;
  } catch (err) {
    console.error("deletePatientAccount failed", err);
    return { ok: false, error: "Couldn't remove the patient's data. Please try again." };
  }

  // Remove the Cognito login (best-effort; data is already gone).
  await deleteCognitoUser(target.email).catch(() => undefined);

  await recordAudit({
    action: "delete",
    entityType: "patient_profile",
    entityId: patientId,
    patientId,
    meta: { email: target.email },
  }).catch(() => undefined);

  revalidatePath("/clinician/dashboard");
  return { ok: true };
}
