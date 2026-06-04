"use server";

import { revalidatePath } from "next/cache";
import { requireClinician } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { recordAudit } from "@/lib/audit";

export async function togglePillarHidden(args: {
  pillarId: string;
  patientId: string;
  hidden: boolean;
}) {
  const user = await requireClinician();

  await withAuth(user, (sql) =>
    sql`UPDATE pillars SET hidden = ${args.hidden}, updated_at = ${new Date().toISOString()} WHERE id = ${args.pillarId}`
  );

  await recordAudit({
    action: "update",
    entityType: "pillar",
    entityId: args.pillarId,
    patientId: args.patientId,
    meta: { hidden: args.hidden },
  });

  revalidatePath(`/clinician/patient/${args.patientId}`);
  revalidatePath(`/home/pillars`);
  revalidatePath(`/home/pillars/${args.pillarId}`);
}
