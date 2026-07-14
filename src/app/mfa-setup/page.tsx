import { redirect } from "next/navigation";
import { requireClinicianAllowUnenrolled } from "@/lib/auth/server";
import { userHasTotpMfa } from "@/lib/cognito-admin";
import { MfaSetupClient } from "./mfa-setup-client";

// Clinician MFA enrollment. Lives OUTSIDE /clinician/* and uses the
// AllowUnenrolled gate — requireClinician() itself now enforces MFA and would
// redirect right back here (loop).
export default async function MfaSetupPage() {
  const user = await requireClinicianAllowUnenrolled();

  // Already enrolled? Nothing to do here — send them to work.
  if (await userHasTotpMfa(user.email)) {
    redirect("/clinician/dashboard");
  }

  return <MfaSetupClient accountName={user.email} />;
}
