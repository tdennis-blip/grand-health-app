"use server";

import { revalidatePath } from "next/cache";
import { requireClinician } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { z } from "zod";

const apptSchema = z.object({
  patientId:    z.string().uuid(),
  scheduledAt:  z.string().min(1),           // ISO datetime-local value
  durationMinutes: z.coerce.number().int().min(5).max(480).default(60),
  type:         z.string().default("follow_up"),
  title:        z.string().max(200).nullish(),
  location:     z.string().max(300).nullish(),
  preAppointmentInstructions: z.string().max(2000).nullish(),
  prepNoticeHours: z.coerce.number().int().min(1).max(168).default(24),
  notes:        z.string().max(5000).nullish(),
  clinicianId:  z.string().uuid().nullish(),
});

function revalidate(patientId: string) {
  revalidatePath(`/clinician/patient/${patientId}`);
}

export async function createAppointment(formData: FormData) {
  let user; try { user = await requireClinician(); } catch { return { ok: false, error: "Not authenticated" }; }

  const raw = Object.fromEntries(formData.entries());
  const parsed = apptSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const d = parsed.data;
  const scheduledAt = new Date(d.scheduledAt).toISOString();

  await withAuth(user, (sql) =>
    sql`INSERT INTO appointments (clinic_id, patient_id, clinician_id, scheduled_at, duration_minutes, type, title, location, pre_appointment_instructions, prep_notice_hours, notes, status) VALUES (${user.clinicId}, ${d.patientId}, ${d.clinicianId ?? user.id}, ${scheduledAt}, ${d.durationMinutes}, ${d.type}, ${d.title?.trim() || null}, ${d.location?.trim() || null}, ${d.preAppointmentInstructions?.trim() || null}, ${d.prepNoticeHours}, ${d.notes?.trim() || null}, 'scheduled')`
  );
  revalidate(d.patientId);
  return { ok: true };
}

export async function updateAppointment(id: string, patientId: string, formData: FormData) {
  let user; try { user = await requireClinician(); } catch { return { ok: false, error: "Not authenticated" }; }

  const raw = Object.fromEntries(formData.entries());
  const parsed = apptSchema.safeParse({ ...raw, patientId });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const d = parsed.data;
  const scheduledAt = new Date(d.scheduledAt).toISOString();

  await withAuth(user, (sql) =>
    sql`UPDATE appointments SET scheduled_at = ${scheduledAt}, duration_minutes = ${d.durationMinutes}, type = ${d.type}, title = ${d.title?.trim() || null}, location = ${d.location?.trim() || null}, pre_appointment_instructions = ${d.preAppointmentInstructions?.trim() || null}, prep_notice_hours = ${d.prepNoticeHours}, notes = ${d.notes?.trim() || null} WHERE id = ${id}`
  );
  revalidate(patientId);
  return { ok: true };
}

export async function cancelAppointment(id: string, patientId: string) {
  let user; try { user = await requireClinician(); } catch { return { ok: false, error: "Not authenticated" }; }
  await withAuth(user, (sql) => sql`UPDATE appointments SET status = 'cancelled' WHERE id = ${id}`);
  revalidate(patientId);
  return { ok: true };
}

export async function completeAppointment(id: string, patientId: string) {
  let user; try { user = await requireClinician(); } catch { return { ok: false, error: "Not authenticated" }; }
  await withAuth(user, (sql) => sql`UPDATE appointments SET status = 'completed' WHERE id = ${id}`);
  revalidate(patientId);
  return { ok: true };
}
