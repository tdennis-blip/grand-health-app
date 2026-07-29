import { Activity } from "lucide-react";
import type { BurnComparison } from "@/lib/diet-analytics";

// Provider-only: measured tracker burn vs. what the plan expected (base +
// planned activity), with a hit-rate. Hidden when there's no RMR or no tracker
// data to compare against.
export function BurnComparisonPanel({ data }: { data: BurnComparison | null }) {
  if (!data) return null;

  const { hitRatePct, daysMet, daysWithTracker, avgExpected, avgMeasured, baseKcal, days } = data;

  // Only render if there's at least one tracker day to compare.
  if (daysWithTracker === 0) {
    return (
      <section className="bg-white rounded-2xl border border-slate-200 p-5">
        <Header baseKcal={baseKcal} />
        <div className="mt-3 text-[13px] text-slate-500 italic">
          No wearable data in this window — nothing to compare. This panel populates once the patient connects and syncs a tracker.
        </div>
      </section>
    );
  }

  // Show the most recent ~14 days that have either a plan or a measurement.
  const recent = days.slice(-14);
  const maxVal = Math.max(1, ...recent.flatMap((d) => [d.expectedTotal, d.measuredTotal ?? 0]));

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5">
      <Header baseKcal={baseKcal} />

      <div className="mt-3 grid grid-cols-3 gap-3">
        <Stat label="Hit rate" value={hitRatePct != null ? `${hitRatePct}%` : "—"} sub={`${daysMet}/${daysWithTracker} days`} />
        <Stat label="Avg expected" value={avgExpected != null ? avgExpected.toLocaleString() : "—"} sub="kcal/day" />
        <Stat label="Avg measured" value={avgMeasured != null ? avgMeasured.toLocaleString() : "—"} sub="kcal/day" />
      </div>

      <div className="mt-4 space-y-1">
        <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
          <div className="col-span-3">Day</div>
          <div className="col-span-3 text-right">Expected</div>
          <div className="col-span-3 text-right">Measured</div>
          <div className="col-span-3 text-right">Δ</div>
        </div>
        {recent.map((d) => {
          const measured = d.measuredTotal;
          const delta = measured != null ? measured - d.expectedTotal : null;
          const met = measured != null && measured >= d.expectedTotal;
          return (
            <div key={d.date} className="grid grid-cols-12 gap-2 items-center py-1 border-t border-slate-100 text-sm">
              <div className="col-span-3 text-[12px] text-slate-600">
                {new Date(`${d.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "numeric", day: "numeric" })}
                {d.plannedKcal > 0 && <span className="text-[10px] text-teal-600 ml-1">+{d.plannedKcal}</span>}
              </div>
              <div className="col-span-3 text-right tabular-nums text-slate-500">{d.expectedTotal.toLocaleString()}</div>
              <div className="col-span-3 text-right tabular-nums font-semibold text-slate-900">
                {measured != null ? measured.toLocaleString() : <span className="text-slate-300">no data</span>}
              </div>
              <div className={`col-span-3 text-right tabular-nums font-semibold ${
                delta == null ? "text-slate-300" : met ? "text-emerald-600" : "text-rose-600"
              }`}>
                {delta == null ? "—" : `${delta > 0 ? "+" : ""}${delta.toLocaleString()}`}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 text-[11px] text-slate-400 leading-snug">
        Expected = resting base ({baseKcal.toLocaleString()} kcal) + the activity the patient planned that day (green +). Measured = tracker total burn. Green Δ means they burned at least what the plan assumed.
      </div>
    </section>
  );
}

function Header({ baseKcal }: { baseKcal: number }) {
  return (
    <div className="flex items-center gap-2">
      <Activity size={16} className="text-rose-500" />
      <div>
        <div className="text-sm font-semibold text-slate-900">Expected vs. measured burn</div>
        <div className="text-[11px] text-slate-500">How often the patient burns what the plan expects (tracker days only).</div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-slate-50 rounded-xl p-2.5 text-center">
      <div className="text-[9.5px] uppercase tracking-wide text-slate-500 font-semibold">{label}</div>
      <div className="text-lg font-semibold text-slate-900 tabular-nums leading-tight mt-0.5">{value}</div>
      <div className="text-[10px] text-slate-400">{sub}</div>
    </div>
  );
}
