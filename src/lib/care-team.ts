// Care-team helpers. Visibility model (app-enforced for now): a clinician sees
// a patient if they're on that patient's care team, OR they're an admin.
import { cache } from "react";
import { serviceRoleSql } from "@/lib/db/connection";
import type { AuthUser } from "@/lib/auth/server";

// Is this clinician an admin (sees all patients)? Cached per request.
export const isAdminClinician = cache(async (userId: string): Promise<boolean> => {
  try {
    const rows = await serviceRoleSql<{ is_admin: boolean }[]>`
      SELECT is_admin FROM public.clinician_profiles
      WHERE profile_id = ${userId} AND deactivated_at IS NULL LIMIT 1
    `;
    return rows[0]?.is_admin === true;
  } catch {
    return false;
  }
});

// Can this clinician access this patient? Admin OR on the care team.
export async function canAccessPatient(user: AuthUser, patientId: string): Promise<boolean> {
  if (await isAdminClinician(user.id)) return true;
  const rows = await serviceRoleSql<{ one: number }[]>`
    SELECT 1 AS one FROM public.patient_care_team ct
    JOIN public.clinician_profiles cp ON cp.profile_id = ct.clinician_id
    WHERE ct.patient_id = ${patientId} AND ct.clinician_id = ${user.id}
      AND cp.deactivated_at IS NULL LIMIT 1
  `;
  return rows.length > 0;
}

export type CareTeamMember = {
  clinicianId: string;
  firstName: string | null;
  lastName: string | null;
  professionalRole: string | null;
  roleLabel: string | null;
  title: string | null;
  credentials: string | null;
};

// Care-team members for a patient (with role info for display).
export async function getCareTeam(patientId: string): Promise<CareTeamMember[]> {
  const rows = await serviceRoleSql<
    { clinician_id: string; first_name: string | null; last_name: string | null; professional_role: string | null; role_label: string | null; title: string | null; credentials: string | null }[]
  >`
    SELECT ct.clinician_id, p.first_name, p.last_name,
           cp.professional_role, cp.role_label, cp.title, cp.credentials
    FROM public.patient_care_team ct
    JOIN public.profiles p ON p.id = ct.clinician_id
    LEFT JOIN public.clinician_profiles cp ON cp.profile_id = ct.clinician_id
    WHERE ct.patient_id = ${patientId}
    ORDER BY p.last_name NULLS LAST, p.first_name NULLS LAST
  `;
  return rows.map((r) => ({
    clinicianId: r.clinician_id,
    firstName: r.first_name,
    lastName: r.last_name,
    professionalRole: r.professional_role,
    roleLabel: r.role_label,
    title: r.title,
    credentials: r.credentials,
  }));
}

// All clinicians in a clinic (for the admin "add member" picker).
export async function getClinicClinicians(clinicId: string): Promise<CareTeamMember[]> {
  const rows = await serviceRoleSql<
    { profile_id: string; first_name: string | null; last_name: string | null; professional_role: string | null; role_label: string | null; title: string | null; credentials: string | null }[]
  >`
    SELECT cp.profile_id, p.first_name, p.last_name,
           cp.professional_role, cp.role_label, cp.title, cp.credentials
    FROM public.clinician_profiles cp
    JOIN public.profiles p ON p.id = cp.profile_id
    WHERE cp.clinic_id = ${clinicId}
    ORDER BY p.last_name NULLS LAST, p.first_name NULLS LAST
  `;
  return rows.map((r) => ({
    clinicianId: r.profile_id,
    firstName: r.first_name,
    lastName: r.last_name,
    professionalRole: r.professional_role,
    roleLabel: r.role_label,
    title: r.title,
    credentials: r.credentials,
  }));
}

export function careTeamRole(m: CareTeamMember): string | null {
  return m.professionalRole || m.roleLabel || m.title || null;
}

// ── Staff / admin management ──────────────────────────────────────────────

export type StaffMember = CareTeamMember & {
  email: string;
  isAdmin: boolean;
  isActive: boolean;
};

// All staff in the clinic with email + admin flag (for the Team settings page).
export async function getClinicStaff(clinicId: string): Promise<StaffMember[]> {
  const rows = await serviceRoleSql<
    {
      profile_id: string; email: string; first_name: string | null; last_name: string | null;
      professional_role: string | null; role_label: string | null; title: string | null;
      credentials: string | null; is_admin: boolean; deactivated_at: string | null;
    }[]
  >`
    SELECT cp.profile_id, p.email, p.first_name, p.last_name,
           cp.professional_role, cp.role_label, cp.title, cp.credentials,
           cp.is_admin, cp.deactivated_at
    FROM public.clinician_profiles cp
    JOIN public.profiles p ON p.id = cp.profile_id
    WHERE cp.clinic_id = ${clinicId}
    ORDER BY (cp.deactivated_at IS NOT NULL),
             p.last_name NULLS LAST, p.first_name NULLS LAST
  `;
  return rows.map((r) => ({
    clinicianId: r.profile_id,
    email: r.email,
    firstName: r.first_name,
    lastName: r.last_name,
    professionalRole: r.professional_role,
    roleLabel: r.role_label,
    title: r.title,
    credentials: r.credentials,
    isAdmin: r.is_admin === true,
    isActive: r.deactivated_at === null,
  }));
}

/**
 * Deactivate (soft-delete) or reactivate a staff login. Guards mirror
 * setClinicianAdmin: actor must be an admin in the same clinic, can't
 * deactivate themself, and can't deactivate the last active admin.
 * Returns an error string for the UI, or null on success.
 */
export async function setClinicianActive(
  actor: AuthUser,
  targetProfileId: string,
  active: boolean
): Promise<string | null> {
  if (!(await isAdminClinician(actor.id))) return "Only administrators can change staff access.";
  if (!active && targetProfileId === actor.id) {
    return "You can't deactivate your own account — ask another administrator.";
  }

  const [target] = await serviceRoleSql<
    { profile_id: string; clinic_id: string; is_admin: boolean; deactivated_at: string | null }[]
  >`
    SELECT profile_id, clinic_id, is_admin, deactivated_at
    FROM public.clinician_profiles WHERE profile_id = ${targetProfileId} LIMIT 1
  `;
  if (!target || target.clinic_id !== actor.clinicId) return "Staff member not found.";
  const currentlyActive = target.deactivated_at === null;
  if (currentlyActive === active) return null; // no-op

  if (!active && target.is_admin) {
    const [{ n }] = await serviceRoleSql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM public.clinician_profiles
      WHERE clinic_id = ${actor.clinicId} AND is_admin = true AND deactivated_at IS NULL
    `;
    if (n <= 1) return "You can't deactivate the last administrator.";
  }

  await serviceRoleSql`
    UPDATE public.clinician_profiles
    SET deactivated_at = ${active ? null : new Date().toISOString()}
    WHERE profile_id = ${targetProfileId} AND clinic_id = ${actor.clinicId}
  `;
  return null;
}

/**
 * Grant or revoke admin. Guards:
 *  - actor must be an admin in the same clinic as the target
 *  - an admin cannot demote themself (prevents accidental lockout)
 *  - the last remaining admin cannot be demoted
 * Returns an error string for the UI, or null on success.
 */
export async function setClinicianAdmin(
  actor: AuthUser,
  targetProfileId: string,
  makeAdmin: boolean
): Promise<string | null> {
  if (!(await isAdminClinician(actor.id))) return "Only administrators can change admin access.";
  if (!makeAdmin && targetProfileId === actor.id) {
    return "You can't remove your own admin access — ask another administrator.";
  }

  const [target] = await serviceRoleSql<{ profile_id: string; clinic_id: string; is_admin: boolean }[]>`
    SELECT profile_id, clinic_id, is_admin FROM public.clinician_profiles
    WHERE profile_id = ${targetProfileId} LIMIT 1
  `;
  if (!target || target.clinic_id !== actor.clinicId) return "Staff member not found.";
  if (target.is_admin === makeAdmin) return null; // no-op

  if (!makeAdmin) {
    const [{ n }] = await serviceRoleSql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM public.clinician_profiles
      WHERE clinic_id = ${actor.clinicId} AND is_admin = true
    `;
    if (n <= 1) return "You can't remove the last administrator.";
  }

  await serviceRoleSql`
    UPDATE public.clinician_profiles SET is_admin = ${makeAdmin}
    WHERE profile_id = ${targetProfileId} AND clinic_id = ${actor.clinicId}
  `;
  return null;
}
