"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePatient } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { recordAudit } from "@/lib/audit";

const DisconnectInput = z.object({
  provider: z.enum(["oura", "whoop", "apple_health", "eight_sleep"]),
});

export async function disconnectWearable(input: z.infer<typeof DisconnectInput>) {
  const parsed = DisconnectInput.parse(input);
  const user = await requirePatient();

  // Look up connection via RLS-scoped view.
  const [conn] = await withAuth(user, (sql) =>
    sql`SELECT id, patient_id FROM wearable_connections_public WHERE provider = ${parsed.provider} LIMIT 1`
  );
  if (!conn) return { ok: true, alreadyMissing: true };
  if (conn.patient_id !== user.id) throw new Error("can only disconnect own integrations");

  // Revoke using service role (connections table has no RLS UPDATE policy).
  const { serviceRoleSql } = await import("@/lib/db/connection");
  await serviceRoleSql`UPDATE wearable_connections SET status = 'revoked', access_token = ${null}, refresh_token = ${null}, token_expires_at = ${null} WHERE id = ${conn.id}`;

  await recordAudit({
    action: "delete",
    entityType: "wearable_connection",
    entityId: conn.id,
    patientId: user.id,
    meta: { provider: parsed.provider },
  }).catch(() => undefined);

  revalidatePath("/home/profile/integrations");
  revalidatePath("/home");
  return { ok: true };
}
