// Audit logger. Call from any server action or route handler that touches
// PHI. Inserts a row into public.audit_log via the user's authenticated
// session, so RLS enforces that actor_id matches the JWT.
//
// Keep this dead simple: a single recordAudit() that takes the action,
// entity info, optional patient context, and a meta blob. The before/after
// diff convention is meta: { before, after } — keep both small.
import { headers } from "next/headers";
import { getUser } from "@/lib/auth/server";
import { serviceRoleSql } from "@/lib/db/connection";

export type AuditAction =
  | "read"
  | "create"
  | "update"
  | "delete"
  | "login"
  | "logout"
  | "export"
  | "invite";

export type AuditInput = {
  action: AuditAction;
  entityType: string;        // 'pillar_factor', 'pillar', 'patient_profile', etc.
  entityId?: string | null;
  patientId?: string | null;
  meta?: Record<string, unknown> | null;
};

export async function recordAudit(input: AuditInput): Promise<void> {
  const user = await getUser();
  if (!user) return; // unauthenticated — nothing to log

  // Never throw (an audit failure shouldn't 500 a PHI page), but never fail
  // SILENTLY either — callers used to wrap this in `.catch(() => {})`, which
  // meant a DB hiccup dropped audit rows with no trace. The AUDIT_WRITE_FAILED
  // marker is greppable in CloudWatch; alarm on it.
  try {
    const h = await headers();
    await serviceRoleSql`
      INSERT INTO audit_log (clinic_id, actor_id, actor_role, action, entity_type, entity_id, patient_id, meta, ip_address, user_agent)
      VALUES (${user.clinicId}, ${user.id}, ${user.role}, ${input.action}, ${input.entityType},
              ${input.entityId ?? null}, ${input.patientId ?? null},
              ${input.meta ? JSON.stringify(input.meta) : null},
              ${h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? null},
              ${h.get("user-agent") ?? null})
    `;
  } catch (err) {
    console.error("AUDIT_WRITE_FAILED", {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      patientId: input.patientId ?? null,
      actorId: user.id,
      err,
    });
  }
}
