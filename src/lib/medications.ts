// Server-side data fetchers for the medications / supplements "stack".
//
// Reads run through the active supabase session — RLS handles the scoping.
// Pure helpers (formatting, refill math, types) live in `./medications-utils`
// so client components can import them without dragging in `next/headers`.

import { getUser } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import type { AuthUser } from "@/lib/auth/server";
import {
  isoDate,
  type MedicationKind,
  type Medication,
  type ScheduledDose,
  type StackItem,
  type TodayDose,
  type AdherenceDay,
} from "./medications-utils";

// Re-export the client-safe pieces so existing server-side imports keep
// working without churn.
export {
  isoDate,
  dowOf,
  formatTime12,
  parseTime24,
  formatDaysOfWeek,
  dailyConsumption,
  refillStatus,
} from "./medications-utils";
export type {
  MedicationKind,
  Medication,
  ScheduledDose,
  StackItem,
  TodayDose,
  AdherenceDay,
  RefillStatus,
} from "./medications-utils";

// ---------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------

// All meds + doses for a patient, ordered for display.
export async function getStack(patientId: string, user?: AuthUser): Promise<StackItem[]> {
  const resolvedUser = user ?? (await getUser());
  if (!resolvedUser) return [];
  const [meds, doses] = await Promise.all([
    withAuth(resolvedUser, (sql) =>
      sql`
        SELECT m.id, m.patient_id, m.clinic_id, m.kind, m.name, m.dose, m.form, m.instructions, m.notes,
               m.pillar_id, m.start_date, m.end_date, m.active, m.sort_order,
               m.quantity_on_hand, m.quantity_per_dose, m.refill_threshold_days, m.last_refill_on,
               m.with_food,
               m.vitamin_d_iu, m.vitamin_b12_ug, m.iron_mg, m.magnesium_mg,
               m.calcium_mg, m.potassium_mg, m.sodium_mg,
               m.dha_mg, m.epa_mg, m.creatine_mg, m.coq10_mg, m.fiber_g,
               p.name AS pillar_name
        FROM medications m
        LEFT JOIN pillars p ON p.id = m.pillar_id
        WHERE m.patient_id = ${patientId}
        ORDER BY m.sort_order ASC, m.name ASC
      `
    ),
    withAuth(resolvedUser, (sql) =>
      sql`SELECT id, medication_id, time_local, label, with_food, days_of_week, amount_override, sort_order FROM medication_doses WHERE patient_id = ${patientId} ORDER BY time_local ASC`
    ),
  ]);

  const dosesByMed: Record<string, ScheduledDose[]> = {};
  doses.forEach((d: any) => {
    const list = dosesByMed[d.medication_id] ?? (dosesByMed[d.medication_id] = []);
    list.push({
      id: d.id,
      medicationId: d.medication_id,
      timeLocal: d.time_local,
      label: d.label,
      withFood: d.with_food,
      daysOfWeek: (d.days_of_week ?? []).map((n: any) => Number(n)),
      amountOverride: d.amount_override,
      sortOrder: d.sort_order,
    });
  });

  return meds.map((m: any) => ({
    id: m.id,
    patientId: m.patient_id,
    clinicId: m.clinic_id,
    kind: (m.kind ?? "medication") as MedicationKind,
    name: m.name,
    dose: m.dose,
    form: m.form,
    instructions: m.instructions,
    notes: m.notes,
    pillarId: m.pillar_id,
    pillarName: m.pillar_name ?? null,
    startDate: m.start_date,
    endDate: m.end_date,
    active: m.active,
    sortOrder: m.sort_order,
    quantityOnHand: m.quantity_on_hand == null ? null : Number(m.quantity_on_hand),
    quantityPerDose: m.quantity_per_dose == null ? null : Number(m.quantity_per_dose),
    refillThresholdDays: m.refill_threshold_days == null ? null : Number(m.refill_threshold_days),
    lastRefillOn: m.last_refill_on,
    vitaminDIu:   m.vitamin_d_iu   == null ? null : Number(m.vitamin_d_iu),
    vitaminB12Ug: m.vitamin_b12_ug == null ? null : Number(m.vitamin_b12_ug),
    ironMg:       m.iron_mg        == null ? null : Number(m.iron_mg),
    magnesiumMg:  m.magnesium_mg   == null ? null : Number(m.magnesium_mg),
    calciumMg:    m.calcium_mg     == null ? null : Number(m.calcium_mg),
    potassiumMg:  m.potassium_mg   == null ? null : Number(m.potassium_mg),
    sodiumMg:     m.sodium_mg      == null ? null : Number(m.sodium_mg),
    dhaMg:        m.dha_mg         == null ? null : Number(m.dha_mg),
    epaMg:        m.epa_mg         == null ? null : Number(m.epa_mg),
    creatineMg:   m.creatine_mg    == null ? null : Number(m.creatine_mg),
    coq10Mg:      m.coq10_mg       == null ? null : Number(m.coq10_mg),
    fiberG:       m.fiber_g        == null ? null : Number(m.fiber_g),
    withFood: m.with_food ?? null,
    doses: dosesByMed[m.id] ?? [],
  }));
}

// Scheduled doses for `date` (local-date string) plus their taken state.
// Active meds only; honors days_of_week mask.
export async function getDosesForDate(
  patientId: string,
  date: string,
  user?: AuthUser,
): Promise<TodayDose[]> {
  const resolvedUser = user ?? (await getUser());
  if (!resolvedUser) return [];
  const dow = new Date(date + "T00:00:00").getDay();

  const meds = await withAuth(resolvedUser, (sql) =>
    sql`SELECT id, name, kind, dose FROM medications WHERE patient_id = ${patientId} AND active = true`
  );
  const medMap: Record<string, any> = {};
  meds.forEach((m: any) => { medMap[m.id] = m; });
  if (meds.length === 0) return [];

  const medIds = Object.keys(medMap);
  const doses = await withAuth(resolvedUser, (sql) =>
    sql`SELECT id, medication_id, time_local, label, with_food, days_of_week, amount_override FROM medication_doses WHERE patient_id = ${patientId} AND medication_id = ANY(${medIds})`
  );

  const todays = doses.filter((d: any) =>
    (d.days_of_week ?? []).map(Number).includes(dow)
  );
  if (todays.length === 0) return [];

  const todayDoseIds = todays.map((d: any) => d.id as string);
  const logs = await withAuth(resolvedUser, (sql) =>
    sql`SELECT id, dose_id, taken_at FROM medication_dose_logs WHERE patient_id = ${patientId} AND scheduled_for = ${date} AND dose_id = ANY(${todayDoseIds})`
  );
  const logByDose: Record<string, any> = {};
  logs.forEach((l: any) => { logByDose[l.dose_id] = l; });

  return todays
    .map((d: any) => {
      const m = medMap[d.medication_id];
      const l = logByDose[d.id];
      return {
        doseId: d.id,
        medicationId: d.medication_id,
        name: m?.name ?? "(unknown)",
        kind: (m?.kind ?? "medication") as MedicationKind,
        dose: m?.dose ?? null,
        timeLocal: d.time_local,
        label: d.label,
        withFood: d.with_food,
        amountOverride: d.amount_override,
        taken: !!l,
        takenAt: l?.taken_at ?? null,
        logId: l?.id ?? null,
      };
    })
    .sort((a, b) => a.timeLocal.localeCompare(b.timeLocal));
}

// Daily adherence for the last `days` days. Uses meds active now (we
// approximate "active on day" as currently-active; for retroactive
// accuracy we'd join start_date / end_date, but that's overkill for v1).
export async function getAdherenceStrip(patientId: string, days = 7, user?: AuthUser): Promise<AdherenceDay[]> {
  const resolvedUser = user ?? (await getUser());
  if (!resolvedUser) return [];

  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  const sinceIso = isoDate(since);

  const [activeDoses, logs] = await Promise.all([
    withAuth(resolvedUser, (sql) =>
      sql`SELECT md.id, md.days_of_week FROM medication_doses md JOIN medications m ON m.id = md.medication_id WHERE md.patient_id = ${patientId} AND m.active = true`
    ),
    withAuth(resolvedUser, (sql) =>
      sql`SELECT dose_id, scheduled_for FROM medication_dose_logs WHERE patient_id = ${patientId} AND scheduled_for >= ${sinceIso}`
    ),
  ]);

  const takenByDate: Record<string, number> = {};
  logs.forEach((l: any) => {
    takenByDate[l.scheduled_for] = (takenByDate[l.scheduled_for] ?? 0) + 1;
  });

  const out: AdherenceDay[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = isoDate(d);
    const dow = d.getDay();
    const scheduled = activeDoses.filter((x: any) =>
      (x.days_of_week ?? []).map(Number).includes(dow)
    ).length;
    out.push({ date: key, scheduled, taken: takenByDate[key] ?? 0 });
  }
  return out;
}

// Meds linked to a given pillar — used by patient + clinician pillar detail.
export async function getMedicationsForPillar(pillarId: string, user?: AuthUser): Promise<Medication[]> {
  const resolvedUser = user ?? (await getUser());
  if (!resolvedUser) return [];
  const data = await withAuth(resolvedUser, (sql) =>
    sql`
      SELECT id, patient_id, clinic_id, kind, name, dose, form, instructions, notes,
             pillar_id, start_date, end_date, active, sort_order,
             quantity_on_hand, quantity_per_dose, refill_threshold_days, last_refill_on,
             vitamin_d_iu, vitamin_b12_ug, iron_mg, magnesium_mg,
             calcium_mg, potassium_mg, sodium_mg,
             dha_mg, epa_mg, creatine_mg, coq10_mg, fiber_g
      FROM medications
      WHERE pillar_id = ${pillarId} AND active = true
      ORDER BY sort_order ASC
    `
  );

  return data.map((m: any) => ({
    id: m.id,
    patientId: m.patient_id,
    clinicId: m.clinic_id,
    kind: (m.kind ?? "medication") as MedicationKind,
    name: m.name,
    dose: m.dose,
    form: m.form,
    instructions: m.instructions,
    notes: m.notes,
    pillarId: m.pillar_id,
    pillarName: null,
    startDate: m.start_date,
    endDate: m.end_date,
    active: m.active,
    sortOrder: m.sort_order,
    quantityOnHand: m.quantity_on_hand == null ? null : Number(m.quantity_on_hand),
    quantityPerDose: m.quantity_per_dose == null ? null : Number(m.quantity_per_dose),
    refillThresholdDays: m.refill_threshold_days == null ? null : Number(m.refill_threshold_days),
    lastRefillOn: m.last_refill_on,
    withFood: m.with_food ?? null,
    vitaminDIu:   m.vitamin_d_iu   == null ? null : Number(m.vitamin_d_iu),
    vitaminB12Ug: m.vitamin_b12_ug == null ? null : Number(m.vitamin_b12_ug),
    ironMg:       m.iron_mg        == null ? null : Number(m.iron_mg),
    magnesiumMg:  m.magnesium_mg   == null ? null : Number(m.magnesium_mg),
    calciumMg:    m.calcium_mg     == null ? null : Number(m.calcium_mg),
    potassiumMg:  m.potassium_mg   == null ? null : Number(m.potassium_mg),
    sodiumMg:     m.sodium_mg      == null ? null : Number(m.sodium_mg),
    dhaMg:        m.dha_mg         == null ? null : Number(m.dha_mg),
    epaMg:        m.epa_mg         == null ? null : Number(m.epa_mg),
    creatineMg:   m.creatine_mg    == null ? null : Number(m.creatine_mg),
    coq10Mg:      m.coq10_mg       == null ? null : Number(m.coq10_mg),
    fiberG:       m.fiber_g        == null ? null : Number(m.fiber_g),
  }));
}

// ---------------------------------------------------------------------
// Supplement micronutrient contribution for a given date.
//
// Fetches active supplements scheduled for `date` and sums their
// per-dose nutrient values by the number of doses scheduled that day.
// Used by the diet page to add supplement totals to food-log totals.
// ---------------------------------------------------------------------

export type SupplementMicros = {
  vitaminDIu: number;
  vitaminB12Ug: number;
  ironMg: number;
  magnesiumMg: number;
  calciumMg: number;
  potassiumMg: number;
  sodiumMg: number;
  dhaMg: number;
  epaMg: number;
  creatineMg: number;
  coq10Mg: number;
  fiberG: number;
  /** Names of supplements that contributed at least one non-null nutrient. */
  sources: string[];
};

export async function getSupplementMicrosForDate(
  patientId: string,
  date: string,
  user?: AuthUser,
): Promise<SupplementMicros> {
  const zero: SupplementMicros = {
    vitaminDIu: 0, vitaminB12Ug: 0, ironMg: 0, magnesiumMg: 0,
    calciumMg: 0, potassiumMg: 0, sodiumMg: 0,
    dhaMg: 0, epaMg: 0, creatineMg: 0, coq10Mg: 0, fiberG: 0,
    sources: [],
  };

  const resolvedUser = user ?? (await getUser());
  if (!resolvedUser) return zero;
  const dow = new Date(date + "T00:00:00").getDay();

  // Active supplements only.
  const supps = await withAuth(resolvedUser, (sql) =>
    sql`
      SELECT id, name,
             vitamin_d_iu, vitamin_b12_ug, iron_mg, magnesium_mg,
             calcium_mg, potassium_mg, sodium_mg,
             dha_mg, epa_mg, creatine_mg, coq10_mg, fiber_g
      FROM medications
      WHERE patient_id = ${patientId} AND kind = 'supplement' AND active = true
    `
  );

  if (supps.length === 0) return zero;

  // Count doses scheduled for this day per supplement.
  const suppIds = supps.map((s: any) => s.id as string);
  const doses = await withAuth(resolvedUser, (sql) =>
    sql`SELECT medication_id, days_of_week FROM medication_doses WHERE patient_id = ${patientId} AND medication_id = ANY(${suppIds})`
  );

  const doseCountBySupp: Record<string, number> = {};
  for (const d of doses) {
    if ((d.days_of_week ?? []).map(Number).includes(dow)) {
      doseCountBySupp[d.medication_id] = (doseCountBySupp[d.medication_id] ?? 0) + 1;
    }
  }

  const acc = { ...zero };
  const n = (v: any) => (v == null ? null : Number(v));

  for (const s of supps) {
    const count = doseCountBySupp[s.id] ?? 0;
    if (count === 0) continue;

    const nutrients = {
      vitaminDIu:   n(s.vitamin_d_iu),
      vitaminB12Ug: n(s.vitamin_b12_ug),
      ironMg:       n(s.iron_mg),
      magnesiumMg:  n(s.magnesium_mg),
      calciumMg:    n(s.calcium_mg),
      potassiumMg:  n(s.potassium_mg),
      sodiumMg:     n(s.sodium_mg),
      dhaMg:        n(s.dha_mg),
      epaMg:        n(s.epa_mg),
      creatineMg:   n(s.creatine_mg),
      coq10Mg:      n(s.coq10_mg),
      fiberG:       n(s.fiber_g),
    };

    let contributed = false;
    (Object.keys(nutrients) as (keyof typeof nutrients)[]).forEach((k) => {
      const v = nutrients[k];
      if (v != null) {
        acc[k] += v * count;
        contributed = true;
      }
    });
    if (contributed) acc.sources.push(s.name);
  }

  return acc;
}
