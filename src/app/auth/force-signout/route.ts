// Full server-side sign-out used when a session is orphaned (valid token but
// no profile, e.g. the account was deleted). Clears our cookie AND the Amplify
// client cookies so the stale token can't keep "logging in", then redirects to
// /login. Reachable directly; safe to hit anytime.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { cognitoConfig } from "@/lib/auth/config";

export async function GET(request: Request) {
  const store = await cookies();
  const prefix = `CognitoIdentityServiceProvider.${cognitoConfig.clientId}`;
  const last = store.get(`${prefix}.LastAuthUser`)?.value;

  const names = ["gh_id_token", `${prefix}.LastAuthUser`];
  if (last) {
    for (const suffix of ["idToken", "accessToken", "refreshToken", "clockDrift", "userData", "signInDetails", "deviceKey"]) {
      names.push(`${prefix}.${last}.${suffix}`);
    }
  }

  const url = new URL("/login", request.url);
  url.searchParams.set("reason", "session-ended");
  const res = NextResponse.redirect(url);
  for (const name of names) res.cookies.delete(name);
  return res;
}
