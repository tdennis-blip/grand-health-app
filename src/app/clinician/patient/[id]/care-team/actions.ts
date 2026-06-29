"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireClinician } from "@/lib/auth/server";
import { serviceRoleSql } from "@/lib/db/connection";
import { isAdminClinician } from "@/lib/care-team";
import { recordAudit } from "@/lib/audit";

const schema = z.object({
  patientId: z.string().uuid(),
  clinicianId: z.string().uuid(),
});

// Add a clinician to a patient's care team. A clinician may add themselves;
// an admin may add anyone. Both must be in the same clinic as the patient.
export async function addCareTeamMember(input: z.infer<typeof schema>) {
  const { patientId, clinicianId } = schema.parse(input);
  const user = await requireClinician();
  const admin = await isAdminClinician(user.id);

  if (!admin && clinicianId !== user.id) {
    throw new Error("You can only add yourself to a care team.");
  }

  // Resolve the patient's clinic and confirm both parties belong to it.
  const [patient] = await serviceRoleSql<{ clinic_id: string }[]>`
    SELECT clinic_id FROM public.patient_profiles WHERE profile_id = ${patientId} LIMIT 1
  `;
  if (!patient) throw new Error("Patient not found.");
  if (patient.clinic_id !== user.clinicId) throw new Error("Not in your clinic.");

  const [clin] = await serviceRoleSql<{ clinic_id: string }[]>`
    SELECT clinic_id FROM public.clinician_profiles WHERE profile_id = ${clinicianId} LIMIT 1
  `;
  if (!clin || clin.clinic_id !== patient.clinic_id) throw new Error("Clinician not in this clinic.");

  await serviceRoleSql`
    INSERT INTO public.patient_care_team (clinic_id, patient_id, clinician_id, added_by)
    VALUES (${patient.clinic_id}, ${patientId}, ${clinicianId}, ${user.id})
    ON CONFLICT (patient_id, clinician_id) DO NOTHING
  `;

  await recordAudit({
    action: "create",
    entityType: "care_team_member",
    entityId: patientId,
    patientId,
    meta: { clinicianId, addedBy: user.id },
  });

  revalidatePath(`/clinician/patient/${patientId}`);
}

// Remove a clinician from a care team. Self-removal always allowed; removing
// someone else requires admin.
export async function removeCareTeamMember(input: z.infer<typeof schema>) {
  const { patientId, clinicianId } = schema.parse(input);
  const user = await requireClinician();
  const admin = await isAdminClinician(user.id);

  if (!admin && clinicianId !== user.id) {
    throw new Error("You can only remove yourself from a care team.");
  }

  await serviceRoleSql`
    DELETE FROM public.patient_care_team
    WHERE patient_id = ${patientId} AND clinician_id = ${clinicianId}
  `;

  await recordAudit({
    action: "delete",
    entityType: "care_team_member",
    entityId: patientId,
    patientId,
    meta: { clinicianId, removedBy: user.id },
  });

  revalidatePath(`/clinician/patient/${patientId}`);
}
