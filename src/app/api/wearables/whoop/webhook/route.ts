// Whoop webhook receiver.
//
// Whoop sends `{ user_id, type, id, trace_id }`. The shared-secret signature
// is in header `x-whoop-signature` (HMAC-SHA256 over the raw body, base64).
//
// Same strategy as Oura: log + re-fetch last 2 days for the affected user.
import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { serviceRoleSql } from "@/lib/db/connection";
import {
  daysAgo,
  getConnectionByProviderUserId,
  syncConnectionRange,
  ymd,
} from "@/lib/wearables/sync";

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const signature = req.headers.get("x-whoop-signature") ?? null;
  const verified = verifySignature(raw, signature);

  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = { raw };
  }

  const [event] = await serviceRoleSql<{ id: string }[]>`
    INSERT INTO wearable_webhook_events (provider, event_type, provider_user_id, payload, signature)
    VALUES ('whoop', ${payload?.type ?? null},
            ${payload?.user_id != null ? String(payload.user_id) : null},
            ${JSON.stringify(payload)}, ${signature})
    RETURNING id
  `;

  if (!verified) {
    return NextResponse.json({ ok: false, reason: "signature" }, { status: 401 });
  }

  try {
    const providerUserId = payload?.user_id;
    if (providerUserId == null) {
      throw new Error("missing user_id in payload");
    }
    const conn = await getConnectionByProviderUserId("whoop", String(providerUserId));
    if (!conn) {
      await markProcessed(event?.id, "no_connection");
      return NextResponse.json({ ok: true });
    }
    await syncConnectionRange(conn, daysAgo(2), ymd(new Date()));
    await markProcessed(event?.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    await markProcessed(event?.id, msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

function verifySignature(raw: string, signature: string | null): boolean {
  const secret = process.env.WHOOP_WEBHOOK_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV !== "production") return true;
    return false;
  }
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("base64");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

async function markProcessed(eventId: string | undefined, error?: string) {
  if (!eventId) return;
  await serviceRoleSql`
    UPDATE wearable_webhook_events
    SET processed_at = ${new Date().toISOString()}, error = ${error ?? null}
    WHERE id = ${eventId}
  `;
}
