// Server-only helper for provisioning Cognito users (clinician "Add patient /
// staff" flow). Uses the Fargate task role's IAM permissions — never expose
// these calls to the client.
import "server-only";
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  UsernameExistsException,
  UserNotFoundException,
} from "@aws-sdk/client-cognito-identity-provider";

const REGION = process.env.NEXT_PUBLIC_AWS_REGION || "us-east-1";
const USER_POOL_ID = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || "us-east-1_Yk5gVyw4D";

let client: CognitoIdentityProviderClient | null = null;
function getClient() {
  if (!client) client = new CognitoIdentityProviderClient({ region: REGION });
  return client;
}

export class EmailInUseError extends Error {
  constructor() {
    super("An account with that email already exists.");
    this.name = "EmailInUseError";
  }
}

// Creates a Cognito user with the given role/clinic. Cognito emails them a
// temporary password; they set a permanent one on first sign-in. Returns the
// new user's `sub` (UUID), which must become profiles.id.
export async function createCognitoUser(opts: {
  email: string;
  role: "patient" | "clinician";
  clinicId: string;
}): Promise<string> {
  try {
    const res = await getClient().send(
      new AdminCreateUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: opts.email,
        DesiredDeliveryMediums: ["EMAIL"],
        UserAttributes: [
          { Name: "email", Value: opts.email },
          { Name: "email_verified", Value: "true" },
          { Name: "custom:role", Value: opts.role },
          { Name: "custom:clinic_id", Value: opts.clinicId },
        ],
      })
    );
    const sub = res.User?.Attributes?.find(
      (a: { Name?: string; Value?: string }) => a.Name === "sub"
    )?.Value;
    if (!sub) throw new Error("Cognito did not return a user id");
    return sub;
  } catch (err) {
    if (err instanceof UsernameExistsException) throw new EmailInUseError();
    throw err;
  }
}

// Deletes a Cognito user. No-op if they don't exist. Used on create rollback
// and when removing a patient.
export async function deleteCognitoUser(email: string): Promise<void> {
  try {
    await getClient().send(
      new AdminDeleteUserCommand({ UserPoolId: USER_POOL_ID, Username: email })
    );
  } catch (err) {
    if (err instanceof UserNotFoundException) return;
    throw err;
  }
}
