"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireClinician } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { recordAudit } from "@/lib/audit";

const KINDS = ["strength", "zone2", "vo2max", "mobility"] as const;

const ACCENT_DEFAULTS: Record<string, string> = {
  strength: "from-blue-600 to-cyan-600",
  zone2:    "from-teal-500 to-cyan-600",
  vo2max:   "from-rose-500 to-red-600",
  mobility: "from-amber-500 to-orange-500",
};

const headerSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(KINDS),
  name: z.string().min(1).max(200),
  focus: z.string().max(200).nullish(),
  estMinutes: z.number().int().min(5).max(600),
  accent: z.string().max(100).nullish(),
  coachNote: z.string().max(2000).nullish(),
  modality: z.string().max(200).nullish(),
  durationMin: z.number().int().nullish(),
  targetZoneId: z.string().uuid().nullish(),
  warmupMin: z.number().int().nullish(),
  rounds: z.number().int().nullish(),
  workMin: z.number().int().nullish(),
  workZoneId: z.string().uuid().nullish(),
  recoverMin: z.number().int().nullish(),
  recoverZoneId: z.string().uuid().nullish(),
  cooldownMin: z.number().int().nullish(),
});

const revalidateSession = (id: string) => {
  revalidatePath(`/clinician/library/training/sessions/${id}`);
  revalidatePath(`/clinician/library/training/sessions`);
  revalidatePath(`/clinician/library/training`);
};

export async function createSession(input: { kind: typeof KINDS[number]; name: string }) {
  const user = await requireClinician();
  const estMinutes = input.kind === "mobility" ? 12 : input.kind === "zone2" ? 60 : input.kind === "vo2max" ? 38 : 45;

  const [inserted] = await withAuth(user, (sql) =>
    sql`INSERT INTO session_library (clinic_id, kind, name, est_minutes, accent) VALUES (${user.clinicId}, ${input.kind}, ${input.name.trim()}, ${estMinutes}, ${ACCENT_DEFAULTS[input.kind] ?? null}) RETURNING id`
  );
  if (!inserted) throw new Error("Insert failed");

  await recordAudit({ action: "create", entityType: "session_library", entityId: inserted.id, meta: { kind: input.kind, name: input.name } });
  revalidateSession(inserted.id);
  redirect(`/clinician/library/training/sessions/${inserted.id}`);
}

export async function deleteSession(id: string) {
  const user = await requireClinician();

  const [before] = await withAuth(user, (sql) =>
    sql`SELECT name, kind FROM session_library WHERE id = ${id} LIMIT 1`
  );
  await withAuth(user, (sql) => sql`DELETE FROM session_library WHERE id = ${id}`);

  await recordAudit({ action: "delete", entityType: "session_library", entityId: id, meta: { before } });
  revalidatePath("/clinician/library/training/sessions");
  revalidatePath("/clinician/library/training");
}

export async function updateSessionHeader(input: z.infer<typeof headerSchema>) {
  const parsed = headerSchema.parse(input);
  const user = await requireClinician();

  const modality = parsed.kind === "zone2" || parsed.kind === "vo2max" ? (parsed.modality ?? null) : null;
  // Persist the same fallback defaults the editor shows, so cardio fields are
  // never saved as null (which would zero out the weekly summary / est minutes).
  const duration_min = parsed.kind === "zone2" ? (parsed.durationMin ?? 30) : null;
  const target_zone_id = parsed.kind === "zone2" ? (parsed.targetZoneId ?? null) : null;
  const warmup_min = parsed.kind === "vo2max" ? (parsed.warmupMin ?? 10) : null;
  const rounds = parsed.kind === "vo2max" ? (parsed.rounds ?? 4) : null;
  const work_min = parsed.kind === "vo2max" ? (parsed.workMin ?? 4) : null;
  const work_zone_id = parsed.kind === "vo2max" ? (parsed.workZoneId ?? null) : null;
  const recover_min = parsed.kind === "vo2max" ? (parsed.recoverMin ?? 3) : null;
  const recover_zone_id = parsed.kind === "vo2max" ? (parsed.recoverZoneId ?? null) : null;
  const cooldown_min = parsed.kind === "vo2max" ? (parsed.cooldownMin ?? 5) : null;

  await withAuth(user, (sql) =>
    sql`UPDATE session_library SET kind = ${parsed.kind}, name = ${parsed.name}, focus = ${parsed.focus ?? null}, est_minutes = ${parsed.estMinutes}, accent = ${parsed.accent ?? null}, coach_note = ${parsed.coachNote ?? null}, modality = ${modality}, duration_min = ${duration_min}, target_zone_id = ${target_zone_id}, warmup_min = ${warmup_min}, rounds = ${rounds}, work_min = ${work_min}, work_zone_id = ${work_zone_id}, recover_min = ${recover_min}, recover_zone_id = ${recover_zone_id}, cooldown_min = ${cooldown_min}, updated_at = ${new Date().toISOString()} WHERE id = ${parsed.id}`
  );

  await recordAudit({ action: "update", entityType: "session_library", entityId: parsed.id });
  revalidateSession(parsed.id);
}

export async function addSessionExercise(args: { sessionId: string; exerciseId: string }) {
  const user = await requireClinician();

  const [maxRow] = await withAuth(user, (sql) =>
    sql`SELECT sort_order FROM session_exercises WHERE session_id = ${args.sessionId} ORDER BY sort_order DESC LIMIT 1`
  );
  const nextSortOrder = (maxRow?.sort_order ?? -1) + 1;

  const [inserted] = await withAuth(user, (sql) =>
    sql`INSERT INTO session_exercises (session_id, exercise_id, sort_order) VALUES (${args.sessionId}, ${args.exerciseId}, ${nextSortOrder}) RETURNING id`
  );
  if (!inserted) throw new Error("Insert failed");

  await withAuth(user, (sql) =>
    sql`INSERT INTO session_sets (session_exercise_id, set_number, reps, weight) VALUES (${inserted.id}, 1, 10, 0)`
  );

  await recordAudit({ action: "create", entityType: "session_exercise", entityId: inserted.id, meta: { session_id: args.sessionId, exercise_id: args.exerciseId } });
  revalidateSession(args.sessionId);
  return inserted.id as string;
}

export async function removeSessionExercise(args: { id: string; sessionId: string }) {
  const user = await requireClinician();
  await withAuth(user, (sql) => sql`DELETE FROM session_exercises WHERE id = ${args.id}`);
  await recordAudit({ action: "delete", entityType: "session_exercise", entityId: args.id });
  revalidateSession(args.sessionId);
}

export async function moveSessionExercise(args: { id: string; sessionId: string; direction: "up" | "down" }) {
  const user = await requireClinician();

  const rows = await withAuth(user, (sql) =>
    sql`SELECT id, sort_order FROM session_exercises WHERE session_id = ${args.sessionId} ORDER BY sort_order ASC`
  );

  const ordered = rows.map((r: any) => ({ id: r.id, sort_order: r.sort_order }));
  const idx = ordered.findIndex((r) => r.id === args.id);
  if (idx === -1) return;
  const swap = idx + (args.direction === "up" ? -1 : 1);
  if (swap < 0 || swap >= ordered.length) return;

  const a = ordered[idx], b = ordered[swap];
  await withAuth(user, (sql) => sql`UPDATE session_exercises SET sort_order = ${b.sort_order} WHERE id = ${a.id}`);
  await withAuth(user, (sql) => sql`UPDATE session_exercises SET sort_order = ${a.sort_order} WHERE id = ${b.id}`);
  revalidateSession(args.sessionId);
}

export async function changeSessionExercise(args: { id: string; sessionId: string; exerciseId: string }) {
  const user = await requireClinician();
  await withAuth(user, (sql) => sql`UPDATE session_exercises SET exercise_id = ${args.exerciseId} WHERE id = ${args.id}`);
  revalidateSession(args.sessionId);
}

export async function addSet(args: { sessionExerciseId: string; sessionId: string }) {
  const user = await requireClinician();

  const [last] = await withAuth(user, (sql) =>
    sql`SELECT set_number, reps, weight, duration_seconds FROM session_sets WHERE session_exercise_id = ${args.sessionExerciseId} ORDER BY set_number DESC LIMIT 1`
  );
  const nextNumber = (last?.set_number ?? 0) + 1;
  await withAuth(user, (sql) =>
    sql`INSERT INTO session_sets (session_exercise_id, set_number, reps, weight, duration_seconds) VALUES (${args.sessionExerciseId}, ${nextNumber}, ${last?.reps ?? 10}, ${last?.weight ?? 0}, ${last?.duration_seconds ?? null})`
  );
  revalidateSession(args.sessionId);
}

export async function removeSet(args: { id: string; sessionId: string }) {
  const user = await requireClinician();
  await withAuth(user, (sql) => sql`DELETE FROM session_sets WHERE id = ${args.id}`);
  revalidateSession(args.sessionId);
}

export async function updateSet(args: { id: string; sessionId: string; reps: number; weight: number; durationSeconds?: number | null }) {
  const user = await requireClinician();
  await withAuth(user, (sql) => sql`UPDATE session_sets SET reps = ${args.reps}, weight = ${args.weight}, duration_seconds = ${args.durationSeconds ?? null} WHERE id = ${args.id}`);
  revalidateSession(args.sessionId);
}
