// Called by the login page after Amplify signs the user in client-side.
// Sets an httpOnly cookie with the ID token so the middleware can verify it
// on the server without exposing it to JS.
import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify, createRemoteJWKSet } from "jose";

const region = process.env.NEXT_PUBLIC_AWS_REGION ?? "us-east-1";
const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID!;
const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!;
const JWKS = createRemoteJWKSet(
  new URL(`https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`)
);

export async function POST(request: NextRequest) {
  const { idToken } = await request.json() as { idToken: string };

  if (!idToken) {
    return NextResponse.json({ error: "Missing idToken" }, { status: 400 });
  }

  // Verify the token before trusting it.
  try {
    await jwtVerify(idToken, JWKS, {
      issuer: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`,
      audience: clientId,
    });
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("gh_id_token", idToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    // Expire 1 hour from now (matches Cognito ID token validity).
    maxAge: 60 * 60,
  });
  return response;
}
