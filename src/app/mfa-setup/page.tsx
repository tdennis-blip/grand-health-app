import { redirect } from "next/navigation";
import { requireClinician } from "@/lib/auth/server";
import { userHasTotpMfa } from "@/lib/cognito-admin";
import { MfaSetupClient } from "./mfa-setup-client";

// Clinician MFA enrollment. Lives OUTSIDE /clinician/* so the clinician
// layout's MFA gate can redirect here without creating a redirect loop.
export default async function MfaSetupPage() {
  const user = await requireClinician();

  // Already enrolled? Nothing to do here — send them to work.
  if (await userHasTotpMfa(user.email)) {
    redirect("/clinician/dashboard");
  }

  return <MfaSetupClient accountName={user.email} />;
}
