import { getUser } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import type { AuthUser } from "@/lib/auth/server";
import type { Appointment, AppointmentWithPrep, AppointmentType } from "@/lib/appointments-utils";

// Re-export types and pure helpers so server-only callers can use one import.
export type { Appointment, AppointmentWithPrep, AppointmentType } from "@/lib/appointments-utils";
export { apptTypeLabel, APPT_TYPES } from "@/lib/appointments-utils";

const SELECT = `
  id, scheduled_at, duration_minutes, type, title, location, status,
  pre_appointment_instructions, prep_notice_hours, notes, clinician_id,
  clinician:profiles!appointments_clinician_id_fkey ( first_name, last_name )
`.trim();

function mapRow(row: any): Appointment {
  const clin = row.clinician;
  return {
    id: row.id,
    scheduledAt: row.scheduled_at,
    durationMinutes: row.duration_minutes,
    type: row.type,
    title: row.title ?? null,
    location: row.location ?? null,
    status: row.status,
    preAppointmentInstructions: row.pre_appointment_instructions ?? null,
    prepNoticeHours: Number(row.prep_notice_hours ?? 24),
    notes: row.notes ?? null,
    clinicianId: row.clinician_id ?? null,
    clinicianName: clin
      ? `${clin.first_name ?? ""} ${clin.last_name ?? ""}`.trim() || null
      : null,
  };
}

/** All upcoming scheduled appointments for a patient, soonest first. */
export async function getUpcomingAppointments(
  patientId: string,
  user: AuthUser
): Promise<Appointment[]> {
  const nowIso = new Date().toISOString();
  const rows = await withAuth(user, (sql) =>
    sql`
      SELECT a.id, a.scheduled_at, a.duration_minutes, a.type, a.title, a.location, a.status,
             a.pre_appointment_instructions, a.prep_notice_hours, a.notes, a.clinician_id,
             p.first_name, p.last_name
      FROM appointments a
      LEFT JOIN profiles p ON p.id = a.clinician_id
      WHERE a.patient_id = ${patientId} AND a.status = 'scheduled' AND a.scheduled_at >= ${nowIso}
      ORDER BY a.scheduled_at ASC
    `
  );
  return rows.map((r: any) => mapRow({ ...r, clinician: r.first_name != null ? { first_name: r.first_name, last_name: r.last_name } : null }));
}

/** All appointments for a patient (past + future), most recent first — for the clinician view. */
export async function getPatientAppointmentsForClinician(
  patientId: string,
  user?: AuthUser
): Promise<Appointment[]> {
  const resolvedUser = user ?? (await getUser());
  if (!resolvedUser) return [];
  const rows = await withAuth(resolvedUser, (sql) =>
    sql`
      SELECT a.id, a.scheduled_at, a.duration_minutes, a.type, a.title, a.location, a.status,
             a.pre_appointment_instructions, a.prep_notice_hours, a.notes, a.clinician_id,
             p.first_name, p.last_name
      FROM appointments a
      LEFT JOIN profiles p ON p.id = a.clinician_id
      WHERE a.patient_id = ${patientId}
      ORDER BY a.scheduled_at DESC
    `
  );
  return rows.map((r: any) => mapRow({ ...r, clinician: r.first_name != null ? { first_name: r.first_name, last_name: r.last_name } : null }));
}

/** Clinic's custom appointment types, sorted by sort_order. Active only. */
export async function getClinicAppointmentTypes(user?: AuthUser): Promise<AppointmentType[]> {
  const resolvedUser = user ?? (await getUser());
  if (!resolvedUser) return [];
  const rows = await withAuth(resolvedUser, (sql) =>
    sql`SELECT id, name, slug, color, default_duration_minutes, sort_order, active FROM appointment_types WHERE active = true ORDER BY sort_order ASC`
  );
  return rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    color: r.color ?? null,
    defaultDurationMinutes: Number(r.default_duration_minutes),
    sortOrder: Number(r.sort_order),
    active: r.active,
  }));
}

/** All types (including inactive) — for the settings manager. */
export async function getAllClinicAppointmentTypes(user?: AuthUser): Promise<AppointmentType[]> {
  const resolvedUser = user ?? (await getUser());
  if (!resolvedUser) return [];
  const rows = await withAuth(resolvedUser, (sql) =>
    sql`SELECT id, name, slug, color, default_duration_minutes, sort_order, active FROM appointment_types ORDER BY sort_order ASC`
  );
  return rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    color: r.color ?? null,
    defaultDurationMinutes: Number(r.default_duration_minutes),
    sortOrder: Number(r.sort_order),
    active: r.active,
  }));
}

export async function getNextAppointmentWithPrep(
  patientId: string,
  user?: AuthUser
): Promise<AppointmentWithPrep | null> {
  const resolvedUser = user ?? (await getUser());
  if (!resolvedUser) return null;
  const now = new Date();
  const nowIso = now.toISOString();
  const [r] = await withAuth(resolvedUser, (sql) =>
    sql`
      SELECT a.id, a.scheduled_at, a.duration_minutes, a.type, a.title, a.location, a.status,
             a.pre_appointment_instructions, a.prep_notice_hours, a.notes, a.clinician_id,
             p.first_name, p.last_name
      FROM appointments a
      LEFT JOIN profiles p ON p.id = a.clinician_id
      WHERE a.patient_id = ${patientId} AND a.status = 'scheduled' AND a.scheduled_at >= ${nowIso}
      ORDER BY a.scheduled_at ASC
      LIMIT 1
    `
  );
  if (!r) return null;
  const appt = mapRow({ ...r, clinician: r.first_name != null ? { first_name: r.first_name, last_name: r.last_name } : null });
  const apptMs = new Date(appt.scheduledAt).getTime();
  const prepWindowMs = appt.prepNoticeHours * 60 * 60 * 1000;
  const showPrepSignal =
    !!appt.preAppointmentInstructions &&
    now.getTime() >= apptMs - prepWindowMs;
  return { ...appt, showPrepSignal };
}
