// On-demand wearable refresh for the signed-in patient. Called when the app
// is opened (see the patient layout's <WearableRefresh /> trigger) so data is
// near-fresh without waiting for the daily cron or a webhook.
//
// Rate-limited: a connection synced within the last STALE_AFTER_MS is skipped,
// so navigating around the app doesn't hammer the provider's API.
import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth/server";
import {
  daysAgo,
  listActiveConnectionsForPatient,
  syncConnectionRange,
  ymd,
} from "@/lib/wearables/sync";

const STALE_AFTER_MS = 30 * 60 * 1000; // 30 minutes

export async function POST() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "patient") {
    return NextResponse.json({ ok: true, skipped: "not_patient" });
  }

  const conns = await listActiveConnectionsForPatient(user.id);
  if (conns.length === 0) return NextResponse.json({ ok: true, synced: 0 });

  const now = Date.now();
  const start = daysAgo(2);
  const end = ymd(new Date());

  const results: Array<{ provider: string; ok: boolean; rows?: number; skipped?: boolean; error?: string }> = [];
  for (const c of conns) {
    const last = c.last_synced_at ? new Date(c.last_synced_at).getTime() : 0;
    if (now - last < STALE_AFTER_MS) {
      results.push({ provider: c.provider, ok: true, skipped: true });
      continue;
    }
    try {
      const n = await syncConnectionRange(c, start, end);
      results.push({ provider: c.provider, ok: true, rows: n });
    } catch (err) {
      results.push({ provider: c.provider, ok: false, error: err instanceof Error ? err.message : "error" });
    }
  }

  const synced = results.filter((r) => r.ok && !r.skipped && r.rows != null).length;
  return NextResponse.json({ ok: true, synced, results });
}
