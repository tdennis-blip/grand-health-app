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

function getIdTokenFromRequest(request: NextRequest): string | null {
  // Primary: our own httpOnly cookie set in /auth/callback
  const direct = request.cookies.get("gh_id_token")?.value;
  if (direct) return direct;

  // Fallback: Amplify's client-side cookie (set when using ssr:true)
  const lastUser = request.cookies.get(
    `CognitoIdentityServiceProvider.${cognitoConfig.clientId}.LastAuthUser`
  )?.value;
  if (!lastUser) return null;
  return (
    request.cookies.get(
      `CognitoIdentityServiceProvider.${cognitoConfig.clientId}.${lastUser}.idToken`
    )?.value ?? null
  );
}

export async function updateSession(request: NextRequest) {
  const response = NextResponse.next({ request: { headers: request.headers } });
  const { pathname } = request.nextUrl;

  const isAuthPage = pathname.startsWith("/login") || pathname.startsWith("/auth/");
  const isPublic = pathname === "/" || isAuthPage;

  const idToken = getIdTokenFromRequest(request);

  if (!idToken) {
    if (!isPublic) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    return response;
  }

  const payload = await verifyIdToken(idToken);

  if (!payload) {
    // Token invalid/expired — clear cookie and redirect to login
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
