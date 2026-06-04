"use server";

import { revalidatePath } from "next/cache";
import { requireClinician } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { z } from "zod";

function revalidate() {
  revalidatePath("/clinician/settings/appointment-types");
  revalidatePath("/clinician/patient", "layout");
}

const createSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(60).regex(/^[a-z0-9_]+$/, "Slug must be lowercase letters, numbers, underscores only"),
  defaultDurationMinutes: z.coerce.number().int().min(5).max(480).default(60),
  color: z.string().max(30).nullish(),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export async function createAppointmentType(formData: FormData) {
  let user; try { user = await requireClinician(); } catch { return { ok: false, error: "Not authenticated" }; }

  const parsed = createSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  await withAuth(user, (sql) =>
    sql`INSERT INTO appointment_types (clinic_id, name, slug, default_duration_minutes, color, sort_order, active) VALUES (${user.clinicId}, ${parsed.data.name.trim()}, ${parsed.data.slug.trim()}, ${parsed.data.defaultDurationMinutes}, ${parsed.data.color?.trim() || null}, ${parsed.data.sortOrder}, true)`
  );

  revalidate();
  return { ok: true };
}

const updateSchema = z.object({
  name: z.string().min(1).max(100),
  defaultDurationMinutes: z.coerce.number().int().min(5).max(480),
  color: z.string().max(30).nullish(),
  sortOrder: z.coerce.number().int().min(0),
});

export async function updateAppointmentType(id: string, formData: FormData) {
  let user; try { user = await requireClinician(); } catch { return { ok: false, error: "Not authenticated" }; }

  const parsed = updateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  await withAuth(user, (sql) =>
    sql`UPDATE appointment_types SET name = ${parsed.data.name.trim()}, default_duration_minutes = ${parsed.data.defaultDurationMinutes}, color = ${parsed.data.color?.trim() || null}, sort_order = ${parsed.data.sortOrder} WHERE id = ${id} AND clinic_id = ${user.clinicId}`
  );

  revalidate();
  return { ok: true };
}

export async function toggleAppointmentTypeActive(id: string, active: boolean) {
  let user; try { user = await requireClinician(); } catch { return { ok: false, error: "Not authenticated" }; }

  await withAuth(user, (sql) =>
    sql`UPDATE appointment_types SET active = ${active} WHERE id = ${id} AND clinic_id = ${user.clinicId}`
  );

  revalidate();
  return { ok: true };
}

export async function deleteAppointmentType(id: string) {
  let user; try { user = await requireClinician(); } catch { return { ok: false, error: "Not authenticated" }; }

  await withAuth(user, (sql) =>
    sql`DELETE FROM appointment_types WHERE id = ${id} AND clinic_id = ${user.clinicId}`
  );

  revalidate();
  return { ok: true };
}
