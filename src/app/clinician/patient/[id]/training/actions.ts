"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireClinician } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { canAccessPatient } from "@/lib/care-team";
import { recordAudit } from "@/lib/audit";

const KINDS = ["strength", "zone2", "vo2max", "mobility"] as const;

async function requireAccess(patientId: string) {
  const user = await requireClinician();
  const ok = await canAccessPatient(user, patientId);
  if (!ok) throw new Error("No access to this patient");
  return user;
}

const revalidateHub = (patientId: string) => {
  revalidatePath(`/clinician/patient/${patientId}/training`);
  revalidatePath(`/clinician/patient/${patientId}`);
};

// ── HR zones ────────────────────────────────────────────────────────────────
// Seed a patient's zones from the clinic's generic zones (once). No-op if the
// patient already has zones.
export async function seedPatientZones(input: { patientId: string }) {
  const user = await requireAccess(input.patientId);
  const [existing] = await withAuth(user, (sql) =>
    sql`SELECT 1 AS x FROM hr_zones WHERE patient_id = ${input.patientId} LIMIT 1`
  );
  if (existing) return;

  await withAuth(user, (sql) =>
    sql`
      INSERT INTO hr_zones (clinic_id, patient_id, zone_key, name, short_name, low_bpm, high_bpm, sort_order)
      SELECT clinic_id, ${input.patientId}, zone_key, name, short_name, low_bpm, high_bpm, sort_order
      FROM hr_zones WHERE clinic_id = ${user.clinicId} AND patient_id IS NULL
    `
  );
  await recordAudit({ action: "create", entityType: "hr_zone", entityId: input.patientId, patientId: input.patientId, meta: { seeded: true } });
  revalidateHub(input.patientId);
}

const zoneSchema = z.object({
  patientId: z.string().uuid(),
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  shortName: z.string().min(1).max(10),
  lowBpm: z.number().int().min(40).max(220),
  highBpm: z.number().int().min(40).max(220),
});

export async function updatePatientZone(input: z.infer<typeof zoneSchema>) {
  const parsed = zoneSchema.parse(input);
  const user = await requireAccess(parsed.patientId);
  await withAuth(user, (sql) =>
    sql`UPDATE hr_zones SET name = ${parsed.name}, short_name = ${parsed.shortName}, low_bpm = ${parsed.lowBpm}, high_bpm = ${parsed.highBpm}, updated_at = now()
        WHERE id = ${parsed.id} AND patient_id = ${parsed.patientId}`
  );
  await recordAudit({ action: "update", entityType: "hr_zone", entityId: parsed.id, patientId: parsed.patientId });
  revalidateHub(parsed.patientId);
}

// ── Sessions ─────────────────────────────────────────────────────────────────
export async function createPatientSession(input: { patientId: string; kind: (typeof KINDS)[number]; name: string }) {
  const user = await requireAccess(input.patientId);
  const estMinutes = input.kind === "mobility" ? 12 : input.kind === "zone2" ? 60 : input.kind === "vo2max" ? 38 : 45;
  const [inserted] = await withAuth(user, (sql) =>
    sql`INSERT INTO session_library (clinic_id, patient_id, kind, name, est_minutes) VALUES (${user.clinicId}, ${input.patientId}, ${input.kind}, ${input.name.trim()}, ${estMinutes}) RETURNING id`
  );
  if (!inserted) throw new Error("Insert failed");
  await recordAudit({ action: "create", entityType: "session_library", entityId: inserted.id, patientId: input.patientId, meta: { kind: input.kind, patientSpecific: true } });
  redirect(`/clinician/library/training/sessions/${inserted.id}`);
}

// Deep-clone a session (any generic template or patient session) into a NEW
// patient-owned session the provider can edit freely. Copies exercises + sets;
// remaps HR-zone references to the patient's own zones by zone_key.
export async function cloneSessionForPatient(input: { patientId: string; sourceSessionId: string; redirectToEditor?: boolean }) {
  const user = await requireAccess(input.patientId);
  const p = input.patientId;

  const [row] = await withAuth(user, (sql) =>
    sql`
      WITH src AS (SELECT * FROM session_library WHERE id = ${input.sourceSessionId})
      INSERT INTO session_library
        (clinic_id, patient_id, kind, name, focus, est_minutes, met, accent, coach_note, modality, duration_min,
         target_zone_id, warmup_min, rounds, work_min, work_zone_id, recover_min, recover_zone_id, cooldown_min)
      SELECT src.clinic_id, ${p}, src.kind, src.name, src.focus, src.est_minutes, src.met, src.accent, src.coach_note, src.modality, src.duration_min,
        (SELECT pz.id FROM hr_zones sz JOIN hr_zones pz ON pz.zone_key = sz.zone_key AND pz.patient_id = ${p} WHERE sz.id = src.target_zone_id LIMIT 1),
        src.warmup_min, src.rounds, src.work_min,
        (SELECT pz.id FROM hr_zones sz JOIN hr_zones pz ON pz.zone_key = sz.zone_key AND pz.patient_id = ${p} WHERE sz.id = src.work_zone_id LIMIT 1),
        src.recover_min,
        (SELECT pz.id FROM hr_zones sz JOIN hr_zones pz ON pz.zone_key = sz.zone_key AND pz.patient_id = ${p} WHERE sz.id = src.recover_zone_id LIMIT 1),
        src.cooldown_min
      FROM src
      RETURNING id
    `
  );
  if (!row) throw new Error("Clone failed");
  const newId = row.id as string;

  // Copy exercises (with per-session coach notes) + their sets.
  const exercises = await withAuth(user, (sql) =>
    sql`SELECT id, exercise_id, sort_order, coach_note FROM session_exercises WHERE session_id = ${input.sourceSessionId} ORDER BY sort_order ASC`
  );
  for (const ex of exercises as any[]) {
    const [newEx] = await withAuth(user, (sql) =>
      sql`INSERT INTO session_exercises (session_id, exercise_id, sort_order, coach_note) VALUES (${newId}, ${ex.exercise_id}, ${ex.sort_order}, ${ex.coach_note ?? null}) RETURNING id`
    );
    await withAuth(user, (sql) =>
      sql`
        INSERT INTO session_sets (session_exercise_id, set_number, reps, reps_min, reps_max, weight, duration_seconds)
        SELECT ${newEx.id}, set_number, reps, reps_min, reps_max, weight, duration_seconds
        FROM session_sets WHERE session_exercise_id = ${ex.id} ORDER BY set_number ASC
      `
    );
  }

  await recordAudit({ action: "create", entityType: "session_library", entityId: newId, patientId: p, meta: { clonedFrom: input.sourceSessionId } });
  if (input.redirectToEditor === false) { revalidateHub(p); return newId; }
  redirect(`/clinician/library/training/sessions/${newId}`);
}

export async function deletePatientSession(input: { patientId: string; sessionId: string }) {
  const user = await requireAccess(input.patientId);
  await withAuth(user, (sql) => sql`DELETE FROM session_library WHERE id = ${input.sessionId} AND patient_id = ${input.patientId}`);
  await recordAudit({ action: "delete", entityType: "session_library", entityId: input.sessionId, patientId: input.patientId });
  revalidateHub(input.patientId);
}

// ── Programs ─────────────────────────────────────────────────────────────────
export async function createPatientProgram(input: { patientId: string; name: string }) {
  const user = await requireAccess(input.patientId);
  const [inserted] = await withAuth(user, (sql) =>
    sql`INSERT INTO program_library (clinic_id, patient_id, name) VALUES (${user.clinicId}, ${input.patientId}, ${input.name.trim()}) RETURNING id`
  );
  if (!inserted) throw new Error("Insert failed");
  await recordAudit({ action: "create", entityType: "program_library", entityId: inserted.id, patientId: input.patientId, meta: { patientSpecific: true } });
  redirect(`/clinician/library/training/programs/${inserted.id}`);
}

// Deep-clone a program into a patient-owned one: clones each referenced session
// into patient-owned copies, then rebuilds the weekly days pointing at them.
export async function clonePatientProgram(input: { patientId: string; sourceProgramId: string }) {
  const user = await requireAccess(input.patientId);
  const p = input.patientId;

  const srcRows = await withAuth(user, (sql) =>
    sql`SELECT name, description FROM program_library WHERE id = ${input.sourceProgramId} LIMIT 1`
  );
  const src = (srcRows as any[])[0];
  if (!src) throw new Error("Source program not found");

  const [prog] = await withAuth(user, (sql) =>
    sql`INSERT INTO program_library (clinic_id, patient_id, name, description) VALUES (${user.clinicId}, ${p}, ${src.name}, ${src.description ?? null}) RETURNING id`
  );
  const newProgramId = prog.id as string;

  const days = await withAuth(user, (sql) =>
    sql`SELECT day, session_id, sort_order FROM program_days WHERE program_id = ${input.sourceProgramId} AND session_id IS NOT NULL ORDER BY sort_order ASC`
  );

  // Clone each distinct referenced session once, reuse the clone across days.
  const cloneBySource = new Map<string, string>();
  for (const d of days as any[]) {
    if (!cloneBySource.has(d.session_id)) {
      const cloneId = await cloneSessionForPatient({ patientId: p, sourceSessionId: d.session_id, redirectToEditor: false });
      cloneBySource.set(d.session_id, cloneId as string);
    }
    const cloneId = cloneBySource.get(d.session_id)!;
    await withAuth(user, (sql) =>
      sql`INSERT INTO program_days (program_id, day, session_id, sort_order) VALUES (${newProgramId}, ${d.day}, ${cloneId}, ${d.sort_order})`
    );
  }

  await recordAudit({ action: "create", entityType: "program_library", entityId: newProgramId, patientId: p, meta: { clonedFrom: input.sourceProgramId } });
  redirect(`/clinician/library/training/programs/${newProgramId}`);
}

export async function deletePatientProgram(input: { patientId: string; programId: string }) {
  const user = await requireAccess(input.patientId);
  await withAuth(user, (sql) => sql`DELETE FROM program_library WHERE id = ${input.programId} AND patient_id = ${input.patientId}`);
  await recordAudit({ action: "delete", entityType: "program_library", entityId: input.programId, patientId: input.patientId });
  revalidateHub(input.patientId);
}
