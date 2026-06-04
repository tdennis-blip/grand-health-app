"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Plus, Calendar } from "lucide-react";
import { assignProgramToPatient, endProgramAssignment } from "@/app/clinician/library/training/programs/actions";

type Assignment = {
  id: string;
  assignedAt: string;
  endedAt: string | null;
  program: { id: string; name: string; description: string | null } | null;
};

export function ProgramAssignments({
  patientId,
  assignments,
  programs,
}: {
  patientId: string;
  assignments: Assignment[];
  programs: { id: string; name: string }[];
}) {
  const [selected, setSelected] = useState<string>("");
  const [pending, startTransition] = useTransition();

  const active = assignments.filter((a) => !a.endedAt);
  const past = assignments.filter((a) => a.endedAt);
  // Don't offer programs that are already actively assigned.
  const activeIds = new Set(active.map((a) => a.program?.id).filter(Boolean));
  const assignable = programs.filter((p) => !activeIds.has(p.id));

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">Training programs</div>
          <div className="text-[11px] text-slate-500">Assign a program to give this patient a weekly schedule.</div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-teal-500"
            disabled={pending || assignable.length === 0}
          >
            <option value="">{assignable.length === 0 ? "No programs to assign" : "Pick a program…"}</option>
            {assignable.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            onClick={() => {
              if (!selected) return;
              startTransition(async () => {
                await assignProgramToPatient({ programId: selected, patientId });
                setSelected("");
              });
            }}
            disabled={!selected || pending}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1 ${
              selected && !pending ? "bg-teal-700 text-white hover:bg-teal-800" : "bg-slate-200 text-slate-400 cursor-not-allowed"
            }`}
          >
            <Plus size={12} /> Assign
          </button>
        </div>
      </div>

      {active.length === 0 && past.length === 0 ? (
        <div className="text-sm text-slate-500 italic py-6 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
          No program assigned yet. Pick one from the dropdown above to assign.
        </div>
      ) : (
        <div className="space-y-2">
          {active.length > 0 && (
            <>
              <div className="text-[10px] uppercase tracking-wide text-emerald-700 font-semibold">Active</div>
              {active.map((a) => (
                <AssignmentRow key={a.id} assignment={a} patientId={patientId} pending={pending} startTransition={startTransition} />
              ))}
            </>
          )}
          {past.length > 0 && (
            <>
              <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mt-3">Past</div>
              {past.map((a) => (
                <AssignmentRow key={a.id} assignment={a} patientId={patientId} pending={pending} startTransition={startTransition} />
              ))}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function AssignmentRow({
  assignment,
  patientId,
  pending,
  startTransition,
}: {
  assignment: Assignment;
  patientId: string;
  pending: boolean;
  startTransition: React.TransitionStartFunction;
}) {
  const isActive = !assignment.endedAt;
  return (
    <div className={`rounded-xl border p-3 flex items-center gap-3 ${
      isActive ? "bg-emerald-50/40 border-emerald-200" : "bg-slate-50 border-slate-200 opacity-80"
    }`}>
      <div className="w-9 h-9 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center flex-shrink-0">
        <Calendar size={15} />
      </div>
      <div className="flex-1 min-w-0">
        {assignment.program ? (
          <Link
            href={`/clinician/library/training/programs/${assignment.program.id}`}
            className="text-sm font-semibold text-slate-900 truncate hover:text-teal-700"
          >
            {assignment.program.name}
          </Link>
        ) : (
          <div className="text-sm font-semibold text-slate-400 italic">(program deleted)</div>
        )}
        <div className="text-[11px] text-slate-500">
          Assigned {new Date(assignment.assignedAt).toLocaleDateString()}
          {assignment.endedAt && ` · ended ${new Date(assignment.endedAt).toLocaleDateString()}`}
        </div>
      </div>
      {isActive && (
        <button
          onClick={() => {
            if (!confirm("End this assignment?")) return;
            startTransition(() => endProgramAssignment({ id: assignment.id, patientId }));
          }}
          disabled={pending}
          className="text-[11px] font-semibold text-rose-600 bg-white border border-rose-200 px-2.5 py-1 rounded-lg"
        >
          End
        </button>
      )}
    </div>
  );
}
