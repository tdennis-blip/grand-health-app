// Central Cognito config consumed by both browser and server auth helpers.
// Values come from env vars set in .env.local (dev) and Amplify console (prod).
export const cognitoConfig = {
  region: process.env.NEXT_PUBLIC_AWS_REGION ?? "us-east-1",
  userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID!,
  clientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!,
  // Hosted-UI domain (used for OAuth redirect flows, not required for
  // password auth). Format: https://grand-health-staging.auth.us-east-1.amazoncognito.com
  domain: process.env.NEXT_PUBLIC_COGNITO_DOMAIN,
};
