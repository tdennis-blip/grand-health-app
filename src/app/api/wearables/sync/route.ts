// Daily backfill cron. Protected by `WEARABLES_CRON_TOKEN` so only your
// scheduler (Amplify scheduled job, EventBridge, Trigger.dev, etc.) can
// invoke it.
//
// Iterates every active connection and refetches the last 2 days. Catches
// per-connection failures so one bad token doesn't block the whole run.
import { NextResponse, type NextRequest } from "next/server";
import { daysAgo, listActiveConnections, syncConnectionRange, ymd } from "@/lib/wearables/sync";

export async function POST(req: NextRequest) {
  const expected = process.env.WEARABLES_CRON_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: "cron token not configured" }, { status: 500 });
  }
  const got = req.headers.get("x-cron-token") ?? req.nextUrl.searchParams.get("token");
  if (got !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const start = daysAgo(2);
  const end = ymd(new Date());
  const conns = await listActiveConnections();

  const results: Array<{ id: string; provider: string; ok: boolean; rows?: number; error?: string }> = [];
  for (const c of conns) {
    try {
      const n = await syncConnectionRange(c, start, end);
      results.push({ id: c.id, provider: c.provider, ok: true, rows: n });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "error";
      results.push({ id: c.id, provider: c.provider, ok: false, error: msg });
    }
  }

  return NextResponse.json({
    ok: true,
    range: { start, end },
    count: conns.length,
    results,
  });
}

// Allow GET for manual smoke testing in non-prod environments.
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "use POST" }, { status: 405 });
  }
  return POST(req);
}
