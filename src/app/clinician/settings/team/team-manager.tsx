"use client";

import { useState, useTransition } from "react";
import type { StaffMember } from "@/lib/care-team";
import { toggleAdmin, setStaffActive } from "./actions";

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
  const [hideDeactivated, setHideDeactivated] = useState(true);
  const [isPending, startTransition] = useTransition();

  const deactivatedCount = staff.filter((m) => !m.isActive).length;
  const visibleStaff = hideDeactivated ? staff.filter((m) => m.isActive) : staff;

  const onToggle = (member: StaffMember) => {
    setError(null);
    setPendingId(member.clinicianId);
    startTransition(async () => {
      const res = await toggleAdmin(member.clinicianId, !member.isAdmin);
      if (!res.ok) setError(res.error);
      setPendingId(null);
    });
  };

  const onSetActive = (member: StaffMember) => {
    const name =
      [member.firstName, member.lastName].filter(Boolean).join(" ") || member.email;
    if (
      member.isActive &&
      !window.confirm(
        `Deactivate ${name}? They'll lose all access and be hidden from the roster. You can reactivate them later.`
      )
    ) {
      return;
    }
    setError(null);
    setPendingId(member.clinicianId);
    startTransition(async () => {
      const res = await setStaffActive(member.clinicianId, !member.isActive);
      if (!res.ok) setError(res.error);
      setPendingId(null);
    });
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
      {error && (
        <div className="px-4 py-3 text-sm text-red-700 bg-red-50 rounded-t-xl">{error}</div>
      )}
      {deactivatedCount > 0 && (
        <div className="flex items-center justify-end px-4 py-2">
          <label className="flex items-center gap-2 text-sm text-slate-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hideDeactivated}
              onChange={(e) => setHideDeactivated(e.target.checked)}
              className="rounded border-slate-300"
            />
            Hide deactivated ({deactivatedCount})
          </label>
        </div>
      )}
      {visibleStaff.map((m) => {
        const name =
          [m.firstName, m.lastName].filter(Boolean).join(" ") || m.email;
        const busy = isPending && pendingId === m.clinicianId;
        return (
          <div
            key={m.clinicianId}
            className={`flex items-center justify-between gap-4 px-4 py-3 ${
              m.isActive ? "" : "bg-slate-50"
            }`}
          >
            <div className="min-w-0">
              <div className={`font-medium truncate ${m.isActive ? "text-slate-800" : "text-slate-400"}`}>
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
              {!m.isActive && (
                <span className="text-xs font-medium text-slate-500 bg-slate-200 rounded-full px-2.5 py-1">
                  Deactivated
                </span>
              )}
              {m.isActive && m.isAdmin && (
                <span className="text-xs font-medium text-teal-700 bg-teal-50 rounded-full px-2.5 py-1">
                  Admin
                </span>
              )}
              {iAmAdmin && m.isActive && (
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
              {iAmAdmin && m.clinicianId !== myId && (
                <button
                  onClick={() => onSetActive(m)}
                  disabled={busy}
                  className={`text-sm rounded-lg border px-3 py-1.5 font-medium disabled:opacity-40 disabled:cursor-not-allowed ${
                    m.isActive
                      ? "border-red-200 text-red-700 hover:bg-red-50"
                      : "border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {busy ? "Saving…" : m.isActive ? "Deactivate" : "Reactivate"}
                </button>
              )}
            </div>
          </div>
        );
      })}
      {visibleStaff.length === 0 && (
        <div className="px-4 py-6 text-sm text-slate-500">
          {staff.length === 0 ? "No staff accounts yet." : "No active staff to show."}
        </div>
      )}
    </div>
  );
}
