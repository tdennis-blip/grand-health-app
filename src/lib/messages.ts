// Server-side helpers for the messages table. Reads run through the
// caller's authenticated Supabase session, so RLS handles all scoping.
//
// Types + pure helpers live in `messages-shared.ts` so client components
// can import them without dragging in `next/headers`.

import { getUser } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { recordAudit } from "@/lib/audit";
import type {
  Message,
  ParticipantProfile,
  ClinicianOption,
  InboxEntry,
} from "./messages-shared";

export type {
  Message,
  ParticipantProfile,
  ClinicianOption,
  InboxEntry,
} from "./messages-shared";
export { displayName } from "./messages-shared";

function mapRow(r: any): Message {
  return {
    id: r.id,
    clinicId: r.clinic_id,
    patientId: r.patient_id,
    senderId: r.sender_id,
    senderRole: r.sender_role,
    recipientId: r.recipient_id,
    body: r.body,
    recipientReadAt: r.recipient_read_at,
    createdAt: r.created_at,
  };
}

// Full message history for a patient's thread, oldest → newest.
export async function getThread(patientId: string): Promise<Message[]> {
  const user = await getUser();
  if (!user) return [];
  const rows = await withAuth(user, (sql) =>
    sql`SELECT id, clinic_id, patient_id, sender_id, sender_role, recipient_id, body, recipient_read_at, created_at FROM messages WHERE patient_id = ${patientId} ORDER BY created_at ASC`
  );
  // HIPAA read audit: who viewed this message thread. Never blocks the read.
  recordAudit({
    action: "read",
    entityType: "message_thread",
    patientId,
    meta: { messageCount: rows.length },
  }).catch(() => {});
  return rows.map(mapRow);
}

// Profiles needed to render names + avatars on a thread (patient + any
// clinician who ever participated).
export async function getThreadParticipants(patientId: string): Promise<Record<string, ParticipantProfile>> {
  const user = await getUser();
  if (!user) return {};

  const msgs = await withAuth(user, (sql) =>
    sql`SELECT sender_id, recipient_id FROM messages WHERE patient_id = ${patientId}`
  );

  const ids: string[] = [patientId];
  msgs.forEach((m: any) => {
    if (!ids.includes(m.sender_id)) ids.push(m.sender_id);
    if (!ids.includes(m.recipient_id)) ids.push(m.recipient_id);
  });

  const profiles = await withAuth(user, (sql) =>
    sql`SELECT id, first_name, last_name, role FROM profiles WHERE id = ANY(${ids})`
  );

  const out: Record<string, ParticipantProfile> = {};
  profiles.forEach((p: any) => {
    out[p.id] = {
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      role: p.role,
    };
  });
  return out;
}

// Clinicians the patient can message — everyone with role=clinician in
// their clinic. Primary clinician (if any) is flagged so the picker
// can default to them.
export async function getMessagableClinicians(): Promise<ClinicianOption[]> {
  const user = await getUser();
  if (!user) return [];

  const [[ppRow]] = await Promise.all([
    withAuth(user, (sql) =>
      sql`SELECT primary_clinician_id FROM patient_profiles WHERE profile_id = ${user.id} LIMIT 1`
    ),
  ]);

  const clinicId = user.clinicId;
  if (!clinicId) return [];

  // Only ACTIVE clinicians — a deactivated clinician can't read their inbox,
  // so offering them as a recipient would send messages into a void.
  const clinicians = await withAuth(user, (sql) =>
    sql`
      SELECT p.id, p.first_name, p.last_name, cp.title
      FROM profiles p
      JOIN clinician_profiles cp ON cp.profile_id = p.id
      WHERE p.clinic_id = ${clinicId} AND p.role = 'clinician'
        AND cp.deactivated_at IS NULL
      ORDER BY p.last_name ASC
    `
  );

  const primaryId = ppRow?.primary_clinician_id ?? null;

  return clinicians.map((c: any) => ({
    id: c.id,
    firstName: c.first_name,
    lastName: c.last_name,
    title: c.title ?? null,
    isPrimary: c.id === primaryId,
  }));
}

// Clinician inbox: every patient in the clinic, with most-recent message
// snippet and per-clinician unread count.
export async function getClinicianInbox(): Promise<InboxEntry[]> {
  const user = await getUser();
  if (!user) return [];

  const patients = await withAuth(user, (sql) =>
    sql`
      SELECT pp.profile_id, p.first_name, p.last_name
      FROM patient_profiles pp
      JOIN profiles p ON p.id = pp.profile_id
    `
  );

  const entries: InboxEntry[] = patients.map((p: any) => ({
    patientId: p.profile_id,
    patientFirstName: p.first_name ?? null,
    patientLastName: p.last_name ?? null,
    lastMessage: null,
    unreadForMe: 0,
  }));

  if (entries.length === 0) return entries;

  const patientIds = entries.map((e) => e.patientId);
  const [recent, unread] = await Promise.all([
    withAuth(user, (sql) =>
      sql`SELECT id, clinic_id, patient_id, sender_id, sender_role, recipient_id, body, recipient_read_at, created_at FROM messages WHERE patient_id = ANY(${patientIds}) ORDER BY created_at DESC LIMIT 500`
    ),
    withAuth(user, (sql) =>
      sql`SELECT patient_id FROM messages WHERE patient_id = ANY(${patientIds}) AND recipient_id = ${user.id} AND recipient_read_at IS NULL`
    ),
  ]);

  const lastByPatient: Record<string, Message> = {};
  recent.forEach((m: any) => {
    if (!lastByPatient[m.patient_id]) {
      lastByPatient[m.patient_id] = mapRow(m);
    }
  });

  const unreadByPatient: Record<string, number> = {};
  unread.forEach((m: any) => {
    unreadByPatient[m.patient_id] = (unreadByPatient[m.patient_id] ?? 0) + 1;
  });

  entries.forEach((e) => {
    e.lastMessage = lastByPatient[e.patientId] ?? null;
    e.unreadForMe = unreadByPatient[e.patientId] ?? 0;
  });

  // Sort: unread first, then by most recent message, then by name.
  entries.sort((a, b) => {
    if (a.unreadForMe !== b.unreadForMe) return b.unreadForMe - a.unreadForMe;
    const at = a.lastMessage?.createdAt ?? "";
    const bt = b.lastMessage?.createdAt ?? "";
    if (at !== bt) return bt.localeCompare(at);
    return (a.patientLastName ?? "").localeCompare(b.patientLastName ?? "");
  });

  return entries;
}

// Unread count for the current user across all their threads. Used for
// the "Messages" nav badge.
export async function getMyUnreadCount(): Promise<number> {
  const user = await getUser();
  if (!user) return 0;

  const [r] = await withAuth(user, (sql) =>
    sql`SELECT count(*)::int AS n FROM messages WHERE recipient_id = ${user.id} AND recipient_read_at IS NULL`
  );
  return r?.n ?? 0;
}
