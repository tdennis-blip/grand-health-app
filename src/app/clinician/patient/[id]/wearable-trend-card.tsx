// Clinician-side wearable trend card. Shows up to 30 days of sleep, HRV,
// and recovery/readiness for the patient, with a compact SVG sparkline so
// the clinician can scan at a glance.
//
// All values come from public.wearable_daily_metrics — RLS already scopes
// the query to the clinician's clinic.
import Link from "next/link";
import { Activity, HeartPulse, Moon, Plug } from "lucide-react";
import {
  formatSleepDuration,
  getRecentMetrics,
  type DailyMetricRow,
} from "@/lib/wearables/queries";

const WINDOW_DAYS = 30;

export async function WearableTrendCard({ patientId }: { patientId: string }) {
  const rows = await getRecentMetrics(patientId, WINDOW_DAYS);

  if (rows.length === 0) {
    return (
      <section className="bg-white rounded-2xl border border-dashed border-slate-200 p-5">
        <div className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
          <Plug size={14} className="text-slate-400" /> Wearables
        </div>
        <div className="text-[12px] text-slate-500 mt-1">
          No tracker connected yet. Ask the patient to link Oura or Whoop in their app.
        </div>
      </section>
    );
  }

  // Sort ascending for chart, group by provider for the per-provider labels.
  const ascending = rows.slice().sort((a, b) => String(a.metric_date).localeCompare(String(b.metric_date)));
  const latest = ascending[ascending.length - 1];

  const sleepSeries = ascending.map((r) => r.sleep_total_minutes ?? null);
  const hrvSeries = ascending.map((r) => r.hrv_rmssd_ms != null ? Number(r.hrv_rmssd_ms) : null);
  const recoverySeries = ascending.map(
    (r) => r.recovery_score ?? r.readiness_score ?? null
  );

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900">Wearable trends</div>
          <div className="text-[11px] text-slate-500">
            Last {WINDOW_DAYS} days · {rows.length} day{rows.length === 1 ? "" : "s"} of data ·{" "}
            {prettyProvider(latest.provider)}
          </div>
        </div>
        <Link
          href={`/clinician/audit?entity=wearable_daily_metrics&patient=${patientId}`}
          className="text-[11px] text-slate-400 hover:text-slate-700"
        >
          Activity →
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <TrendTile
          icon={<Moon size={14} />}
          label="Sleep"
          value={formatSleepDuration(latest.sleep_total_minutes) ?? "—"}
          sub={
            latest.sleep_efficiency_pct != null
              ? `${Math.round(Number(latest.sleep_efficiency_pct))}% eff`
              : null
          }
          series={sleepSeries}
          colorClass="text-indigo-600 stroke-indigo-500"
        />
        <TrendTile
          icon={<HeartPulse size={14} />}
          label="HRV"
          value={latest.hrv_rmssd_ms != null ? `${Math.round(Number(latest.hrv_rmssd_ms))}ms` : "—"}
          sub={
            latest.resting_hr_bpm != null
              ? `${Math.round(Number(latest.resting_hr_bpm))} rHR`
              : null
          }
          series={hrvSeries}
          colorClass="text-rose-600 stroke-rose-500"
        />
        <TrendTile
          icon={<Activity size={14} />}
          label={latest.recovery_score != null ? "Recovery" : "Readiness"}
          value={
            latest.recovery_score != null
              ? String(latest.recovery_score)
              : latest.readiness_score != null
              ? String(latest.readiness_score)
              : "—"
          }
          sub={null}
          series={recoverySeries}
          colorClass="text-emerald-600 stroke-emerald-500"
        />
      </div>
    </section>
  );
}

function TrendTile({
  icon,
  label,
  value,
  sub,
  series,
  colorClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string | null;
  series: (number | null)[];
  colorClass: string;
}) {
  return (
    <div className="bg-slate-50 rounded-xl p-3">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold flex items-center gap-1">
        <span className={colorClass.split(" ")[0]}>{icon}</span>
        {label}
      </div>
      <div className="text-lg font-semibold text-slate-900 mt-0.5">{value}</div>
      {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
      <Sparkline values={series} colorClass={colorClass} />
    </div>
  );
}

function Sparkline({
  values,
  colorClass,
}: {
  values: (number | null)[];
  colorClass: string;
}) {
  const w = 120;
  const h = 28;
  const stroke = colorClass.split(" ").find((c) => c.startsWith("stroke-")) ?? "stroke-slate-500";
  const numeric = values.map((v) => (v == null ? NaN : v));
  const finite = numeric.filter((v) => Number.isFinite(v)) as number[];
  if (finite.length < 2) {
    return <div className="h-7 mt-1.5 text-[10px] text-slate-300">Not enough data</div>;
  }
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const range = max - min || 1;
  const stepX = w / Math.max(1, numeric.length - 1);
  const pathPoints: string[] = [];
  let prevValid = false;
  numeric.forEach((v, i) => {
    if (!Number.isFinite(v)) {
      prevValid = false;
      return;
    }
    const x = i * stepX;
    const y = h - ((v - min) / range) * h;
    pathPoints.push(`${prevValid ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`);
    prevValid = true;
  });
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      height={h}
      className="mt-1.5"
      preserveAspectRatio="none"
    >
      <path d={pathPoints.join(" ")} fill="none" strokeWidth={1.5} className={stroke} />
    </svg>
  );
}

function prettyProvider(p: DailyMetricRow["provider"]): string {
  switch (p) {
    case "oura":
      return "Oura";
    case "whoop":
      return "Whoop";
    case "apple_health":
      return "Apple Health";
    case "eight_sleep":
      return "Eight Sleep";
  }
}
