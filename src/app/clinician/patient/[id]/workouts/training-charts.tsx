// Server-rendered SVG progress charts for the clinician workouts page.
// No client JS needed — pure SVG line charts.
import type { CardioWeek, Exercise1RM } from "@/lib/training-analytics";

type Series = { label: string; color: string; values: (number | null)[] };

function LineChart({
  series,
  xLabels,
  yUnit,
}: {
  series: Series[];
  xLabels: string[];
  yUnit: string;
}) {
  const W = 520;
  const H = 150;
  const padL = 34;
  const padR = 10;
  const padT = 10;
  const padB = 22;

  const all = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  const maxV = all.length ? Math.max(...all) : 1;
  const max = maxV <= 0 ? 1 : maxV * 1.1;
  const min = 0;
  const n = xLabels.length;

  const xAt = (i: number) => padL + (n <= 1 ? 0 : (i * (W - padL - padR)) / (n - 1));
  const yAt = (v: number) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        {/* y gridlines + labels at 0, mid, max */}
        {[0, max / 2, max].map((gv, i) => (
          <g key={i}>
            <line x1={padL} y1={yAt(gv)} x2={W - padR} y2={yAt(gv)} stroke="#e2e8f0" strokeWidth="0.6" />
            <text x={padL - 4} y={yAt(gv) + 3} textAnchor="end" fontSize="8" fill="#94a3b8">
              {Math.round(gv)}
            </text>
          </g>
        ))}
        {series.map((s, si) => {
          const pts = s.values
            .map((v, i) => (v == null ? null : `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`))
            .filter((p): p is string => p != null);
          return (
            <g key={si}>
              {pts.length > 1 && (
                <polyline points={pts.join(" ")} fill="none" stroke={s.color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
              )}
              {s.values.map((v, i) =>
                v == null ? null : <circle key={i} cx={xAt(i)} cy={yAt(v)} r="2.2" fill={s.color} />
              )}
            </g>
          );
        })}
        {/* x labels: first + last only to avoid clutter */}
        {n > 0 && (
          <>
            <text x={xAt(0)} y={H - 6} textAnchor="start" fontSize="8" fill="#94a3b8">{xLabels[0]}</text>
            {n > 1 && (
              <text x={xAt(n - 1)} y={H - 6} textAnchor="end" fontSize="8" fill="#94a3b8">{xLabels[n - 1]}</text>
            )}
          </>
        )}
      </svg>
      <div className="flex items-center gap-3 mt-1">
        {series.map((s) => (
          <span key={s.label} className="text-[10px] text-slate-500 inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} /> {s.label}
          </span>
        ))}
        <span className="text-[10px] text-slate-400 ml-auto">{yUnit}</span>
      </div>
    </div>
  );
}

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function CardioWeeksChart({ weeks }: { weeks: CardioWeek[] }) {
  const hasData = weeks.some((w) => w.zone2Min > 0 || w.vo2maxMin > 0);
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="text-sm font-semibold text-slate-900">Weekly cardio minutes</div>
      <div className="text-[11px] text-slate-500 mb-3">Zone 2 + VO₂ max completed per week</div>
      {!hasData ? (
        <div className="text-[12px] text-slate-400 italic py-6 text-center">No logged cardio yet.</div>
      ) : (
        <LineChart
          xLabels={weeks.map((w) => shortDate(w.weekStart))}
          yUnit="minutes / week"
          series={[
            { label: "Zone 2", color: "#0d9488", values: weeks.map((w) => w.zone2Min) },
            { label: "VO₂ max", color: "#e11d48", values: weeks.map((w) => w.vo2maxMin) },
          ]}
        />
      )}
    </section>
  );
}

export function OneRmCharts({ exercises }: { exercises: Exercise1RM[] }) {
  const withData = exercises.filter((e) => e.points.length > 0);
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="text-sm font-semibold text-slate-900">Estimated 1-rep max by exercise</div>
      <div className="text-[11px] text-slate-500 mb-3">Heaviest set per session (≤12 reps), Epley: weight × (1 + reps/30)</div>
      {withData.length === 0 ? (
        <div className="text-[12px] text-slate-400 italic py-6 text-center">No weighted sets logged yet.</div>
      ) : (
        <div className="space-y-5">
          {withData.map((ex) => {
            const latest = ex.points[ex.points.length - 1]?.oneRm;
            const first = ex.points[0]?.oneRm;
            const delta = latest != null && first != null ? latest - first : null;
            return (
              <div key={ex.exerciseId}>
                <div className="flex items-baseline justify-between mb-1">
                  <div className="text-[12px] font-semibold text-slate-700">{ex.name}</div>
                  <div className="text-[11px] text-slate-500 tabular-nums">
                    {latest} lb est.
                    {delta != null && delta !== 0 && (
                      <span className={delta > 0 ? "text-emerald-600" : "text-rose-600"}>
                        {" "}({delta > 0 ? "+" : ""}{delta})
                      </span>
                    )}
                  </div>
                </div>
                <LineChart
                  xLabels={ex.points.map((p) => shortDate(p.date))}
                  yUnit="lb (est. 1RM)"
                  series={[{ label: ex.name, color: "#2563eb", values: ex.points.map((p) => p.oneRm) }]}
                />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
