// Daily refill-supply check cron. Protected by `MEDICATIONS_CRON_TOKEN`
// so only your scheduler can hit it.
//
// Iterates every active med with a quantity-on-hand value, computes the
// refill status, and writes one `audit_log` row per (med, day) pair for
// items in 'low' or 'out' state. Idempotent within a calendar day: the
// per-day key includes today's ISO date and we de-dupe by (entity_id,
// occurred_at::date) on insert.

import { NextResponse, type NextRequest } from "next/server";
import { serviceRoleSql } from "@/lib/db/connection";
import { getAllRefillFindings } from "@/lib/medications-refills";

export async function POST(req: NextRequest) {
  const expected = process.env.MEDICATIONS_CRON_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: "cron token not configured" }, { status: 500 });
  }
  // Header only — never accept the token in the query string (URLs are
  // logged by ALBs/proxies, which would leak the secret).
  const got = req.headers.get("x-cron-token");
  if (got !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const findings = await getAllRefillFindings();
  const today = new Date().toISOString().slice(0, 10);

  // De-dupe so re-running the cron the same day doesn't pile up alerts.
  const existing = new Set<string>();
  if (findings.length > 0) {
    const medIds = findings.map((f) => f.medicationId);
    const rows = await serviceRoleSql`
      SELECT entity_id FROM audit_log
      WHERE entity_type = 'medication_refill_alert'
        AND occurred_at >= ${`${today}T00:00:00Z`}
        AND entity_id = ANY(${medIds})
    `;
    for (const r of rows as any[]) existing.add(r.entity_id);
  }

  let inserted = 0;
  for (const f of findings) {
    if (existing.has(f.medicationId)) continue;
    try {
      await serviceRoleSql`
        INSERT INTO audit_log (clinic_id, actor_id, actor_role, action, entity_type, entity_id, patient_id, meta)
        VALUES (${f.clinicId}, ${null}, 'system', 'create', 'medication_refill_alert',
                ${f.medicationId}, ${f.patientId},
                ${JSON.stringify({ name: f.name, dose: f.dose, state: f.refill.state, days_remaining: f.refill.daysRemaining, last_refill_on: f.lastRefillOn })})
      `;
      inserted++;
    } catch { /* skip duplicate / constraint errors */ }
  }

  return NextResponse.json({
    ok: true,
    day: today,
    findings: findings.length,
    inserted_alerts: inserted,
    deduped_existing: existing.size,
  });
}

// Allow GET for manual smoke testing in non-prod environments.
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "use POST" }, { status: 405 });
  }
  return POST(req);
}
