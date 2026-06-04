import Link from "next/link";
import { Pill, ChevronRight, AlertTriangle, Package } from "lucide-react";
import { getStack, getAdherenceStrip, refillStatus } from "@/lib/medications";
import { checkPatientStack } from "@/lib/medications-interactions";

export async function StackSummaryCard({ patientId }: { patientId: string }) {
  const [stack, adherence] = await Promise.all([
    getStack(patientId),
    getAdherenceStrip(patientId, 7),
  ]);

  const interactions = await checkPatientStack(
    stack.map((m) => ({ id: m.id, name: m.name, active: m.active })),
  );

  const activeCount = stack.filter((m) => m.active).length;
  const doseCount = stack.reduce((acc, m) => acc + m.doses.length, 0);

  let lowCount = 0;
  let outCount = 0;
  for (const m of stack) {
    if (!m.active) continue;
    const r = refillStatus(m);
    if (r.state === "low") lowCount++;
    if (r.state === "out") outCount++;
  }

  // Last 7-day adherence rollup
  const totalScheduled = adherence.reduce((a, b) => a + b.scheduled, 0);
  const totalTaken = adherence.reduce((a, b) => a + b.taken, 0);
  const adherencePct =
    totalScheduled === 0 ? null : Math.round((totalTaken / totalScheduled) * 100);

  return (
    <Link
      href={`/clinician/patient/${patientId}/stack`}
      className="block bg-white rounded-2xl border border-slate-200 p-5 hover:border-teal-300 transition"
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center">
          <Pill size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-900">Meds &amp; Supplements</div>
          <div className="text-[11px] text-slate-500">
            {activeCount} active {activeCount === 1 ? "item" : "items"} ·{" "}
            {doseCount} {doseCount === 1 ? "dose" : "doses"}/schedule
            {adherencePct != null && ` · ${adherencePct}% 7d adherence`}
          </div>
        </div>
        <ChevronRight size={16} className="text-slate-300" />
      </div>

      {stack.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {stack.slice(0, 6).map((m) => (
            <span
              key={m.id}
              className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                m.active
                  ? "bg-slate-50 text-slate-700 border-slate-200"
                  : "bg-slate-100 text-slate-400 border-slate-200 line-through"
              }`}
            >
              {m.name}
              {m.dose && <span className="text-slate-400 font-normal"> · {m.dose}</span>}
            </span>
          ))}
          {stack.length > 6 && (
            <span className="text-[11px] text-slate-500">+{stack.length - 6} more</span>
          )}
        </div>
      )}
      {stack.length === 0 && (
        <div className="mt-3 text-[12px] text-slate-500">
          Nothing here yet — click to add the patient&apos;s first med or supplement.
        </div>
      )}

      {(interactions.length > 0 || outCount > 0 || lowCount > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {interactions.length > 0 && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-amber-50 text-amber-800 border-amber-200 inline-flex items-center gap-1">
              <AlertTriangle size={10} /> {interactions.length} interaction
              {interactions.length === 1 ? "" : "s"}
            </span>
          )}
          {outCount > 0 && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-rose-50 text-rose-700 border-rose-200 inline-flex items-center gap-1">
              <Package size={10} /> {outCount} out of supply
            </span>
          )}
          {lowCount > 0 && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-amber-50 text-amber-800 border-amber-200 inline-flex items-center gap-1">
              <Package size={10} /> {lowCount} running low
            </span>
          )}
        </div>
      )}
    </Link>
  );
}
