"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireClinician } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { recordAudit } from "@/lib/audit";
import { parseTime24 } from "@/lib/medications";

const KINDS = ["medication", "supplement"] as const;

const upsertMedSchema = z.object({
  id: z.string().uuid().nullish(),
  patientId: z.string().uuid(),
  kind: z.enum(KINDS),
  name: z.string().min(1).max(200),
  dose: z.string().max(100).nullish(),
  form: z.string().max(50).nullish(),
  instructions: z.string().max(500).nullish(),
  notes: z.string().max(1000).nullish(),
  pillarId: z.string().uuid().nullish(),
  startDate: z.string().min(8).max(10).nullish(),
  endDate: z.string().min(8).max(10).nullish(),
  active: z.boolean(),
  sortOrder: z.number().int().min(0).max(10000).nullish(),
  // Refill tracking (0017)
  quantityOnHand: z.number().min(0).max(100000).nullish(),
  quantityPerDose: z.number().min(0).max(1000).nullish(),
  refillThresholdDays: z.number().int().min(0).max(365).nullish(),
  lastRefillOn: z.string().min(8).max(10).nullish(),
  // With food (0022)
  withFood: z.boolean().nullish(),
  // Nutrient content per dose (0018)
  vitaminDIu:   z.number().min(0).max(1000000).nullish(),
  vitaminB12Ug: z.number().min(0).max(100000).nullish(),
  ironMg:       z.number().min(0).max(10000).nullish(),
  magnesiumMg:  z.number().min(0).max(10000).nullish(),
  calciumMg:    z.number().min(0).max(10000).nullish(),
  potassiumMg:  z.number().min(0).max(10000).nullish(),
  sodiumMg:     z.number().min(0).max(10000).nullish(),
  dhaMg:        z.number().min(0).max(100000).nullish(),
  epaMg:        z.number().min(0).max(100000).nullish(),
  creatineMg:   z.number().min(0).max(100000).nullish(),
  coq10Mg:      z.number().min(0).max(10000).nullish(),
  fiberG:       z.number().min(0).max(1000).nullish(),
});

export async function upsertMedication(input: z.infer<typeof upsertMedSchema>) {
  const parsed = upsertMedSchema.parse(input);
  const user = await requireClinician();
  const clinicId = user.clinicId;

  const payload = {
    clinic_id: clinicId,
    patient_id: parsed.patientId,
    kind: parsed.kind,
    name: parsed.name.trim(),
    dose: parsed.dose?.trim() || null,
    form: parsed.form?.trim() || null,
    instructions: parsed.instructions?.trim() || null,
    notes: parsed.notes?.trim() || null,
    pillar_id: parsed.pillarId ?? null,
    start_date: parsed.startDate ?? null,
    end_date: parsed.endDate ?? null,
    active: parsed.active,
    sort_order: parsed.sortOrder ?? 0,
    quantity_on_hand: parsed.quantityOnHand ?? null,
    quantity_per_dose: parsed.quantityPerDose ?? null,
    refill_threshold_days: parsed.refillThresholdDays ?? null,
    last_refill_on: parsed.lastRefillOn ?? null,
    with_food: parsed.withFood ?? null,
    vitamin_d_iu:   parsed.vitaminDIu   ?? null,
    vitamin_b12_ug: parsed.vitaminB12Ug ?? null,
    iron_mg:        parsed.ironMg       ?? null,
    magnesium_mg:   parsed.magnesiumMg  ?? null,
    calcium_mg:     parsed.calciumMg    ?? null,
    potassium_mg:   parsed.potassiumMg  ?? null,
    sodium_mg:      parsed.sodiumMg     ?? null,
    dha_mg:         parsed.dhaMg        ?? null,
    epa_mg:         parsed.epaMg        ?? null,
    creatine_mg:    parsed.creatineMg   ?? null,
    coq10_mg:       parsed.coq10Mg      ?? null,
    fiber_g:        parsed.fiberG       ?? null,
    updated_at: new Date().toISOString(),
  };

  let id = parsed.id ?? null;
  if (id) {
    await withAuth(user, (sql) =>
      sql`UPDATE medications SET clinic_id = ${clinicId}, patient_id = ${payload.patient_id}, kind = ${payload.kind}, name = ${payload.name}, dose = ${payload.dose}, form = ${payload.form}, instructions = ${payload.instructions}, notes = ${payload.notes}, pillar_id = ${payload.pillar_id}, start_date = ${payload.start_date}, end_date = ${payload.end_date}, active = ${payload.active}, sort_order = ${payload.sort_order}, quantity_on_hand = ${payload.quantity_on_hand}, quantity_per_dose = ${payload.quantity_per_dose}, refill_threshold_days = ${payload.refill_threshold_days}, last_refill_on = ${payload.last_refill_on}, with_food = ${payload.with_food}, vitamin_d_iu = ${payload.vitamin_d_iu}, vitamin_b12_ug = ${payload.vitamin_b12_ug}, iron_mg = ${payload.iron_mg}, magnesium_mg = ${payload.magnesium_mg}, calcium_mg = ${payload.calcium_mg}, potassium_mg = ${payload.potassium_mg}, sodium_mg = ${payload.sodium_mg}, dha_mg = ${payload.dha_mg}, epa_mg = ${payload.epa_mg}, creatine_mg = ${payload.creatine_mg}, coq10_mg = ${payload.coq10_mg}, fiber_g = ${payload.fiber_g}, updated_at = ${payload.updated_at} WHERE id = ${id}`
    );
    await recordAudit({ action: "update", entityType: "medication", entityId: id, patientId: parsed.patientId, meta: { after: payload } });
  } else {
    const [inserted] = await withAuth(user, (sql) =>
      sql`INSERT INTO medications (clinic_id, patient_id, kind, name, dose, form, instructions, notes, pillar_id, start_date, end_date, active, sort_order, quantity_on_hand, quantity_per_dose, refill_threshold_days, last_refill_on, with_food, vitamin_d_iu, vitamin_b12_ug, iron_mg, magnesium_mg, calcium_mg, potassium_mg, sodium_mg, dha_mg, epa_mg, creatine_mg, coq10_mg, fiber_g, updated_at) VALUES (${clinicId}, ${payload.patient_id}, ${payload.kind}, ${payload.name}, ${payload.dose}, ${payload.form}, ${payload.instructions}, ${payload.notes}, ${payload.pillar_id}, ${payload.start_date}, ${payload.end_date}, ${payload.active}, ${payload.sort_order}, ${payload.quantity_on_hand}, ${payload.quantity_per_dose}, ${payload.refill_threshold_days}, ${payload.last_refill_on}, ${payload.with_food}, ${payload.vitamin_d_iu}, ${payload.vitamin_b12_ug}, ${payload.iron_mg}, ${payload.magnesium_mg}, ${payload.calcium_mg}, ${payload.potassium_mg}, ${payload.sodium_mg}, ${payload.dha_mg}, ${payload.epa_mg}, ${payload.creatine_mg}, ${payload.coq10_mg}, ${payload.fiber_g}, ${payload.updated_at}) RETURNING id`
    );
    if (!inserted) throw new Error("Failed to insert");
    id = inserted.id;
    await recordAudit({ action: "create", entityType: "medication", entityId: id, patientId: parsed.patientId, meta: { after: payload } });
  }

  revalidatePath(`/clinician/patient/${parsed.patientId}`);
  revalidatePath(`/clinician/patient/${parsed.patientId}/stack`);
  revalidatePath("/home/stack");
  revalidatePath("/home");
  return { id };
}

export async function deleteMedication(input: { id: string; patientId: string }) {
  const user = await requireClinician();

  await withAuth(user, (sql) => sql`DELETE FROM medications WHERE id = ${input.id}`);

  await recordAudit({
    action: "delete",
    entityType: "medication",
    entityId: input.id,
    patientId: input.patientId,
  });

  revalidatePath(`/clinician/patient/${input.patientId}`);
  revalidatePath(`/clinician/patient/${input.patientId}/stack`);
  revalidatePath("/home/stack");
  revalidatePath("/home");
}

const upsertDoseSchema = z.object({
  id: z.string().uuid().nullish(),
  medicationId: z.string().uuid(),
  patientId: z.string().uuid(),
  timeLocal: z.string().min(3).max(10),                // "7:00 AM" or "07:00"
  label: z.string().max(100).nullish(),
  withFood: z.boolean().nullish(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  amountOverride: z.string().max(100).nullish(),
  sortOrder: z.number().int().min(0).max(10000).nullish(),
});

export async function upsertDose(input: z.infer<typeof upsertDoseSchema>) {
  const parsed = upsertDoseSchema.parse(input);
  const user = await requireClinician();
  const clinicId = user.clinicId;

  const time24 = parseTime24(parsed.timeLocal);
  if (!time24) throw new Error(`Bad time: ${parsed.timeLocal}`);

  const payload = {
    clinic_id: clinicId,
    patient_id: parsed.patientId,
    medication_id: parsed.medicationId,
    time_local: time24,
    label: parsed.label?.trim() || null,
    with_food: parsed.withFood ?? null,
    days_of_week: Array.from(new Set(parsed.daysOfWeek)).sort(),
    amount_override: parsed.amountOverride?.trim() || null,
    sort_order: parsed.sortOrder ?? 0,
    updated_at: new Date().toISOString(),
  };

  let id = parsed.id ?? null;
  if (id) {
    await withAuth(user, (sql) =>
      sql`UPDATE medication_doses SET clinic_id = ${clinicId}, patient_id = ${payload.patient_id}, medication_id = ${payload.medication_id}, time_local = ${payload.time_local}, label = ${payload.label}, with_food = ${payload.with_food}, days_of_week = ${payload.days_of_week}, amount_override = ${payload.amount_override}, sort_order = ${payload.sort_order}, updated_at = ${payload.updated_at} WHERE id = ${id}`
    );
    await recordAudit({ action: "update", entityType: "medication_dose", entityId: id, patientId: parsed.patientId, meta: { after: payload } });
  } else {
    const [inserted] = await withAuth(user, (sql) =>
      sql`INSERT INTO medication_doses (clinic_id, patient_id, medication_id, time_local, label, with_food, days_of_week, amount_override, sort_order, updated_at) VALUES (${clinicId}, ${payload.patient_id}, ${payload.medication_id}, ${payload.time_local}, ${payload.label}, ${payload.with_food}, ${payload.days_of_week}, ${payload.amount_override}, ${payload.sort_order}, ${payload.updated_at}) RETURNING id`
    );
    if (!inserted) throw new Error("Failed to insert");
    id = inserted.id;
    await recordAudit({ action: "create", entityType: "medication_dose", entityId: id, patientId: parsed.patientId, meta: { after: payload } });
  }

  revalidatePath(`/clinician/patient/${parsed.patientId}`);
  revalidatePath(`/clinician/patient/${parsed.patientId}/stack`);
  revalidatePath("/home/stack");
  revalidatePath("/home");
  return { id };
}

export async function deleteDose(input: { id: string; patientId: string }) {
  const user = await requireClinician();

  await withAuth(user, (sql) => sql`DELETE FROM medication_doses WHERE id = ${input.id}`);

  await recordAudit({
    action: "delete",
    entityType: "medication_dose",
    entityId: input.id,
    patientId: input.patientId,
  });

  revalidatePath(`/clinician/patient/${input.patientId}`);
  revalidatePath(`/clinician/patient/${input.patientId}/stack`);
  revalidatePath("/home/stack");
  revalidatePath("/home");
}
