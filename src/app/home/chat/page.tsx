import { MessageSquare } from "lucide-react";
import { requirePatient } from "@/lib/auth/server";
import {
  getThread,
  getThreadParticipants,
  getMessagableClinicians,
} from "@/lib/messages";
import { PatientChatClient } from "./chat-client";

export default async function PatientChat() {
  const user = await requirePatient();

  const [messages, participants, clinicians] = await Promise.all([
    getThread(user.id),
    getThreadParticipants(user.id),
    getMessagableClinicians(),
  ]);

  return (
    <div className="p-5 space-y-4">
      <div>
        <div className="text-xs uppercase tracking-wide text-slate-500">Care team</div>
        <div className="text-xl font-semibold text-slate-900 flex items-center gap-1.5">
          <MessageSquare size={18} className="text-slate-600" /> Chat
        </div>
        <div className="text-[11px] text-slate-500 mt-1 leading-snug">
          Messages go to a specific clinician, but everyone on your care team can see the thread so they can step in for each other.
        </div>
      </div>

      <PatientChatClient
        meId={user.id}
        initialMessages={messages}
        initialParticipants={participants}
        clinicians={clinicians}
      />
    </div>
  );
}
