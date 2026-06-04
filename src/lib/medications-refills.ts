// Clinic-wide refill rollup. Used by the /clinician/refills dashboard
// (RLS-scoped) and the /api/medications/refill-check cron (service-role).

import { getUser } from "@/lib/auth/server";
import { withAuth, serviceRoleSql } from "@/lib/db/connection";
import { refillStatus, type StackItem, type RefillStatus } from "./medications-utils";

export type RefillRow = {
  medicationId: string;
  patientId: string;
  patientFirstName: string | null;
  patientLastName: string | null;
  clinicId: string;
  name: string;
  dose: string | null;
  kind: "medication" | "supplement";
  refill: RefillStatus;
  lastRefillOn: string | null;
};

// Inline the same shape getStack uses, but cross-patient. We don't need
// pillar joins or full StackItem ergonomics — just enough to compute
// refillStatus().
type RawMed = {
  id: string;
  clinic_id: string;
  patient_id: string;
  name: string;
  dose: string | null;
  kind: string | null;
  active: boolean;
  quantity_on_hand: any;
  quantity_per_dose: any;
  refill_threshold_days: any;
  last_refill_on: string | null;
};

type RawDose = {
  id: string;
  medication_id: string;
  days_of_week: any;
};

function makeStackItem(m: RawMed, doses: RawDose[]): StackItem {
  return {
    id: m.id,
    clinicId: m.clinic_id,
    patientId: m.patient_id,
    kind: ((m.kind ?? "medication") as "medication" | "supplement"),
    name: m.name,
    dose: m.dose,
    form: null,
    instructions: null,
    notes: null,
    pillarId: null,
    pillarName: null,
    startDate: null,
    endDate: null,
    active: !!m.active,
    sortOrder: 0,
    quantityOnHand: m.quantity_on_hand == null ? null : Number(m.quantity_on_hand),
    quantityPerDose: m.quantity_per_dose == null ? null : Number(m.quantity_per_dose),
    refillThresholdDays: m.refill_threshold_days == null ? null : Number(m.refill_threshold_days),
    lastRefillOn: m.last_refill_on,
    withFood: null,
    vitaminDIu: null,
    vitaminB12Ug: null,
    ironMg: null,
    magnesiumMg: null,
    calciumMg: null,
    potassiumMg: null,
    sodiumMg: null,
    dhaMg: null,
    epaMg: null,
    creatineMg: null,
    coq10Mg: null,
    fiberG: null,
    doses: (doses ?? []).map((d) => ({
      id: d.id,
      medicationId: d.medication_id,
      timeLocal: "00:00:00",
      label: null,
      withFood: null,
      daysOfWeek: (d.days_of_week ?? []).map((n: any) => Number(n)),
      amountOverride: null,
      sortOrder: 0,
    })),
  };
}

// RLS-scoped: caller is a clinician; they only see their clinic.
export async function getClinicRefillBoard(): Promise<RefillRow[]> {
  const user = await getUser();
  if (!user) return [];

  const meds = await withAuth(user, (sql) =>
    sql`
      SELECT m.id, m.clinic_id, m.patient_id, m.name, m.dose, m.kind, m.active,
             m.quantity_on_hand, m.quantity_per_dose, m.refill_threshold_days, m.last_refill_on,
             p.first_name, p.last_name
      FROM medications m
      JOIN profiles p ON p.id = m.patient_id
      WHERE m.active = true AND m.quantity_on_hand IS NOT NULL
    `
  );

  const medIds = meds.map((m: any) => m.id as string);
  let doses: RawDose[] = [];
  if (medIds.length > 0) {
    doses = await withAuth(user, (sql) =>
      sql`SELECT id, medication_id, days_of_week FROM medication_doses WHERE medication_id = ANY(${medIds})`
    ) as RawDose[];
  }
  const dosesByMed: Record<string, RawDose[]> = {};
  for (const d of doses) {
    (dosesByMed[d.medication_id] ?? (dosesByMed[d.medication_id] = [])).push(d);
  }

  const rows: RefillRow[] = [];
  for (const m of meds as any[]) {
    const item = makeStackItem(m, dosesByMed[m.id] ?? []);
    const refill = refillStatus(item);
    if (refill.state !== "low" && refill.state !== "out") continue;
    rows.push({
      medicationId: m.id,
      patientId: m.patient_id,
      patientFirstName: m.first_name ?? null,
      patientLastName: m.last_name ?? null,
      clinicId: m.clinic_id,
      name: m.name,
      dose: m.dose,
      kind: (m.kind ?? "medication") as "medication" | "supplement",
      refill,
      lastRefillOn: m.last_refill_on,
    });
  }

  // Out first (days <= 0), then low ascending by days remaining.
  rows.sort((a, b) => {
    const aRank = a.refill.state === "out" ? -1 : (a.refill.daysRemaining ?? 9999);
    const bRank = b.refill.state === "out" ? -1 : (b.refill.daysRemaining ?? 9999);
    return aRank - bRank;
  });
  return rows;
}

// Service-role version for the cron. Same logic but iterates EVERY clinic.
export async function getAllRefillFindings(): Promise<RefillRow[]> {
  const meds = await serviceRoleSql`
    SELECT m.id, m.clinic_id, m.patient_id, m.name, m.dose, m.kind, m.active,
           m.quantity_on_hand, m.quantity_per_dose, m.refill_threshold_days, m.last_refill_on,
           p.first_name, p.last_name
    FROM medications m
    JOIN profiles p ON p.id = m.patient_id
    WHERE m.active = true AND m.quantity_on_hand IS NOT NULL
  `;

  const medIds = meds.map((m: any) => m.id as string);
  let doses: RawDose[] = [];
  if (medIds.length > 0) {
    doses = await serviceRoleSql`SELECT id, medication_id, days_of_week FROM medication_doses WHERE medication_id = ANY(${medIds})` as RawDose[];
  }
  const dosesByMed: Record<string, RawDose[]> = {};
  for (const d of doses) {
    (dosesByMed[d.medication_id] ?? (dosesByMed[d.medication_id] = [])).push(d);
  }

  const rows: RefillRow[] = [];
  for (const m of meds as any[]) {
    const item = makeStackItem(m, dosesByMed[m.id] ?? []);
    const refill = refillStatus(item);
    if (refill.state !== "low" && refill.state !== "out") continue;
    rows.push({
      medicationId: m.id,
      patientId: m.patient_id,
      patientFirstName: m.first_name ?? null,
      patientLastName: m.last_name ?? null,
      clinicId: m.clinic_id,
      name: m.name,
      dose: m.dose,
      kind: (m.kind ?? "medication") as "medication" | "supplement",
      refill,
      lastRefillOn: m.last_refill_on,
    });
  }
  return rows;
}
