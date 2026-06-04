// Per-patient medication history fetcher. Reads the trigger-populated
// `medication_change_log` table. Each row is one create/update/delete/refill
// event with a before/after JSON snapshot.

import { getUser } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import type { AuthUser } from "@/lib/auth/server";

export type ChangeType = "create" | "update" | "delete" | "refill";

export type MedicationChange = {
  id: string;
  medicationId: string | null;
  medicationName: string | null;       // resolved from after.name || before.name
  changeType: ChangeType;
  changedFields: string[];
  before: Record<string, any> | null;
  after: Record<string, any> | null;
  actorId: string | null;
  actorRole: string | null;
  actorName: string | null;
  createdAt: string;
};

// Columns we ignore when describing a diff. (created_at never changes;
// updated_at always changes; sort_order is noise for clinicians.)
const HIDDEN_FIELDS = new Set<string>(["created_at", "updated_at", "sort_order"]);

export function visibleChangedFields(fields: string[] | null | undefined): string[] {
  return (fields ?? []).filter((f) => !HIDDEN_FIELDS.has(f));
}

export type Diff = { field: string; before: any; after: any };

export function diffFor(change: MedicationChange): Diff[] {
  const fields = visibleChangedFields(change.changedFields);
  return fields.map((f) => ({
    field: f,
    before: change.before?.[f] ?? null,
    after: change.after?.[f] ?? null,
  }));
}

export async function getMedicationHistory(
  patientId: string,
  limit = 100,
  user?: AuthUser,
): Promise<MedicationChange[]> {
  const resolvedUser = user ?? (await getUser());
  if (!resolvedUser) return [];
  const data = await withAuth(resolvedUser, (sql) =>
    sql`
      SELECT mcl.id, mcl.medication_id, mcl.change_type, mcl.changed_fields, mcl.before, mcl.after,
             mcl.actor_id, mcl.actor_role, mcl.created_at,
             p.first_name AS actor_first, p.last_name AS actor_last
      FROM medication_change_log mcl
      LEFT JOIN profiles p ON p.id = mcl.actor_id
      WHERE mcl.patient_id = ${patientId}
      ORDER BY mcl.created_at DESC
      LIMIT ${limit}
    `
  );

  return data.map((r: any) => {
    const after = (r.after ?? null) as Record<string, any> | null;
    const before = (r.before ?? null) as Record<string, any> | null;
    const name = after?.name ?? before?.name ?? null;
    const actorFirst = r.actor_first ?? null;
    const actorLast = r.actor_last ?? null;
    const actorName = actorFirst || actorLast
      ? `${actorFirst ?? ""} ${actorLast ?? ""}`.trim()
      : null;
    return {
      id: r.id,
      medicationId: r.medication_id,
      medicationName: name,
      changeType: r.change_type as ChangeType,
      changedFields: Array.isArray(r.changed_fields) ? r.changed_fields as string[] : [],
      before,
      after,
      actorId: r.actor_id,
      actorRole: r.actor_role,
      actorName,
      createdAt: r.created_at,
    };
  });
}

export async function getMedicationHistoryFor(
  patientId: string,
  medicationId: string,
  limit = 100,
  user?: AuthUser,
): Promise<MedicationChange[]> {
  const all = await getMedicationHistory(patientId, limit, user);
  return all.filter((c) => c.medicationId === medicationId);
}

// Pretty label for a field name in the timeline UI.
const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  dose: "Dose",
  form: "Form",
  instructions: "Instructions",
  notes: "Notes",
  pillar_id: "Pillar",
  kind: "Kind",
  start_date: "Start date",
  end_date: "End date",
  active: "Active",
  quantity_on_hand: "Quantity on hand",
  quantity_per_dose: "Quantity per dose",
  refill_threshold_days: "Refill threshold (days)",
  last_refill_on: "Last refill",
};

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}
