import Link from "next/link";
import { MessageSquare, ChevronRight } from "lucide-react";
import { requireClinician } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { getClinicianInbox } from "@/lib/messages";

export default async function ClinicianMessagesInbox() {
  await requireClinician();

  const inbox = await getClinicianInbox();

  return (
    <main className="max-w-5xl mx-auto px-6 py-6 space-y-6">
      <header>
        <div className="text-xs uppercase tracking-wide text-slate-500">Inbox</div>
        <div className="text-xl font-semibold text-slate-900 flex items-center gap-1.5">
          <MessageSquare size={18} className="text-slate-600" /> Messages
        </div>
        <div className="text-xs text-slate-500 mt-1">
          Every patient&apos;s thread. Patient messages are addressed to a specific clinician — unread badges show only your direct messages.
        </div>
      </header>

      <section className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
        {inbox.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500 italic">
            No patients yet.
          </div>
        ) : (
          inbox.map((entry) => {
            const name = `${entry.patientFirstName ?? ""} ${entry.patientLastName ?? ""}`.trim() || "Patient";
            const initials = [(entry.patientFirstName || "?")[0], entry.patientLastName?.[0]]
              .filter(Boolean)
              .join("")
              .toUpperCase();
            const last = entry.lastMessage;
            return (
              <Link
                key={entry.patientId}
                href={`/clinician/messages/${entry.patientId}`}
                className="flex items-start gap-3 p-4 hover:bg-slate-50 transition"
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-600 to-emerald-500 text-white font-semibold flex items-center justify-center text-sm flex-shrink-0">
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-slate-900 truncate">{name}</div>
                    {last && (
                      <div className="text-[11px] text-slate-400 flex-shrink-0">
                        {timeAgo(last.createdAt)}
                      </div>
                    )}
                  </div>
                  <div className="text-[12px] text-slate-500 truncate mt-0.5">
                    {last
                      ? <>{last.senderRole === "clinician" ? "You / team: " : ""}{last.body}</>
                      : <span className="italic text-slate-400">No messages yet</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 mt-1">
                  {entry.unreadForMe > 0 && (
                    <span className="text-[10px] font-semibold text-white bg-rose-600 px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                      {entry.unreadForMe}
                    </span>
                  )}
                  <ChevronRight size={16} className="text-slate-300" />
                </div>
              </Link>
            );
          })
        )}
      </section>
    </main>
  );
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const diffSec = Math.round((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
  const diffDay = Math.floor(diffSec / 86400);
  if (diffDay < 7) return `${diffDay}d`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
