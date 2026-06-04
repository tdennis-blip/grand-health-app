// Cognito OAuth callback. Exchanges the code for tokens, sets the id-token
// cookie, and routes the user to their role-appropriate landing page.
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { cognitoConfig } from "@/lib/auth/config";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL ?? origin}/auth/callback`;
  const tokenEndpoint = `https://cognito-idp.${cognitoConfig.region}.amazonaws.com/${cognitoConfig.userPoolId}/oauth2/token`;

  try {
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: cognitoConfig.clientId,
      code,
      redirect_uri: redirectUri,
    });
    const res = await fetch(tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(err.slice(0, 120))}`);
    }

    const { id_token, access_token } = await res.json();
    if (!id_token) {
      return NextResponse.redirect(`${origin}/login?error=no_id_token`);
    }

    // Decode role from the JWT claims (no verify needed here — we trust Cognito's HTTPS).
    const payload = JSON.parse(Buffer.from(id_token.split(".")[1], "base64url").toString());
    const role = payload["custom:role"];
    const target = role === "clinician" ? "/clinician/dashboard" : "/home";

    const jar = await cookies();
    jar.set("gh_id_token", id_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24, // 24h — Cognito ID tokens are valid 1h; middleware will redirect on expiry
      path: "/",
    });

    return NextResponse.redirect(`${origin}${target}`);
  } catch (e: any) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(e?.message ?? "callback_failed")}`);
  }
}
