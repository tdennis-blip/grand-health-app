"use client";

import { useState, useTransition } from "react";
import { UserPlus, X, Users } from "lucide-react";
import { addCareTeamMember, removeCareTeamMember } from "./actions";

type Member = { clinicianId: string; name: string; role: string | null; credentials: string | null };

export function CareTeamCard({
  patientId,
  currentUserId,
  isAdmin,
  members,
  clinicClinicians,
}: {
  patientId: string;
  currentUserId: string;
  isAdmin: boolean;
  members: Member[];
  clinicClinicians: Member[];
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const onTeam = new Set(members.map((m) => m.clinicianId));
  const selfOnTeam = onTeam.has(currentUserId);
  const addable = clinicClinicians.filter((c) => !onTeam.has(c.clinicianId));

  const run = (fn: () => Promise<void>) => {
    setErr(null);
    start(async () => {
      try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong."); }
    });
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
            <Users size={15} />
          </div>
          <div className="text-sm font-semibold text-slate-900">Care team</div>
        </div>
        {!selfOnTeam && (
          <button
            onClick={() => run(() => addCareTeamMember({ patientId, clinicianId: currentUserId }))}
            disabled={pending}
            className="text-xs font-semibold bg-teal-700 text-white px-3 py-1.5 rounded-lg hover:bg-teal-800 disabled:opacity-50 inline-flex items-center gap-1"
          >
            <UserPlus size={13} /> Assign me
          </button>
        )}
      </div>

      {members.length === 0 ? (
        <div className="text-[12px] text-slate-500 italic">No one assigned yet.</div>
      ) : (
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.clinicianId} className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-slate-200 text-slate-600 text-[11px] font-semibold flex items-center justify-center flex-shrink-0">
                {initials(m.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-900 truncate">
                  {m.name}{m.credentials && <span className="text-slate-400 font-normal">, {m.credentials}</span>}
                  {m.clinicianId === currentUserId && <span className="text-slate-400 font-normal"> (you)</span>}
                </div>
                {m.role && <div className="text-[11px] text-slate-500 truncate">{m.role}</div>}
              </div>
              {(isAdmin || m.clinicianId === currentUserId) && (
                <button
                  onClick={() => run(() => removeCareTeamMember({ patientId, clinicianId: m.clinicianId }))}
                  disabled={pending}
                  title="Remove from care team"
                  className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded p-1 disabled:opacity-50"
                >
                  <X size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {isAdmin && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          {!adding ? (
            <button onClick={() => setAdding(true)} className="text-[12px] text-teal-700 font-medium inline-flex items-center gap-1">
              <UserPlus size={13} /> Add a team member
            </button>
          ) : addable.length === 0 ? (
            <div className="text-[12px] text-slate-500">Everyone in the clinic is already on this team.</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {addable.map((c) => (
                <button
                  key={c.clinicianId}
                  onClick={() => run(() => addCareTeamMember({ patientId, clinicianId: c.clinicianId }))}
                  disabled={pending}
                  className="text-xs border border-slate-200 rounded-lg px-2.5 py-1 hover:border-teal-300 hover:bg-teal-50 disabled:opacity-50"
                >
                  + {c.name}{c.role ? ` · ${c.role}` : ""}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {err && <div className="mt-2 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2">{err}</div>}
    </section>
  );
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}
