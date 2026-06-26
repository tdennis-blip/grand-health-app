// Clears the server session cookie. Called by the client SignOutButton after
// it clears the Amplify session, so a full sign-out happens (cookie + Amplify).
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST() {
  const store = await cookies();
  store.delete("gh_id_token");
  return NextResponse.json({ ok: true });
}
