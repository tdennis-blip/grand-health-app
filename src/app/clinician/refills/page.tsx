import Link from "next/link";
import { Package, ChevronRight } from "lucide-react";
import { getClinicRefillBoard, type RefillRow } from "@/lib/medications-refills";

export const dynamic = "force-dynamic";

export default async function RefillsDashboardPage() {
  const rows = await getClinicRefillBoard();

  // Group by patient for cleaner scanning.
  const byPatient: Record<string, RefillRow[]> = {};
  for (const r of rows) {
    (byPatient[r.patientId] ?? (byPatient[r.patientId] = [])).push(r);
  }
  const patientIds = Object.keys(byPatient).sort((a, b) => {
    // Patients with an "out" item first; then by worst days remaining.
    const aWorst = worstDays(byPatient[a]);
    const bWorst = worstDays(byPatient[b]);
    return aWorst - bWorst;
  });

  const outCount = rows.filter((r) => r.refill.state === "out").length;
  const lowCount = rows.filter((r) => r.refill.state === "low").length;

  return (
    <main className="max-w-3xl mx-auto px-6 py-6 space-y-5">
      <header>
        <div className="text-xs uppercase tracking-wide text-slate-500">Clinic</div>
        <div className="text-xl font-semibold text-slate-900 flex items-center gap-1.5">
          <Package size={18} className="text-violet-600" /> Refill queue
        </div>
        <div className="text-[12px] text-slate-500 mt-1">
          Active meds with quantity-on-hand at or below the refill threshold.
          {outCount > 0 && (
            <span className="ml-1 text-rose-700 font-semibold">{outCount} out</span>
          )}
          {lowCount > 0 && (
            <span className="ml-1 text-amber-700 font-semibold">· {lowCount} low</span>
          )}
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-6 text-center text-[12px] text-slate-500">
          Nothing flagged. Either no one is below threshold, or no medications
          have on-hand quantity recorded yet.
        </div>
      ) : (
        <div className="space-y-3">
          {patientIds.map((pid) => {
            const items = byPatient[pid];
            const first = items[0];
            const patientName =
              [first.patientFirstName, first.patientLastName].filter(Boolean).join(" ") ||
              "Patient";
            return (
              <Link
                key={pid}
                href={`/clinician/patient/${pid}/stack`}
                className="block bg-white border border-slate-200 rounded-2xl p-4 hover:border-teal-300 transition"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900">{patientName}</div>
                  <ChevronRight size={16} className="text-slate-300" />
                </div>
                <ul className="mt-2 space-y-1">
                  {items.map((it) => (
                    <li
                      key={it.medicationId}
                      className="flex items-center justify-between gap-2 text-[12px]"
                    >
                      <div className="min-w-0 truncate text-slate-700">
                        {it.name}
                        {it.dose && <span className="text-slate-400"> · {it.dose}</span>}
                      </div>
                      <RefillBadge row={it} />
                    </li>
                  ))}
                </ul>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}

function worstDays(items: RefillRow[]): number {
  let w = Number.POSITIVE_INFINITY;
  for (const it of items) {
    const v = it.refill.state === "out" ? -1 : it.refill.daysRemaining ?? 9999;
    if (v < w) w = v;
  }
  return w;
}

function RefillBadge({ row }: { row: RefillRow }) {
  if (row.refill.state === "out") {
    return (
      <span className="text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
        Out
      </span>
    );
  }
  return (
    <span className="text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 tabular-nums">
      {row.refill.daysRemaining}d
    </span>
  );
}
