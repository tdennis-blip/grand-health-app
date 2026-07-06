// Oura webhook receiver.
//
// Oura calls the URL configured in the developer portal whenever a new
// document is created or updated for an authorized user. The body looks
// like: { event_type, data_type, object_id, user_id, ... }.
//
// We don't trust the inline payload — we log the event then re-fetch the
// last 2 days for the affected user so we always have authoritative data.
//
// Signature verification: Oura signs webhooks with HMAC-SHA256 using your
// client_secret as the key, in header `x-oura-signature`. We verify when
// OURA_WEBHOOK_SECRET is configured.
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
  const signature = req.headers.get("x-oura-signature") ?? null;

  // Reject unverified payloads BEFORE touching the database — otherwise
  // anyone who finds the URL can fill the table with junk (DoS vector).
  const verified = verifySignature(raw, signature);
  if (!verified) {
    return NextResponse.json({ ok: false, reason: "signature" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = { raw };
  }

  const [event] = await serviceRoleSql<{ id: string }[]>`
    INSERT INTO wearable_webhook_events (provider, event_type, provider_user_id, payload, signature)
    VALUES ('oura', ${payload?.event_type ?? null}, ${payload?.user_id ?? null},
            ${JSON.stringify(payload)}, ${signature})
    RETURNING id
  `;

  try {
    const providerUserId = payload?.user_id;
    if (!providerUserId) {
      throw new Error("missing user_id in payload");
    }
    const conn = await getConnectionByProviderUserId("oura", String(providerUserId));
    if (!conn) {
      // Unknown user — happens before initial OAuth or after revoke. Treat
      // as benign and ack.
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
  const secret = process.env.OURA_WEBHOOK_SECRET;
  if (!secret) {
    // Dev mode — accept everything but log loudly.
    if (process.env.NODE_ENV !== "production") return true;
    return false;
  }
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expected, "hex")
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
