"use client";

import { useState, useTransition } from "react";
import { Check, CalendarRange } from "lucide-react";
import { setPatientTargetAge } from "./target-actions";

export type TargetRow = {
  activityId: string;
  activityName: string;
  tier: "essential" | "important" | "stretch";
  targetAge: number;
  isExplicit: boolean; // true if the patient/clinician set this; false if showing the default 100
};

const TIER_CHIP: Record<TargetRow["tier"], string> = {
  essential: "bg-emerald-50 text-emerald-700 border-emerald-200",
  important: "bg-blue-50 text-blue-700 border-blue-200",
  stretch:   "bg-violet-50 text-violet-700 border-violet-200",
};

export function TargetAgesCard({
  patientId,
  initial,
}: {
  patientId: string;
  initial: TargetRow[];
}) {
  if (initial.length === 0) return null;

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
          <CalendarRange size={16} />
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-900">Grand 100 target ages</div>
          <div className="text-[11px] text-slate-500">The age the patient wants to still be doing each activity. Drives their back-cast math.</div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {initial.map((r) => (
          <Row key={r.activityId} patientId={patientId} row={r} />
        ))}
      </div>
    </section>
  );
}

function Row({ patientId, row }: { patientId: string; row: TargetRow }) {
  const [age, setAge] = useState<number>(row.targetAge);
  const [explicit, setExplicit] = useState<boolean>(row.isExplicit);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const commit = (next: number) => {
    const clamped = Math.max(40, Math.min(120, Math.round(next)));
    if (clamped === age && explicit) return;
    setAge(clamped);
    setSaved(false);
    startTransition(async () => {
      await setPatientTargetAge({ patientId, activityId: row.activityId, targetAge: clamped });
      setExplicit(true);
      setSaved(true);
    });
  };

  return (
    <div className="border border-slate-200 rounded-xl px-3 py-2 flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-slate-900 truncate">{row.activityName}</div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded-full border ${TIER_CHIP[row.tier]}`}>
            {row.tier}
          </span>
          {!explicit && (
            <span className="text-[10px] text-slate-400">default · 100</span>
          )}
        </div>
      </div>
      <label className="flex items-center gap-1.5 flex-shrink-0">
        <input
          type="number"
          min={40}
          max={120}
          value={age}
          disabled={pending}
          onChange={(e) => setAge(Math.max(40, Math.min(120, Number(e.target.value) || 0)))}
          onBlur={() => commit(age)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit(age);
          }}
          className="w-16 text-xs tabular-nums font-semibold text-right border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-teal-500"
        />
        <span className="text-[10px] text-slate-500 uppercase tracking-wide">yrs</span>
        {saved && <Check size={12} className="text-emerald-600" />}
      </label>
    </div>
  );
}
