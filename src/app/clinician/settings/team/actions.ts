"use server";

import { revalidatePath } from "next/cache";
import { requireClinician } from "@/lib/auth/server";
import { setClinicianAdmin, setClinicianActive } from "@/lib/care-team";
import { recordAudit } from "@/lib/audit";

export type ToggleAdminResult = { ok: true } | { ok: false; error: string };
export type SetActiveResult = { ok: true } | { ok: false; error: string };

export async function toggleAdmin(
  targetProfileId: string,
  makeAdmin: boolean
): Promise<ToggleAdminResult> {
  const user = await requireClinician();

  const error = await setClinicianAdmin(user, targetProfileId, makeAdmin);
  if (error) return { ok: false, error };

  await recordAudit({
    action: "update",
    entityType: "clinician_admin_flag",
    entityId: targetProfileId,
    meta: { isAdmin: makeAdmin },
  });

  revalidatePath("/clinician/settings/team");
  return { ok: true };
}

export async function setStaffActive(
  targetProfileId: string,
  active: boolean
): Promise<SetActiveResult> {
  const user = await requireClinician();

  const error = await setClinicianActive(user, targetProfileId, active);
  if (error) return { ok: false, error };

  await recordAudit({
    action: "update",
    entityType: "clinician_deactivation",
    entityId: targetProfileId,
    meta: { active },
  });

  revalidatePath("/clinician/settings/team");
  return { ok: true };
}
