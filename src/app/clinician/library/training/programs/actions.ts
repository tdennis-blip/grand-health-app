"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireClinician } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { recordAudit } from "@/lib/audit";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

const programHeaderSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
});

const setDaySchema = z.object({
  programId: z.string().uuid(),
  day: z.enum(DAYS),
  sessionId: z.string().uuid().nullable(),
});

const revalidateProgram = (id: string) => {
  revalidatePath(`/clinician/library/training/programs/${id}`);
  revalidatePath(`/clinician/library/training/programs`);
  revalidatePath(`/clinician/library/training`);
};

export async function createProgram(input: { name: string; description?: string | null }) {
  const user = await requireClinician();

  const [inserted] = await withAuth(user, (sql) =>
    sql`INSERT INTO program_library (clinic_id, name, description) VALUES (${user.clinicId}, ${input.name.trim()}, ${input.description?.trim() || null}) RETURNING id`
  );
  if (!inserted) throw new Error("Insert failed");

  for (const day of DAYS) {
    await withAuth(user, (sql) =>
      sql`INSERT INTO program_days (program_id, day, session_id) VALUES (${inserted.id}, ${day}, ${null})`
    );
  }

  await recordAudit({ action: "create", entityType: "program_library", entityId: inserted.id, meta: { name: input.name } });
  revalidateProgram(inserted.id);
  redirect(`/clinician/library/training/programs/${inserted.id}`);
}

export async function updateProgramHeader(input: z.infer<typeof programHeaderSchema>) {
  const parsed = programHeaderSchema.parse(input);
  const user = await requireClinician();

  const [before] = await withAuth(user, (sql) =>
    sql`SELECT name, description FROM program_library WHERE id = ${parsed.id} LIMIT 1`
  );

  await withAuth(user, (sql) =>
    sql`UPDATE program_library SET name = ${parsed.name}, description = ${parsed.description ?? null}, updated_at = ${new Date().toISOString()} WHERE id = ${parsed.id}`
  );

  await recordAudit({ action: "update", entityType: "program_library", entityId: parsed.id, meta: { before } });
  revalidateProgram(parsed.id);
}

export async function deleteProgram(id: string) {
  const user = await requireClinician();

  const [before] = await withAuth(user, (sql) =>
    sql`SELECT name FROM program_library WHERE id = ${id} LIMIT 1`
  );
  await withAuth(user, (sql) => sql`DELETE FROM program_library WHERE id = ${id}`);

  await recordAudit({ action: "delete", entityType: "program_library", entityId: id, meta: { before } });
  revalidatePath("/clinician/library/training/programs");
  revalidatePath("/clinician/library/training");
}

export async function setProgramDay(input: z.infer<typeof setDaySchema>) {
  const parsed = setDaySchema.parse(input);
  const user = await requireClinician();

  await withAuth(user, (sql) =>
    sql`INSERT INTO program_days (program_id, day, session_id) VALUES (${parsed.programId}, ${parsed.day}, ${parsed.sessionId}) ON CONFLICT (program_id, day) DO UPDATE SET session_id = EXCLUDED.session_id`
  );

  await recordAudit({ action: "update", entityType: "program_day", entityId: parsed.programId, meta: { day: parsed.day, session_id: parsed.sessionId } });
  revalidateProgram(parsed.programId);
}

export async function assignProgramToPatient(input: { programId: string; patientId: string }) {
  const user = await requireClinician();

  const [inserted] = await withAuth(user, (sql) =>
    sql`INSERT INTO program_assignments (clinic_id, program_id, patient_id) VALUES (${user.clinicId}, ${input.programId}, ${input.patientId}) RETURNING id`
  );
  if (!inserted) throw new Error("Insert failed");

  await recordAudit({ action: "create", entityType: "program_assignment", entityId: inserted.id, patientId: input.patientId, meta: { program_id: input.programId } });
  revalidatePath(`/clinician/patient/${input.patientId}`);
  return inserted.id as string;
}

export async function endProgramAssignment(input: { id: string; patientId: string }) {
  const user = await requireClinician();

  await withAuth(user, (sql) =>
    sql`UPDATE program_assignments SET ended_at = ${new Date().toISOString()} WHERE id = ${input.id}`
  );

  await recordAudit({ action: "update", entityType: "program_assignment", entityId: input.id, patientId: input.patientId, meta: { ended: true } });
  revalidatePath(`/clinician/patient/${input.patientId}`);
}
