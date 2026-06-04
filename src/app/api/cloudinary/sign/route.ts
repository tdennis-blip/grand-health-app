// POST /api/cloudinary/sign
// Returns a signed upload signature so the browser can upload a video directly
// to Cloudinary without exposing the API secret.
//
// Browser then POSTs the file to:
//   https://api.cloudinary.com/v1_1/{cloudName}/video/upload
// along with the returned { signature, timestamp, apiKey, cloudName, folder }.

import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth/server";

export async function POST() {
  // Auth guard — clinicians only.
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (user.role !== "clinician") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey    = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return NextResponse.json({ error: "Cloudinary not configured" }, { status: 500 });
  }

  const timestamp = Math.round(Date.now() / 1000);
  const folder    = "grand-health/exercises";

  // Cloudinary signature = SHA-1( "folder=...&timestamp=..." + apiSecret )
  const paramsToSign = `folder=${folder}&timestamp=${timestamp}`;
  const signature = createHash("sha1")
    .update(paramsToSign + apiSecret)
    .digest("hex");

  return NextResponse.json({ signature, timestamp, apiKey, cloudName, folder });
}
