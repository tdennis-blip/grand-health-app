// Server-side auth helpers: verify Cognito JWT from cookie, return typed user.
// Used by Server Components, Route Handlers, and Server Actions.
// Never imported into client components.
import { cookies } from "next/headers";
import { jwtVerify, createRemoteJWKSet } from "jose";
import { cognitoConfig } from "./config";
import { cache } from "react";
import { serviceRoleSql } from "@/lib/db/connection";

export type AuthUser = {
  id: string;           // Cognito sub (UUID) — maps to profiles.id
  email: string;
  role: "clinician" | "patient";
  clinicId: string;
};

const JWKS_URL = `https://cognito-idp.${cognitoConfig.region}.amazonaws.com/${cognitoConfig.userPoolId}/.well-known/jwks.json`;
const ISSUER = `https://cognito-idp.${cognitoConfig.region}.amazonaws.com/${cognitoConfig.userPoolId}`;

// Cache JWKS fetch per request (React cache deduplicates within one RSC render).
const getJWKS = cache(() => createRemoteJWKSet(new URL(JWKS_URL)));

// Returns null instead of throwing so callers can redirect cleanly.
export async function getUser(): Promise<AuthUser | null> {
  try {
    const store = await cookies();
    // Cognito Amplify v6 stores the ID token under this key pattern.
    const idToken = store.get(
      `CognitoIdentityServiceProvider.${cognitoConfig.clientId}.LastAuthUser`
    )?.value
      ? store.get(
          `CognitoIdentityServiceProvider.${cognitoConfig.clientId}.${
            store.get(`CognitoIdentityServiceProvider.${cognitoConfig.clientId}.LastAuthUser`)!.value
          }.idToken`
        )?.value
      : store.get("gh_id_token")?.value; // fallback: our own cookie set in /auth/callback

    if (!idToken) return null;

    const { payload } = await jwtVerify(idToken, getJWKS(), {
      issuer: ISSUER,
      audience: cognitoConfig.clientId,
    });

    const role = payload["custom:role"] as string | undefined;
    const clinicId = payload["custom:clinic_id"] as string | undefined;

    if (!role || !clinicId || (role !== "clinician" && role !== "patient")) {
      return null;
    }

    return {
      id: payload.sub!,
      email: (payload.email as string) ?? "",
      role: role as "clinician" | "patient",
      clinicId,
    };
  } catch {
    return null;
  }
}

// Does a profile row exist for this id? A valid token whose `sub` has no
// profile is an orphaned session (e.g. the account was deleted) — we treat it
// as signed-out rather than rendering an empty shell. Cached per request.
// On any DB error we return true so a transient outage never locks users out.
const profileExists = cache(async (id: string): Promise<boolean> => {
  try {
    const rows = await serviceRoleSql<{ one: number }[]>`
      SELECT 1 AS one FROM public.profiles WHERE id = ${id} LIMIT 1
    `;
    return rows.length > 0;
  } catch {
    return true;
  }
});

// Convenience: throws a redirect if not authenticated.
// Use in Server Components/Actions that require auth.
export async function requireUser(): Promise<AuthUser> {
  const user = await getUser();
  if (!user) {
    const { redirect } = await import("next/navigation");
    redirect("/login");
  }
  // Orphaned session: token is valid but the profile is gone → full sign-out.
  if (!(await profileExists(user!.id))) {
    const { redirect } = await import("next/navigation");
    redirect("/auth/force-signout");
  }
  return user as AuthUser;
}

export async function requireClinician(): Promise<AuthUser> {
  const user = await requireUser();
  if (user.role !== "clinician") {
    const { redirect } = await import("next/navigation");
    redirect("/home");
  }
  return user;
}

export async function requirePatient(): Promise<AuthUser> {
  const user = await requireUser();
  if (user.role !== "patient") {
    const { redirect } = await import("next/navigation");
    redirect("/clinician/dashboard");
  }
  return user;
}
