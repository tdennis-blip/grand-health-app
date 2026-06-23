// Browser-side auth helpers. Use in Client Components only.
// Wraps the aws-amplify/auth package with typed helpers.
import {
  signIn as amplifySignIn,
  signOut as amplifySignOut,
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

export async function signOut() {
  await amplifySignOut();
}
