// Server-Sent Events endpoint for realtime chat updates.
// Replaces Supabase Realtime. Polls the messages table every 3s and pushes
// any new rows to the connected client.
//
// Usage: EventSource("/api/messages/stream?patientId=<uuid>&after=<iso>")
// Events: { type: "message", data: Message } | { type: "update", data: Message }
//
// Access control (two layers):
//   1. App check: patients may only stream their own thread; clinicians must
//      be an admin or on the patient's care team (canAccessPatient).
//   2. DB check: every poll runs through withAuth so the RLS session vars are
//      set and the care-team restrictive policies apply. Even if the app
//      check regressed, RLS returns zero rows for an unauthorized user.

import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { canAccessPatient } from "@/lib/care-team";
import type { Message } from "@/lib/messages-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mapRow(r: Record<string, unknown>): Message {
  return {
    id: r.id as string,
    clinicId: r.clinic_id as string,
    patientId: r.patient_id as string,
    senderId: r.sender_id as string,
    senderRole: r.sender_role as "clinician" | "patient",
    recipientId: r.recipient_id as string,
    body: r.body as string,
    recipientReadAt: r.recipient_read_at as string | null,
    createdAt: r.created_at as string,
  };
}

export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(request.url);
  const patientId = searchParams.get("patientId");
  let after = searchParams.get("after") ?? new Date().toISOString();

  if (!patientId) return new Response("Missing patientId", { status: 400 });

  // Verify the requesting user is allowed to see this thread.
  // Patients: own thread only. Clinicians: admin or care-team member.
  const allowed =
    (user.role === "patient" && user.id === patientId) ||
    (user.role === "clinician" && (await canAccessPatient(user, patientId)));

  if (!allowed) return new Response("Forbidden", { status: 403 });

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      // Send a comment heartbeat immediately so the browser knows the
      // connection is alive.
      controller.enqueue(encoder.encode(": heartbeat\n\n"));

      const poll = async () => {
        if (closed) return;
        try {
          // withAuth sets the RLS session variables inside a transaction, so
          // the messages policies (patient self / care-team clinician) apply.
          const rows = await withAuth(user, (sql) =>
            sql<Record<string, unknown>[]>`
              SELECT * FROM messages
              WHERE patient_id = ${patientId}
                AND (
                  created_at > ${after}::timestamptz
                  OR (recipient_read_at IS NOT NULL AND created_at >= ${after}::timestamptz)
                )
              ORDER BY created_at ASC
              LIMIT 50
            `
          );

          for (const row of rows) {
            const msg = mapRow(row);
            // Update the watermark so we don't re-send old rows
            if (msg.createdAt > after) after = msg.createdAt;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "message", data: msg })}\n\n`)
            );
          }
        } catch {
          // DB error — keep polling, don't crash the stream
        }

        if (!closed) {
          setTimeout(poll, 3000);
        }
      };

      setTimeout(poll, 3000);
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
