"use client";

import { useState, useTransition } from "react";
import type { StaffMember } from "@/lib/care-team";
import { toggleAdmin } from "./actions";

// careTeamRole lives in care-team.ts (server-only import chain), so inline a
// tiny display helper here instead of importing it.
function roleLabel(m: StaffMember): string | null {
  return m.professionalRole || m.roleLabel || m.title || null;
}

export function TeamManager({
  staff,
  myId,
  iAmAdmin,
}: {
  staff: StaffMember[];
  myId: string;
  iAmAdmin: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onToggle = (member: StaffMember) => {
    setError(null);
    setPendingId(member.clinicianId);
    startTransition(async () => {
      const res = await toggleAdmin(member.clinicianId, !member.isAdmin);
      if (!res.ok) setError(res.error);
      setPendingId(null);
    });
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
      {error && (
        <div className="px-4 py-3 text-sm text-red-700 bg-red-50 rounded-t-xl">{error}</div>
      )}
      {staff.map((m) => {
        const name =
          [m.firstName, m.lastName].filter(Boolean).join(" ") || m.email;
        const busy = isPending && pendingId === m.clinicianId;
        return (
          <div key={m.clinicianId} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <div className="font-medium text-slate-800 truncate">
                {name}
                {m.clinicianId === myId && (
                  <span className="ml-2 text-xs text-slate-400">(you)</span>
                )}
              </div>
              <div className="text-sm text-slate-500 truncate">
                {m.email}
                {roleLabel(m) ? ` · ${roleLabel(m)}` : ""}
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              {m.isAdmin && (
                <span className="text-xs font-medium text-teal-700 bg-teal-50 rounded-full px-2.5 py-1">
                  Admin
                </span>
              )}
              {iAmAdmin && (
                <button
                  onClick={() => onToggle(m)}
                  disabled={busy || (m.isAdmin && m.clinicianId === myId)}
                  title={
                    m.isAdmin && m.clinicianId === myId
                      ? "Another administrator must remove your admin access"
                      : undefined
                  }
                  className="text-sm rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {busy ? "Saving…" : m.isAdmin ? "Remove admin" : "Make admin"}
                </button>
              )}
            </div>
          </div>
        );
      })}
      {staff.length === 0 && (
        <div className="px-4 py-6 text-sm text-slate-500">No staff accounts yet.</div>
      )}
    </div>
  );
}
