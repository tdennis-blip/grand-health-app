// Middleware auth helper: verify session from cookie, handle redirects.
// Mirrors the old supabase/middleware.ts but reads Cognito JWT instead.
import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify, createRemoteJWKSet } from "jose";
import { cognitoConfig } from "./config";

const JWKS_URL = `https://cognito-idp.${cognitoConfig.region}.amazonaws.com/${cognitoConfig.userPoolId}/.well-known/jwks.json`;
const ISSUER = `https://cognito-idp.${cognitoConfig.region}.amazonaws.com/${cognitoConfig.userPoolId}`;

// Module-level singleton — shared across middleware invocations in the same
// worker process. JWKS keys are cached automatically by jose.
const JWKS = createRemoteJWKSet(new URL(JWKS_URL));

type TokenPayload = {
  sub: string;
  email: string;
  "custom:role"?: string;
  "custom:clinic_id"?: string;
};

async function verifyIdToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: ISSUER,
      audience: cognitoConfig.clientId,
    });
    return payload as unknown as TokenPayload;
  } catch {
    return null;
  }
}

function getIdTokenCandidates(request: NextRequest): string[] {
  // All candidate tokens, in preference order. The caller verifies each and
  // uses the first VALID one — important because our gh_id_token cookie can
  // hold an expired token while Amplify's client-side cookie has a freshly
  // refreshed one. Previously we returned only the first cookie found, so an
  // expired gh_id_token bounced users to /login every hour even though a
  // valid refreshed token was sitting right there.
  const candidates: string[] = [];

  // Primary: our own httpOnly cookie set in /auth/callback
  const direct = request.cookies.get("gh_id_token")?.value;
  if (direct) candidates.push(direct);

  // Fallback: Amplify's client-side cookie (set when using ssr:true)
  const lastUser = request.cookies.get(
    `CognitoIdentityServiceProvider.${cognitoConfig.clientId}.LastAuthUser`
  )?.value;
  if (lastUser) {
    const amplifyToken = request.cookies.get(
      `CognitoIdentityServiceProvider.${cognitoConfig.clientId}.${lastUser}.idToken`
    )?.value;
    if (amplifyToken && amplifyToken !== direct) candidates.push(amplifyToken);
  }

  return candidates;
}

export async function updateSession(request: NextRequest) {
  const response = NextResponse.next({ request: { headers: request.headers } });
  const { pathname } = request.nextUrl;

  const isAuthPage = pathname.startsWith("/login") || pathname.startsWith("/auth/");
  // Public legal pages — must be viewable without login (e.g. for Oura/Whoop
  // app review and the OAuth consent footer links).
  const isLegalPage = pathname === "/privacy" || pathname === "/terms";
  const isPublic = pathname === "/" || isAuthPage || isLegalPage;

  const candidates = getIdTokenCandidates(request);

  if (candidates.length === 0) {
    if (!isPublic) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    return response;
  }

  // Use the first candidate that verifies (see getIdTokenCandidates).
  let payload: TokenPayload | null = null;
  for (const token of candidates) {
    payload = await verifyIdToken(token);
    if (payload) break;
  }

  if (!payload) {
    // All tokens invalid/expired — clear cookie and redirect to login
    if (!isPublic) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      const res = NextResponse.redirect(url);
      res.cookies.delete("gh_id_token");
      return res;
    }
    return response;
  }

  // Logged in + on login/root → send to role-appropriate home
  if (pathname === "/" || pathname === "/login") {
    const role = payload["custom:role"];
    const url = request.nextUrl.clone();
    url.pathname = role === "clinician" ? "/clinician/dashboard" : "/home";
    url.searchParams.delete("next");
    return NextResponse.redirect(url);
  }

  return response;
}
