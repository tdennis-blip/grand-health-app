"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireClinician } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { recordAudit } from "@/lib/audit";

const KINDS = ["strength", "mobility"] as const;

const exerciseSchema = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(KINDS).default("strength"),
  name: z.string().min(1).max(200),
  primaryArea: z.string().max(100).nullish(),
  coachNote: z.string().max(2000).nullish(),
  videoTitle: z.string().max(200).nullish(),
  videoLength: z.string().max(50).nullish(),
  videoUrl: z.string().max(2000).nullish(),
  videoPublicId: z.string().max(500).nullish(),
});

const revalidateAll = () => revalidatePath("/clinician/library/training/exercises");

export async function createExercise(input: z.infer<typeof exerciseSchema>) {
  const parsed = exerciseSchema.parse(input);
  const user = await requireClinician();

  const [inserted] = await withAuth(user, (sql) =>
    sql`INSERT INTO exercise_library (clinic_id, kind, name, primary_area, coach_note, video_title, video_length, video_url, video_public_id) VALUES (${user.clinicId}, ${parsed.kind}, ${parsed.name}, ${parsed.primaryArea ?? null}, ${parsed.coachNote ?? null}, ${parsed.videoTitle ?? null}, ${parsed.videoLength ?? null}, ${parsed.videoUrl ?? null}, ${parsed.videoPublicId ?? null}) RETURNING id`
  );
  if (!inserted) throw new Error("Insert failed");

  await recordAudit({ action: "create", entityType: "exercise_library", entityId: inserted.id, meta: { name: parsed.name, kind: parsed.kind } });
  revalidateAll();
  return inserted.id as string;
}

export async function updateExercise(input: z.infer<typeof exerciseSchema> & { id: string }) {
  const parsed = exerciseSchema.extend({ id: z.string().uuid() }).parse(input);
  const user = await requireClinician();

  const [before] = await withAuth(user, (sql) =>
    sql`SELECT kind, name, primary_area, coach_note, video_title, video_length, video_url FROM exercise_library WHERE id = ${parsed.id} LIMIT 1`
  );

  await withAuth(user, (sql) =>
    sql`UPDATE exercise_library SET kind = ${parsed.kind}, name = ${parsed.name}, primary_area = ${parsed.primaryArea ?? null}, coach_note = ${parsed.coachNote ?? null}, video_title = ${parsed.videoTitle ?? null}, video_length = ${parsed.videoLength ?? null}, video_url = ${parsed.videoUrl ?? null}, video_public_id = ${parsed.videoPublicId ?? null}, updated_at = ${new Date().toISOString()} WHERE id = ${parsed.id}`
  );

  await recordAudit({ action: "update", entityType: "exercise_library", entityId: parsed.id, meta: { before } });
  revalidateAll();
}

export async function deleteExercise(id: string) {
  const user = await requireClinician();

  const [before] = await withAuth(user, (sql) =>
    sql`SELECT name FROM exercise_library WHERE id = ${id} LIMIT 1`
  );
  await withAuth(user, (sql) => sql`DELETE FROM exercise_library WHERE id = ${id}`);

  await recordAudit({ action: "delete", entityType: "exercise_library", entityId: id, meta: { before } });
  revalidateAll();
}
