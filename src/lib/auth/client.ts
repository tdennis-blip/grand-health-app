// Browser-side auth helpers. Use in Client Components only.
// Wraps the aws-amplify/auth package with typed helpers.
import {
  signIn as amplifySignIn,
  signOut as amplifySignOut,
  confirmSignIn as amplifyConfirmSignIn,
  resetPassword as amplifyResetPassword,
  confirmResetPassword as amplifyConfirmResetPassword,
  updatePassword as amplifyUpdatePassword,
  updateUserAttributes as amplifyUpdateUserAttributes,
  confirmUserAttribute as amplifyConfirmUserAttribute,
  setUpTOTP as amplifySetUpTOTP,
  verifyTOTPSetup as amplifyVerifyTOTPSetup,
  updateMFAPreference as amplifyUpdateMFAPreference,
  fetchAuthSession,
  type SignInInput,
} from "aws-amplify/auth";
import { Amplify } from "aws-amplify";
import { cognitoConfig } from "./config";

// Configure Amplify once. Safe to call multiple times (idempotent).
export function configureAmplify() {
  Amplify.configure(
    {
      Auth: {
        Cognito: {
          userPoolId: cognitoConfig.userPoolId,
          userPoolClientId: cognitoConfig.clientId,
          loginWith: {
            email: true,
          },
        },
      },
    },
    { ssr: true }
  );
}

export async function signInWithPassword(email: string, password: string) {
  try {
    const result = await amplifySignIn({ username: email, password });
    return result;
  } catch (err: unknown) {
    // Amplify throws when a session already exists. That's effectively "signed
    // in" — surface it as success so the caller can grab the token + redirect
    // instead of showing a confusing error.
    if (err instanceof Error && err.name === "UserAlreadyAuthenticatedException") {
      return { isSignedIn: true, nextStep: { signInStep: "DONE" as const } };
    }
    throw err;
  }
}

// Returns the current ID token string, or null if not signed in.
export async function getIdToken(): Promise<string | null> {
  try {
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() ?? null;
  } catch {
    return null;
  }
}

// Completes the first-login "new password required" challenge.
export async function confirmNewPassword(newPassword: string) {
  return amplifyConfirmSignIn({ challengeResponse: newPassword });
}

// Completes a TOTP MFA challenge at sign-in (returning clinician who already
// enrolled). Submits the 6-digit code from their authenticator app.
export async function confirmTotpCode(code: string) {
  return amplifyConfirmSignIn({ challengeResponse: code.trim() });
}

// --- In-app TOTP enrollment (clinician MFA setup) ---------------------------

// Begins enrollment: returns the otpauth:// URI (for a QR code) plus the raw
// shared secret (for manual entry) so the setup screen can show both.
export async function startTotpEnrollment(accountName: string) {
  const out = await amplifySetUpTOTP();
  const uri = out.getSetupUri("Grand Health", accountName).toString();
  return { uri, secret: out.sharedSecret };
}

// Finishes enrollment: verifies the first code from the authenticator, then
// makes TOTP this user's preferred (required) second factor so Cognito will
// challenge them for it on every future sign-in.
export async function confirmTotpEnrollment(code: string) {
  await amplifyVerifyTOTPSetup({ code: code.trim() });
  await amplifyUpdateMFAPreference({ totp: "PREFERRED" });
}

export async function signOut() {
  // global: true revokes the refresh token and invalidates tokens on ALL
  // devices via Cognito GlobalSignOut — without it, a stolen token stays
  // usable until natural expiry even after the user "signs out".
  try {
    await amplifySignOut({ global: true });
  } catch {
    // GlobalSignOut needs a valid access token; if it's already expired,
    // fall back to local sign-out so the user isn't stuck.
    await amplifySignOut();
  }
}

// Step 1 of password recovery: Cognito emails a verification code to the
// account's verified email. Throws on unknown user / unverified email.
export async function requestPasswordReset(email: string) {
  return amplifyResetPassword({ username: email });
}

// Step 2: submit the emailed code + the new password.
export async function confirmPasswordReset(
  email: string,
  confirmationCode: string,
  newPassword: string
) {
  return amplifyConfirmResetPassword({
    username: email,
    confirmationCode,
    newPassword,
  });
}

// Change password while signed in (requires the current password).
export async function changePassword(oldPassword: string, newPassword: string) {
  return amplifyUpdatePassword({ oldPassword, newPassword });
}

// Step 1 of an email change: Cognito sends a verification code to the NEW
// address. Returns the per-attribute next step so the caller knows whether a
// code is required.
export async function requestEmailChange(newEmail: string) {
  const res = await amplifyUpdateUserAttributes({
    userAttributes: { email: newEmail },
  });
  return res.email?.nextStep?.updateAttributeStep ?? "DONE";
}

// Step 2: confirm the email change with the code sent to the new address.
export async function confirmEmailChange(confirmationCode: string) {
  return amplifyConfirmUserAttribute({ userAttributeKey: "email", confirmationCode });
}
