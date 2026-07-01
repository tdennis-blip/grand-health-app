"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireClinician } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { recordAudit } from "@/lib/audit";
import { seedDefaultPillars } from "@/lib/default-pillars";

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

function revalidatePatient(patientId: string) {
  revalidatePath(`/clinician/patient/${patientId}`);
  revalidatePath(`/home/pillars`);
}

// Create a custom pillar for this patient (kind = 'custom').
export async function createPillar(input: { patientId: string; name: string }) {
  const { patientId, name } = z.object({
    patientId: z.string().uuid(),
    name: z.string().trim().min(1).max(80),
  }).parse(input);
  const user = await requireClinician();

  const [patient] = await withAuth(user, (sql) =>
    sql`SELECT clinic_id FROM patient_profiles WHERE profile_id = ${patientId} LIMIT 1`
  );
  if (!patient) throw new Error("Patient not found");

  const [{ next: nextSort }] = await withAuth(user, (sql) =>
    sql`SELECT coalesce(max(sort_order) + 1, 0) AS next FROM pillars WHERE patient_id = ${patientId}`
  );

  const [row] = await withAuth(user, (sql) =>
    sql`INSERT INTO pillars (clinic_id, patient_id, kind, name, sort_order)
        VALUES (${patient.clinic_id}, ${patientId}, 'custom', ${name}, ${nextSort})
        RETURNING id`
  );

  await recordAudit({ action: "create", entityType: "pillar", entityId: row.id, patientId, meta: { name } });
  revalidatePatient(patientId);
}

// Rename a pillar.
export async function renamePillar(input: { pillarId: string; patientId: string; name: string }) {
  const { pillarId, patientId, name } = z.object({
    pillarId: z.string().uuid(),
    patientId: z.string().uuid(),
    name: z.string().trim().min(1).max(80),
  }).parse(input);
  const user = await requireClinician();

  await withAuth(user, (sql) =>
    sql`UPDATE pillars SET name = ${name}, updated_at = now() WHERE id = ${pillarId} AND patient_id = ${patientId}`
  );

  await recordAudit({ action: "update", entityType: "pillar", entityId: pillarId, patientId, meta: { name } });
  revalidatePatient(patientId);
}

// Reorder a pillar up/down by swapping sort_order with its neighbor.
export async function movePillar(input: { pillarId: string; patientId: string; direction: "up" | "down" }) {
  const { pillarId, patientId, direction } = z.object({
    pillarId: z.string().uuid(),
    patientId: z.string().uuid(),
    direction: z.enum(["up", "down"]),
  }).parse(input);
  const user = await requireClinician();

  await withAuth(user, async (sql) => {
    const rows = await sql`SELECT id, sort_order FROM pillars WHERE patient_id = ${patientId} ORDER BY sort_order ASC`;
    const idx = rows.findIndex((r: any) => r.id === pillarId);
    if (idx === -1) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= rows.length) return;
    const a = rows[idx], b = rows[swapIdx];
    await sql`UPDATE pillars SET sort_order = ${b.sort_order} WHERE id = ${a.id}`;
    await sql`UPDATE pillars SET sort_order = ${a.sort_order} WHERE id = ${b.id}`;
  });

  revalidatePatient(patientId);
}

// Delete a pillar (cascades its factors).
export async function deletePillar(input: { pillarId: string; patientId: string }) {
  const { pillarId, patientId } = z.object({
    pillarId: z.string().uuid(),
    patientId: z.string().uuid(),
  }).parse(input);
  const user = await requireClinician();

  const [before] = await withAuth(user, (sql) =>
    sql`SELECT id, name, kind FROM pillars WHERE id = ${pillarId} AND patient_id = ${patientId} LIMIT 1`
  );
  await withAuth(user, (sql) =>
    sql`DELETE FROM pillars WHERE id = ${pillarId} AND patient_id = ${patientId}`
  );

  await recordAudit({ action: "delete", entityType: "pillar", entityId: pillarId, patientId, meta: { before } });
  revalidatePatient(patientId);
}

// Add the clinic's default pillars + starter factors to a patient who has none
// (backfill for patients created before auto-seeding, or after a full clear).
export async function addDefaultPillars(input: { patientId: string }) {
  const { patientId } = z.object({ patientId: z.string().uuid() }).parse(input);
  const user = await requireClinician();

  const [patient] = await withAuth(user, (sql) =>
    sql`SELECT clinic_id FROM patient_profiles WHERE profile_id = ${patientId} LIMIT 1`
  );
  if (!patient) throw new Error("Patient not found");

  const created = await seedDefaultPillars(patient.clinic_id, patientId);
  await recordAudit({ action: "create", entityType: "pillar", entityId: patientId, patientId, meta: { seeded: created } });
  revalidatePatient(patientId);
  return { created };
}
