// OAuth start: build the authorize URL for the requested provider, drop a
// signed state cookie tying the flow to the current patient, and redirect.
//
// Called by a Link on the integrations page: <a href="/api/wearables/oura/start">
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getUser } from "@/lib/auth/server";
import { getClient, isProviderEnabled } from "@/lib/wearables/registry";
import type { WearableProvider } from "@/lib/wearables/types";

const SUPPORTED: WearableProvider[] = ["oura", "whoop"];

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ provider: string }> }
) {
  const { provider } = await ctx.params;
  if (!SUPPORTED.includes(provider as WearableProvider) || !isProviderEnabled(provider as WearableProvider)) {
    return NextResponse.json({ error: "unsupported provider" }, { status: 400 });
  }

  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  if (user.role !== "patient") {
    return NextResponse.json({ error: "only patients can connect wearables" }, { status: 403 });
  }

  const state = crypto.randomUUID();
  const redirectUri = buildRedirectUri(req, provider as WearableProvider);
  const client = getClient(provider as WearableProvider);
  const authorizeUrl = client.authorizeUrl(state, redirectUri);

  const jar = await cookies();
  jar.set(`wearable_oauth_state_${provider}`, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 10, // 10 min
    path: "/",
  });

  return NextResponse.redirect(authorizeUrl);
}

function buildRedirectUri(req: NextRequest, provider: WearableProvider): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    new URL(req.url).origin;
  return `${base}/api/wearables/${provider}/callback`;
}
