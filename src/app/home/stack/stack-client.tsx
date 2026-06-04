"use client";

import { useState, useTransition } from "react";
import { Check, Clock, Utensils } from "lucide-react";
import { formatTime12, type TodayDose } from "@/lib/medications-utils";
import { markDoseTaken, unmarkDoseTaken } from "./dose-actions";

export function StackClient({
  logDate,
  doses,
}: {
  logDate: string;
  doses: TodayDose[];
}) {
  if (doses.length === 0) {
    return (
      <section className="bg-white rounded-2xl border border-dashed border-slate-200 p-5 text-center">
        <div className="text-sm font-semibold text-slate-900">Nothing scheduled today</div>
        <div className="text-[12px] text-slate-500 leading-snug mt-1">
          Your meds &amp; supplements list has items, but none are scheduled for today.
        </div>
      </section>
    );
  }

  // Group by time-of-day bucket (Morning / Midday / Evening / Night).
  const buckets: Array<{ label: string; items: TodayDose[] }> = [
    { label: "Morning", items: [] },
    { label: "Midday", items: [] },
    { label: "Evening", items: [] },
    { label: "Night", items: [] },
  ];
  for (const d of doses) {
    const hour = Number(d.timeLocal.slice(0, 2));
    if (hour < 11) buckets[0].items.push(d);
    else if (hour < 15) buckets[1].items.push(d);
    else if (hour < 20) buckets[2].items.push(d);
    else buckets[3].items.push(d);
  }

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-4">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
        Today's doses
      </div>
      {buckets.filter((b) => b.items.length > 0).map((b) => (
        <div key={b.label}>
          <div className="text-[11px] uppercase tracking-wide text-slate-600 font-semibold mb-2 flex items-center gap-1">
            <Clock size={11} /> {b.label}
          </div>
          <div className="space-y-1.5">
            {b.items.map((d) => (
              <DoseRow key={d.doseId} logDate={logDate} dose={d} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function DoseRow({ logDate, dose }: { logDate: string; dose: TodayDose }) {
  const [optimistic, setOptimistic] = useState<boolean>(dose.taken);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    const next = !optimistic;
    setOptimistic(next);
    startTransition(async () => {
      try {
        if (next) {
          await markDoseTaken({ doseId: dose.doseId, scheduledFor: logDate });
        } else {
          await unmarkDoseTaken({ doseId: dose.doseId, scheduledFor: logDate });
        }
      } catch {
        // Revert on error
        setOptimistic(!next);
      }
    });
  };

  const amount = dose.amountOverride ?? dose.dose;
  return (
    <button
      onClick={toggle}
      disabled={pending}
      className={`w-full bg-slate-50 border rounded-lg px-3 py-2.5 flex items-center gap-3 text-left transition ${
        optimistic
          ? "border-emerald-200 bg-emerald-50/40"
          : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <div
        className={`w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition ${
          optimistic ? "bg-emerald-600 border-emerald-600" : "border-slate-300 bg-white"
        }`}
      >
        {optimistic && <Check size={14} className="text-white" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium ${optimistic ? "line-through text-slate-400" : "text-slate-900"}`}>
          {dose.name}
          {amount && <span className="text-slate-400 font-normal"> · {amount}</span>}
        </div>
        <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
          <span className="tabular-nums">{formatTime12(dose.timeLocal)}</span>
          {dose.label && <span>· {dose.label}</span>}
          {dose.withFood === true && (
            <span className="inline-flex items-center gap-0.5 text-[10px]">
              · <Utensils size={9} /> with food
            </span>
          )}
        </div>
      </div>
      <span
        className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded-full border ${
          dose.kind === "supplement"
            ? "bg-violet-50 text-violet-700 border-violet-200"
            : "bg-slate-100 text-slate-600 border-slate-200"
        }`}
      >
        {dose.kind === "supplement" ? "supp" : "med"}
      </span>
    </button>
  );
}
