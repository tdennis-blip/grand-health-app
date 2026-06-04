// OAuth callback: exchange the code for tokens, persist the connection,
// kick off a 14-day backfill, and bounce back to the integrations page.
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getUser } from "@/lib/auth/server";
import { recordAudit } from "@/lib/audit";
import { getClient, isProviderEnabled } from "@/lib/wearables/registry";
import {
  daysAgo,
  syncConnectionRange,
  upsertConnection,
  ymd,
  type ConnectionRow,
} from "@/lib/wearables/sync";
import type { WearableProvider } from "@/lib/wearables/types";
import { serviceRoleSql } from "@/lib/db/connection";

const SUPPORTED: WearableProvider[] = ["oura", "whoop"];

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ provider: string }> }
) {
  const { provider } = await ctx.params;
  const providerKey = provider as WearableProvider;
  if (!SUPPORTED.includes(providerKey) || !isProviderEnabled(providerKey)) {
    return NextResponse.json({ error: "unsupported provider" }, { status: 400 });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");
  if (errorParam) {
    return redirectToIntegrations(req, { error: errorParam });
  }
  if (!code || !state) {
    return redirectToIntegrations(req, { error: "missing_code" });
  }

  const jar = await cookies();
  const expectedState = jar.get(`wearable_oauth_state_${provider}`)?.value;
  jar.set(`wearable_oauth_state_${provider}`, "", { maxAge: 0, path: "/" });
  if (!expectedState || expectedState !== state) {
    return redirectToIntegrations(req, { error: "state_mismatch" });
  }

  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  if (user.role !== "patient") return redirectToIntegrations(req, { error: "not_patient" });

  const redirectUri = buildRedirectUri(req, providerKey);
  const client = getClient(providerKey);

  try {
    const token = await client.exchangeCode(code, redirectUri);
    const connectionId = await upsertConnection({
      clinicId: user.clinicId,
      patientId: user.id,
      provider: providerKey,
      token,
    });

    await recordAudit({
      action: "create",
      entityType: "wearable_connection",
      entityId: connectionId,
      patientId: user.id,
      meta: { provider: providerKey },
    }).catch(() => undefined);

    // Fire-and-forget initial backfill (last 14 days). We wait so the user
    // sees data immediately when they land back on the integrations page,
    // but cap the wait with a short timeout — providers can be slow.
    await Promise.race([
      backfill(connectionId, providerKey),
      new Promise((r) => setTimeout(r, 10_000)),
    ]).catch(() => undefined);

    return redirectToIntegrations(req, { connected: providerKey });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "exchange_failed";
    return redirectToIntegrations(req, { error: msg.slice(0, 120) });
  }
}

async function backfill(connectionId: string, provider: WearableProvider) {
  const [conn] = await serviceRoleSql<ConnectionRow[]>`
    SELECT id, clinic_id, patient_id, provider, provider_user_id,
           access_token, refresh_token, token_expires_at, scope, status
    FROM wearable_connections
    WHERE id = ${connectionId}
    LIMIT 1
  `;
  if (!conn) return;
  await syncConnectionRange(conn, daysAgo(14), ymd(new Date())).catch(() => undefined);
  void provider;
}

function buildRedirectUri(req: NextRequest, provider: WearableProvider): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    new URL(req.url).origin;
  return `${base}/api/wearables/${provider}/callback`;
}

function redirectToIntegrations(req: NextRequest, params: Record<string, string>) {
  const u = new URL("/home/profile/integrations", req.url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return NextResponse.redirect(u);
}
