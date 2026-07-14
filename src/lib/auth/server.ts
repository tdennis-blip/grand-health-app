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

    // Collect every candidate token and use the first that VERIFIES. One
    // cookie can hold an expired token while the other was just refreshed —
    // picking a single cookie blindly logs users out for no reason.
    const candidates: string[] = [];

    // Cognito Amplify v6 stores the ID token under this key pattern.
    const lastUser = store.get(
      `CognitoIdentityServiceProvider.${cognitoConfig.clientId}.LastAuthUser`
    )?.value;
    if (lastUser) {
      const amplifyToken = store.get(
        `CognitoIdentityServiceProvider.${cognitoConfig.clientId}.${lastUser}.idToken`
      )?.value;
      if (amplifyToken) candidates.push(amplifyToken);
    }
    // Our own httpOnly cookie set in /auth/callback and /auth/set-cookie.
    const direct = store.get("gh_id_token")?.value;
    if (direct && !candidates.includes(direct)) candidates.push(direct);

    for (const idToken of candidates) {
      let payload;
      try {
        ({ payload } = await jwtVerify(idToken, getJWKS(), {
          issuer: ISSUER,
          audience: cognitoConfig.clientId,
        }));
      } catch {
        continue; // expired/invalid — try the next candidate
      }

      const role = payload["custom:role"] as string | undefined;
      const clinicId = payload["custom:clinic_id"] as string | undefined;

      if (!role || !clinicId || (role !== "clinician" && role !== "patient")) {
        continue;
      }

      return {
        id: payload.sub!,
        email: (payload.email as string) ?? "",
        role: role as "clinician" | "patient",
        clinicId,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// Is this a usable account? A valid token whose `sub` has no profile is an
// orphaned session (e.g. the account was deleted); a deactivated patient
// keeps their Cognito login but must be treated as signed-out (soft-delete,
// migration 0036 — mirrors clinician deactivation from 0035). Cached per
// request. On any DB error we return "ok" so a transient outage never locks
// users out (deactivated users are also fenced at the DB layer by RLS).
const accountUsable = cache(async (id: string): Promise<boolean> => {
  try {
    const rows = await serviceRoleSql<{ patient_deactivated: boolean | null }[]>`
      SELECT pp.deactivated_at IS NOT NULL AS patient_deactivated
      FROM public.profiles p
      LEFT JOIN public.patient_profiles pp ON pp.profile_id = p.id
      WHERE p.id = ${id} LIMIT 1
    `;
    if (rows.length === 0) return false;       // orphaned session
    return rows[0].patient_deactivated !== true; // deactivated patient → out
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
  // Orphaned session (profile gone) or deactivated patient → full sign-out.
  if (!(await accountUsable(user!.id))) {
    const { redirect } = await import("next/navigation");
    redirect("/auth/force-signout");
  }
  return user as AuthUser;
}

// MFA enrollment check, cached per request so a page that calls
// requireClinician() in the layout AND in several server actions only hits
// Cognito AdminGetUser once per render. userHasTotpMfa fails CLOSED.
const clinicianHasMfa = cache(async (email: string): Promise<boolean> => {
  const { userHasTotpMfa } = await import("@/lib/cognito-admin");
  return userHasTotpMfa(email);
});

// Clinician gate INCLUDING the MFA gate. Every clinician-facing page, server
// action, and route handler goes through here, so MFA can't be bypassed by
// invoking an action or API route directly (the old layout-only gate could).
export async function requireClinician(): Promise<AuthUser> {
  const user = await requireClinicianAllowUnenrolled();
  if (!(await clinicianHasMfa(user.email))) {
    const { redirect } = await import("next/navigation");
    redirect("/mfa-setup");
  }
  return user;
}

// Clinician gate WITHOUT the MFA check. Only for /mfa-setup itself (which
// must be reachable by un-enrolled clinicians — anything else would loop).
export async function requireClinicianAllowUnenrolled(): Promise<AuthUser> {
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
