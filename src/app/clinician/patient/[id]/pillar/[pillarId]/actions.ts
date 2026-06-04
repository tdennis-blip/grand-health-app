"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireClinician } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { recordAudit } from "@/lib/audit";

const FACTOR_STATUSES = ["on-target", "borderline", "off-target"] as const;
const FACTOR_WEIGHTS = ["low", "medium", "high"] as const;

const updateNoteSchema = z.object({
  pillarId: z.string().uuid(),
  patientId: z.string().uuid(),
  description: z.string().max(2000).nullish(),
  clinicianNote: z.string().max(4000).nullish(),
});

const factorUpdateSchema = z.object({
  factorId: z.string().uuid(),
  pillarId: z.string().uuid(),
  patientId: z.string().uuid(),
  name: z.string().min(1).max(200),
  currentValue: z.string().max(200).nullish(),
  unit: z.string().max(50).nullish(),
  goal: z.string().max(200).nullish(),
  status: z.enum(FACTOR_STATUSES),
  weight: z.enum(FACTOR_WEIGHTS),
  source: z.string().max(200).nullish(),
  note: z.string().max(2000).nullish(),
});

function revalidate(patientId: string, pillarId: string) {
  revalidatePath(`/clinician/patient/${patientId}/pillar/${pillarId}`);
  revalidatePath(`/clinician/patient/${patientId}`);
  revalidatePath("/home");
}

// ---------- Pillar description + clinician note ----------

export async function updatePillarNote(input: z.infer<typeof updateNoteSchema>) {
  const parsed = updateNoteSchema.parse(input);
  const user = await requireClinician();

  const [before] = await withAuth(user, (sql) =>
    sql`SELECT description, clinician_note FROM pillars WHERE id = ${parsed.pillarId} LIMIT 1`
  );

  await withAuth(user, (sql) =>
    sql`UPDATE pillars SET description = ${parsed.description ?? null}, clinician_note = ${parsed.clinicianNote ?? null}, updated_at = ${new Date().toISOString()} WHERE id = ${parsed.pillarId}`
  );

  await recordAudit({
    action: "update",
    entityType: "pillar",
    entityId: parsed.pillarId,
    patientId: parsed.patientId,
    meta: { before, after: { description: parsed.description, clinician_note: parsed.clinicianNote } },
  });

  revalidate(parsed.patientId, parsed.pillarId);
}

// ---------- Factor CRUD ----------

export async function addBlankFactor(args: { pillarId: string; patientId: string }) {
  const user = await requireClinician();

  const [pillar] = await withAuth(user, (sql) =>
    sql`SELECT clinic_id FROM pillars WHERE id = ${args.pillarId} LIMIT 1`
  );
  if (!pillar) throw new Error("Pillar not found");

  const [maxRow] = await withAuth(user, (sql) =>
    sql`SELECT sort_order FROM pillar_factors WHERE pillar_id = ${args.pillarId} ORDER BY sort_order DESC LIMIT 1`
  );
  const nextSortOrder = (maxRow?.sort_order ?? -1) + 1;

  const [inserted] = await withAuth(user, (sql) =>
    sql`INSERT INTO pillar_factors (clinic_id, patient_id, pillar_id, name, status, weight, sort_order) VALUES (${pillar.clinic_id}, ${args.patientId}, ${args.pillarId}, 'New risk factor', 'borderline', 'medium', ${nextSortOrder}) RETURNING id`
  );
  if (!inserted) throw new Error("Insert failed");

  await recordAudit({
    action: "create",
    entityType: "pillar_factor",
    entityId: inserted.id,
    patientId: args.patientId,
    meta: { source: "blank" },
  });

  revalidate(args.patientId, args.pillarId);
  return inserted.id;
}

export async function updateFactor(input: z.infer<typeof factorUpdateSchema>) {
  const parsed = factorUpdateSchema.parse(input);
  const user = await requireClinician();

  const [before] = await withAuth(user, (sql) =>
    sql`SELECT name, current_value, unit, goal, status, weight, source, note FROM pillar_factors WHERE id = ${parsed.factorId} LIMIT 1`
  );

  const now = new Date().toISOString();
  await withAuth(user, (sql) =>
    sql`UPDATE pillar_factors SET name = ${parsed.name}, current_value = ${parsed.currentValue ?? null}, unit = ${parsed.unit ?? null}, goal = ${parsed.goal ?? null}, status = ${parsed.status}, weight = ${parsed.weight}, source = ${parsed.source ?? null}, note = ${parsed.note ?? null}, updated_at = ${now} WHERE id = ${parsed.factorId}`
  );

  await recordAudit({
    action: "update",
    entityType: "pillar_factor",
    entityId: parsed.factorId,
    patientId: parsed.patientId,
    meta: { before },
  });

  revalidate(parsed.patientId, parsed.pillarId);
}

export async function deleteFactor(args: { factorId: string; pillarId: string; patientId: string }) {
  const user = await requireClinician();

  const [before] = await withAuth(user, (sql) =>
    sql`SELECT name, current_value, unit, goal, status FROM pillar_factors WHERE id = ${args.factorId} LIMIT 1`
  );

  await withAuth(user, (sql) => sql`DELETE FROM pillar_factors WHERE id = ${args.factorId}`);

  await recordAudit({
    action: "delete",
    entityType: "pillar_factor",
    entityId: args.factorId,
    patientId: args.patientId,
    meta: { before },
  });

  revalidate(args.patientId, args.pillarId);
}

export async function toggleFactorHidden(args: { factorId: string; hidden: boolean; pillarId: string; patientId: string }) {
  const user = await requireClinician();

  await withAuth(user, (sql) =>
    sql`UPDATE pillar_factors SET hidden = ${args.hidden}, updated_at = ${new Date().toISOString()} WHERE id = ${args.factorId}`
  );

  await recordAudit({
    action: "update",
    entityType: "pillar_factor",
    entityId: args.factorId,
    patientId: args.patientId,
    meta: { hidden: args.hidden },
  });

  revalidate(args.patientId, args.pillarId);
}

// ---------- Add factor from library ----------

export async function addFactorFromLibrary(args: {
  pillarId: string;
  patientId: string;
  libraryFactorId: string;
}) {
  const user = await requireClinician();

  const [[lib], [pillar]] = await Promise.all([
    withAuth(user, (sql) =>
      sql`SELECT id, name, unit, default_goal, weight, default_status, source, note FROM risk_factor_library WHERE id = ${args.libraryFactorId} LIMIT 1`
    ),
    withAuth(user, (sql) =>
      sql`SELECT clinic_id FROM pillars WHERE id = ${args.pillarId} LIMIT 1`
    ),
  ]);
  if (!lib) throw new Error("Library factor not found");
  if (!pillar) throw new Error("Pillar not found");

  const [maxRow] = await withAuth(user, (sql) =>
    sql`SELECT sort_order FROM pillar_factors WHERE pillar_id = ${args.pillarId} ORDER BY sort_order DESC LIMIT 1`
  );
  const nextSortOrder = (maxRow?.sort_order ?? -1) + 1;

  const [inserted] = await withAuth(user, (sql) =>
    sql`INSERT INTO pillar_factors (clinic_id, patient_id, pillar_id, library_factor_id, name, unit, goal, status, weight, source, note, sort_order) VALUES (${pillar.clinic_id}, ${args.patientId}, ${args.pillarId}, ${lib.id}, ${lib.name}, ${lib.unit}, ${lib.default_goal}, ${lib.default_status}, ${lib.weight}, ${lib.source}, ${lib.note}, ${nextSortOrder}) RETURNING id`
  );
  if (!inserted) throw new Error("Insert failed");

  await recordAudit({
    action: "create",
    entityType: "pillar_factor",
    entityId: inserted.id,
    patientId: args.patientId,
    meta: { source: "library", library_factor_id: lib.id },
  });

  revalidate(args.patientId, args.pillarId);
  return inserted.id as string;
}

// ---------- Apply a saved set ----------

export async function applyFactorSet(args: {
  pillarId: string;
  patientId: string;
  setId: string;
}) {
  const user = await requireClinician();

  const items = await withAuth(user, (sql) =>
    sql`SELECT factor_id, sort_order FROM risk_factor_set_items WHERE set_id = ${args.setId} ORDER BY sort_order ASC`
  );

  for (const it of items) {
    await addFactorFromLibrary({
      pillarId: args.pillarId,
      patientId: args.patientId,
      libraryFactorId: it.factor_id,
    });
  }

  await recordAudit({
    action: "create",
    entityType: "pillar_factor",
    entityId: null,
    patientId: args.patientId,
    meta: { source: "set_apply", set_id: args.setId, count: items.length },
  });

  revalidate(args.patientId, args.pillarId);
}

// ---------- Save current factors as a reusable set ----------

export async function saveCurrentFactorsAsSet(args: {
  pillarId: string;
  patientId: string;
  name: string;
  description?: string | null;
}) {
  const user = await requireClinician();

  const [pillar] = await withAuth(user, (sql) =>
    sql`SELECT clinic_id, kind FROM pillars WHERE id = ${args.pillarId} LIMIT 1`
  );
  if (!pillar) throw new Error("Pillar not found");

  const factors = await withAuth(user, (sql) =>
    sql`SELECT id, library_factor_id, name, unit, goal, status, weight, source, note FROM pillar_factors WHERE pillar_id = ${args.pillarId} AND hidden = false ORDER BY sort_order ASC`
  );
  if (!factors || factors.length === 0) throw new Error("No visible factors to save");

  const factorIds: string[] = [];
  for (const f of factors) {
    if (f.library_factor_id) {
      factorIds.push(f.library_factor_id);
      continue;
    }
    const [promoted] = await withAuth(user, (sql) =>
      sql`INSERT INTO risk_factor_library (clinic_id, name, unit, default_goal, weight, default_status, source, note, category) VALUES (${pillar.clinic_id}, ${f.name}, ${f.unit}, ${f.goal}, ${f.weight}, ${f.status}, ${f.source}, ${f.note}, ${null}) RETURNING id`
    );
    if (!promoted) throw new Error("Failed to promote factor");
    await withAuth(user, (sql) =>
      sql`UPDATE pillar_factors SET library_factor_id = ${promoted.id} WHERE id = ${f.id}`
    );
    factorIds.push(promoted.id);
  }

  const [newSet] = await withAuth(user, (sql) =>
    sql`INSERT INTO risk_factor_sets (clinic_id, name, description, pillar_kind) VALUES (${pillar.clinic_id}, ${args.name.trim()}, ${args.description?.trim() || null}, ${pillar.kind}) RETURNING id`
  );
  if (!newSet) throw new Error("Failed to create set");

  for (let i = 0; i < factorIds.length; i++) {
    await withAuth(user, (sql) =>
      sql`INSERT INTO risk_factor_set_items (set_id, factor_id, sort_order) VALUES (${newSet.id}, ${factorIds[i]}, ${i})`
    );
  }

  await recordAudit({
    action: "create",
    entityType: "risk_factor_set",
    entityId: newSet.id,
    patientId: args.patientId,
    meta: { source: "save_as_set_from_pillar", pillar_id: args.pillarId, factor_count: factorIds.length },
  });

  revalidate(args.patientId, args.pillarId);
  revalidatePath("/clinician/library/risks");
  return newSet.id as string;
}

// ============================================================
// LIFESTYLE DRIVERS
// ============================================================

const driverUpdateSchema = z.object({
  driverId: z.string().uuid(),
  pillarId: z.string().uuid(),
  patientId: z.string().uuid(),
  name: z.string().min(1).max(200),
  note: z.string().max(2000).nullish(),
});

export async function addBlankDriver(args: { pillarId: string; patientId: string }) {
  const user = await requireClinician();

  const [pillar] = await withAuth(user, (sql) =>
    sql`SELECT clinic_id FROM pillars WHERE id = ${args.pillarId} LIMIT 1`
  );
  if (!pillar) throw new Error("Pillar not found");

  const [maxRow] = await withAuth(user, (sql) =>
    sql`SELECT sort_order FROM lifestyle_drivers WHERE pillar_id = ${args.pillarId} ORDER BY sort_order DESC LIMIT 1`
  );
  const nextSortOrder = (maxRow?.sort_order ?? -1) + 1;

  const [inserted] = await withAuth(user, (sql) =>
    sql`INSERT INTO lifestyle_drivers (clinic_id, patient_id, pillar_id, name, sort_order) VALUES (${pillar.clinic_id}, ${args.patientId}, ${args.pillarId}, 'New lifestyle driver', ${nextSortOrder}) RETURNING id`
  );
  if (!inserted) throw new Error("Insert failed");

  await recordAudit({
    action: "create",
    entityType: "lifestyle_driver",
    entityId: inserted.id,
    patientId: args.patientId,
  });

  revalidate(args.patientId, args.pillarId);
  return inserted.id;
}

export async function updateDriver(input: z.infer<typeof driverUpdateSchema>) {
  const parsed = driverUpdateSchema.parse(input);
  const user = await requireClinician();

  const [before] = await withAuth(user, (sql) =>
    sql`SELECT name, note FROM lifestyle_drivers WHERE id = ${parsed.driverId} LIMIT 1`
  );

  await withAuth(user, (sql) =>
    sql`UPDATE lifestyle_drivers SET name = ${parsed.name}, note = ${parsed.note ?? null}, updated_at = ${new Date().toISOString()} WHERE id = ${parsed.driverId}`
  );

  await recordAudit({
    action: "update",
    entityType: "lifestyle_driver",
    entityId: parsed.driverId,
    patientId: parsed.patientId,
    meta: { before },
  });

  revalidate(parsed.patientId, parsed.pillarId);
}

export async function deleteDriver(args: { driverId: string; pillarId: string; patientId: string }) {
  const user = await requireClinician();

  const [before] = await withAuth(user, (sql) =>
    sql`SELECT name, note FROM lifestyle_drivers WHERE id = ${args.driverId} LIMIT 1`
  );
  await withAuth(user, (sql) => sql`DELETE FROM lifestyle_drivers WHERE id = ${args.driverId}`);

  await recordAudit({
    action: "delete",
    entityType: "lifestyle_driver",
    entityId: args.driverId,
    patientId: args.patientId,
    meta: { before },
  });

  revalidate(args.patientId, args.pillarId);
}

export async function toggleDriverHidden(args: { driverId: string; hidden: boolean; pillarId: string; patientId: string }) {
  const user = await requireClinician();

  await withAuth(user, (sql) =>
    sql`UPDATE lifestyle_drivers SET hidden = ${args.hidden}, updated_at = ${new Date().toISOString()} WHERE id = ${args.driverId}`
  );

  await recordAudit({
    action: "update",
    entityType: "lifestyle_driver",
    entityId: args.driverId,
    patientId: args.patientId,
    meta: { hidden: args.hidden },
  });

  revalidate(args.patientId, args.pillarId);
}

export async function moveDriver(args: { driverId: string; pillarId: string; patientId: string; direction: "up" | "down" }) {
  const user = await requireClinician();

  const rows = await withAuth(user, (sql) =>
    sql`SELECT id, sort_order FROM lifestyle_drivers WHERE pillar_id = ${args.pillarId} ORDER BY sort_order ASC`
  );

  const ordered = rows.map((r: any) => ({ id: r.id, sort_order: r.sort_order }));
  const idx = ordered.findIndex((r) => r.id === args.driverId);
  if (idx === -1) return;
  const swap = idx + (args.direction === "up" ? -1 : 1);
  if (swap < 0 || swap >= ordered.length) return;

  const a = ordered[idx], b = ordered[swap];
  await withAuth(user, (sql) => sql`UPDATE lifestyle_drivers SET sort_order = ${b.sort_order} WHERE id = ${a.id}`);
  await withAuth(user, (sql) => sql`UPDATE lifestyle_drivers SET sort_order = ${a.sort_order} WHERE id = ${b.id}`);

  await recordAudit({
    action: "update",
    entityType: "lifestyle_driver",
    entityId: args.driverId,
    patientId: args.patientId,
    meta: { reorder: args.direction },
  });

  revalidate(args.patientId, args.pillarId);
}

// ============================================================
// RECOMMENDATIONS
// ============================================================

const REC_STATUSES = ["active", "review", "paused"] as const;

const recUpdateSchema = z.object({
  recId: z.string().uuid(),
  pillarId: z.string().uuid(),
  patientId: z.string().uuid(),
  title: z.string().min(1).max(300),
  why: z.string().max(2000).nullish(),
  cadence: z.string().max(100).nullish(),
  status: z.enum(REC_STATUSES),
  link: z.string().max(50).nullish(),
});

export async function addBlankRec(args: { pillarId: string; patientId: string }) {
  const user = await requireClinician();

  const [pillar] = await withAuth(user, (sql) =>
    sql`SELECT clinic_id FROM pillars WHERE id = ${args.pillarId} LIMIT 1`
  );
  if (!pillar) throw new Error("Pillar not found");

  const [maxRow] = await withAuth(user, (sql) =>
    sql`SELECT sort_order FROM pillar_recommendations WHERE pillar_id = ${args.pillarId} ORDER BY sort_order DESC LIMIT 1`
  );
  const nextSortOrder = (maxRow?.sort_order ?? -1) + 1;

  const [inserted] = await withAuth(user, (sql) =>
    sql`INSERT INTO pillar_recommendations (clinic_id, patient_id, pillar_id, title, cadence, status, sort_order) VALUES (${pillar.clinic_id}, ${args.patientId}, ${args.pillarId}, 'New recommendation', 'Daily', 'active', ${nextSortOrder}) RETURNING id`
  );
  if (!inserted) throw new Error("Insert failed");

  await recordAudit({
    action: "create",
    entityType: "pillar_recommendation",
    entityId: inserted.id,
    patientId: args.patientId,
  });

  revalidate(args.patientId, args.pillarId);
  return inserted.id;
}

export async function updateRec(input: z.infer<typeof recUpdateSchema>) {
  const parsed = recUpdateSchema.parse(input);
  const user = await requireClinician();

  const [before] = await withAuth(user, (sql) =>
    sql`SELECT title, why, cadence, status, link FROM pillar_recommendations WHERE id = ${parsed.recId} LIMIT 1`
  );

  await withAuth(user, (sql) =>
    sql`UPDATE pillar_recommendations SET title = ${parsed.title}, why = ${parsed.why ?? null}, cadence = ${parsed.cadence ?? null}, status = ${parsed.status}, link = ${parsed.link ?? null}, updated_at = ${new Date().toISOString()} WHERE id = ${parsed.recId}`
  );

  await recordAudit({
    action: "update",
    entityType: "pillar_recommendation",
    entityId: parsed.recId,
    patientId: parsed.patientId,
    meta: { before },
  });

  revalidate(parsed.patientId, parsed.pillarId);
}

export async function deleteRec(args: { recId: string; pillarId: string; patientId: string }) {
  const user = await requireClinician();

  const [before] = await withAuth(user, (sql) =>
    sql`SELECT title FROM pillar_recommendations WHERE id = ${args.recId} LIMIT 1`
  );
  await withAuth(user, (sql) => sql`DELETE FROM pillar_recommendations WHERE id = ${args.recId}`);

  await recordAudit({
    action: "delete",
    entityType: "pillar_recommendation",
    entityId: args.recId,
    patientId: args.patientId,
    meta: { before },
  });

  revalidate(args.patientId, args.pillarId);
}

export async function toggleRecHidden(args: { recId: string; hidden: boolean; pillarId: string; patientId: string }) {
  const user = await requireClinician();

  await withAuth(user, (sql) =>
    sql`UPDATE pillar_recommendations SET hidden = ${args.hidden}, updated_at = ${new Date().toISOString()} WHERE id = ${args.recId}`
  );

  await recordAudit({
    action: "update",
    entityType: "pillar_recommendation",
    entityId: args.recId,
    patientId: args.patientId,
    meta: { hidden: args.hidden },
  });

  revalidate(args.patientId, args.pillarId);
}

export async function moveRec(args: { recId: string; pillarId: string; patientId: string; direction: "up" | "down" }) {
  const user = await requireClinician();

  const rows = await withAuth(user, (sql) =>
    sql`SELECT id, sort_order FROM pillar_recommendations WHERE pillar_id = ${args.pillarId} ORDER BY sort_order ASC`
  );

  const ordered = rows.map((r: any) => ({ id: r.id, sort_order: r.sort_order }));
  const idx = ordered.findIndex((r) => r.id === args.recId);
  if (idx === -1) return;
  const swap = idx + (args.direction === "up" ? -1 : 1);
  if (swap < 0 || swap >= ordered.length) return;

  const a = ordered[idx], b = ordered[swap];
  await withAuth(user, (sql) => sql`UPDATE pillar_recommendations SET sort_order = ${b.sort_order} WHERE id = ${a.id}`);
  await withAuth(user, (sql) => sql`UPDATE pillar_recommendations SET sort_order = ${a.sort_order} WHERE id = ${b.id}`);

  await recordAudit({
    action: "update",
    entityType: "pillar_recommendation",
    entityId: args.recId,
    patientId: args.patientId,
    meta: { reorder: args.direction },
  });

  revalidate(args.patientId, args.pillarId);
}

// ---------- Reorder factors (move up/down) ----------

export async function moveFactor(args: {
  factorId: string;
  pillarId: string;
  patientId: string;
  direction: "up" | "down";
}) {
  const user = await requireClinician();

  const rows = await withAuth(user, (sql) =>
    sql`SELECT id, sort_order FROM pillar_factors WHERE pillar_id = ${args.pillarId} ORDER BY sort_order ASC`
  );

  const ordered = rows.map((r: any) => ({ id: r.id, sort_order: r.sort_order }));
  const idx = ordered.findIndex((r) => r.id === args.factorId);
  if (idx === -1) return;
  const swap = idx + (args.direction === "up" ? -1 : 1);
  if (swap < 0 || swap >= ordered.length) return;

  const a = ordered[idx], b = ordered[swap];
  await withAuth(user, (sql) => sql`UPDATE pillar_factors SET sort_order = ${b.sort_order} WHERE id = ${a.id}`);
  await withAuth(user, (sql) => sql`UPDATE pillar_factors SET sort_order = ${a.sort_order} WHERE id = ${b.id}`);

  await recordAudit({
    action: "update",
    entityType: "pillar_factor",
    entityId: args.factorId,
    patientId: args.patientId,
    meta: { reorder: args.direction },
  });

  revalidate(args.patientId, args.pillarId);
}
