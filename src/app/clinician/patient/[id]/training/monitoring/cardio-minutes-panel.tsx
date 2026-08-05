"use client";

import { useMemo, useState } from "react";
import type { CardioWeek } from "@/lib/training-analytics";

const ZONE2 = "#0284c7";
const VO2MAX = "#e11d48";

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Weekly Zone 2 + VO₂ max minutes: a headline weekly average, with a toggle to
// inspect the per-week totals as bars + a table.
export function CardioMinutesPanel({ weeks }: { weeks: CardioWeek[] }) {
  const [view, setView] = useState<"average" | "totals">("average");

  const { zone2Avg, vo2maxAvg, zone2Total, vo2maxTotal, n } = useMemo(() => {
    const n = weeks.length || 1;
    const zone2Total = weeks.reduce((a, w) => a + w.zone2Min, 0);
    const vo2maxTotal = weeks.reduce((a, w) => a + w.vo2maxMin, 0);
    return {
      n,
      zone2Total,
      vo2maxTotal,
      zone2Avg: Math.round(zone2Total / n),
      vo2maxAvg: Math.round(vo2maxTotal / n),
    };
  }, [weeks]);

  const hasData = zone2Total > 0 || vo2maxTotal > 0;

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">Cardio minutes</div>
          <div className="text-[11px] text-slate-500">Zone 2 &amp; VO₂ max over the last {n} weeks</div>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-[12px]">
          {(["average", "totals"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`px-2.5 py-1 rounded-md capitalize transition-colors ${
                view === v ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {v === "average" ? "Weekly avg" : "Weekly totals"}
            </button>
          ))}
        </div>
      </div>

      {!hasData ? (
        <div className="text-[12px] text-slate-400 italic py-6 text-center">No logged cardio yet.</div>
      ) : view === "average" ? (
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Zone 2" avg={zone2Avg} total={zone2Total} color={ZONE2} />
          <StatCard label="VO₂ max" avg={vo2maxAvg} total={vo2maxTotal} color={VO2MAX} />
        </div>
      ) : (
        <WeeklyTotals weeks={weeks} />
      )}
    </section>
  );
}

function StatCard({ label, avg, total, color }: { label: string; avg: number; total: number; color: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-slate-700">
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} /> {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">
        {avg}<span className="text-[12px] font-normal text-slate-400"> min/wk avg</span>
      </div>
      <div className="text-[11px] text-slate-500 tabular-nums">{total} min total</div>
    </div>
  );
}

function WeeklyTotals({ weeks }: { weeks: CardioWeek[] }) {
  const max = Math.max(1, ...weeks.map((w) => w.zone2Min + w.vo2maxMin));
  return (
    <div>
      {/* Stacked bars per week */}
      <div className="flex items-end gap-1.5 h-28">
        {weeks.map((w) => {
          const z = (w.zone2Min / max) * 100;
          const v = (w.vo2maxMin / max) * 100;
          return (
            <div key={w.weekStart} className="flex-1 flex flex-col items-center gap-1" title={`${shortDate(w.weekStart)} · Zone 2 ${w.zone2Min} min · VO₂ max ${w.vo2maxMin} min`}>
              <div className="w-full flex flex-col justify-end h-24 rounded-t overflow-hidden bg-slate-50">
                {v > 0 && <div style={{ height: `${v}%`, backgroundColor: VO2MAX }} />}
                {z > 0 && <div style={{ height: `${z}%`, backgroundColor: ZONE2 }} />}
              </div>
              <div className="text-[8px] text-slate-400 leading-none">{shortDate(w.weekStart)}</div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-2">
        <Legend color={ZONE2} label="Zone 2" />
        <Legend color={VO2MAX} label="VO₂ max" />
        <span className="text-[10px] text-slate-400 ml-auto">minutes / week</span>
      </div>

      {/* Table */}
      <div className="mt-3 grid grid-cols-4 gap-2 text-[11px]">
        <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Week of</div>
        <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold text-right">Zone 2</div>
        <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold text-right">VO₂ max</div>
        <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold text-right">Total</div>
        {weeks.map((w) => (
          <FragmentRow key={w.weekStart} w={w} />
        ))}
      </div>
    </div>
  );
}

function FragmentRow({ w }: { w: CardioWeek }) {
  return (
    <>
      <div className="text-slate-600 tabular-nums border-t border-slate-100 py-1">{shortDate(w.weekStart)}</div>
      <div className="text-slate-700 tabular-nums text-right border-t border-slate-100 py-1">{w.zone2Min}</div>
      <div className="text-slate-700 tabular-nums text-right border-t border-slate-100 py-1">{w.vo2maxMin}</div>
      <div className="text-slate-900 font-semibold tabular-nums text-right border-t border-slate-100 py-1">{w.zone2Min + w.vo2maxMin}</div>
    </>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="text-[10px] text-slate-500 inline-flex items-center gap-1">
      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} /> {label}
    </span>
  );
}
