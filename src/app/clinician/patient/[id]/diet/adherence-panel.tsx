import { Apple } from "lucide-react";

type FoodLogRow = {
  logDate: string;
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
};

export function AdherencePanel({
  slots,
  targets,
}: {
  slots: Array<{ date: string; log: FoodLogRow | null }>;
  targets: { goalKcal: number; proteinG: number; carbsG: number; fatG: number; fiberG: number } | null;
}) {
  const logged = slots.filter((s) => s.log).map((s) => s.log!) as FoodLogRow[];
  const daysLogged = logged.length;

  const avg = (key: keyof FoodLogRow) =>
    logged.length
      ? Math.round(logged.reduce((sum, r) => sum + ((r[key] as number | null) ?? 0), 0) / logged.length)
      : 0;

  const avgKcal = avg("kcal");
  const avgProtein = avg("proteinG");
  const avgCarbs = avg("carbsG");
  const avgFat = avg("fatG");

  const proteinHits = targets
    ? logged.filter((r) => (r.proteinG ?? 0) >= targets.proteinG * 0.9).length
    : 0;

  // Bar chart geometry
  const W = 380, H = 110, padL = 28, padR = 8, padT = 8, padB = 22;
  const goalK = targets?.goalKcal ?? 0;
  const ceiling = Math.max(goalK * 1.25, ...slots.map((s) => s.log?.kcal ?? 0)) || 1;
  const barW = (W - padL - padR) / slots.length - 4;
  const xFor = (i: number) => padL + i * ((W - padL - padR) / slots.length);
  const yFor = (v: number) => padT + (1 - v / ceiling) * (H - padT - padB);

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center">
            <Apple size={16} />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">Diet adherence</div>
            <div className="text-[11px] text-slate-500">Last 7 days of logged intake.</div>
          </div>
        </div>
        <span className={`text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full border ${
          daysLogged >= 6 ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : daysLogged >= 4 ? "bg-amber-50 text-amber-700 border-amber-200"
          : "bg-rose-50 text-rose-700 border-rose-200"
        }`}>
          {daysLogged}/7 days logged
        </span>
      </div>

      {!targets ? (
        <div className="text-[12px] text-slate-500 italic bg-slate-50 rounded-xl border border-dashed border-slate-200 p-4 text-center">
          Set a diet plan first to compare logs to targets.
        </div>
      ) : (
        <>
          {/* 4 averages */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            <Stat label="Avg kcal" value={avgKcal.toLocaleString()} target={`/${targets.goalKcal.toLocaleString()}`} pct={pctOf(avgKcal, targets.goalKcal)} color="text-orange-700" />
            <Stat label="Avg protein" value={`${avgProtein}g`} target={`/${targets.proteinG}g`} pct={pctOf(avgProtein, targets.proteinG)} color="text-teal-700" />
            <Stat label="Avg carbs" value={`${avgCarbs}g`} target={`/${targets.carbsG}g`} pct={pctOf(avgCarbs, targets.carbsG)} color="text-amber-700" />
            <Stat label="Avg fat" value={`${avgFat}g`} target={`/${targets.fatG}g`} pct={pctOf(avgFat, targets.fatG)} color="text-rose-700" />
          </div>

          <div className="text-[11px] text-slate-600 mb-2">
            Protein target hit on <span className="font-semibold text-slate-900">{proteinHits}</span> of {daysLogged} logged day{daysLogged === 1 ? "" : "s"}
          </div>

          {/* SVG bar chart */}
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
            {/* Goal line */}
            <line x1={padL} y1={yFor(goalK)} x2={W - padR} y2={yFor(goalK)}
              stroke="#94a3b8" strokeDasharray="3 3" strokeWidth="0.7" />
            <text x={W - padR - 2} y={yFor(goalK) - 2} textAnchor="end" fontSize="8" fill="#64748b">goal {goalK.toLocaleString()}</text>

            {/* Bars */}
            {slots.map((s, i) => {
              const v = s.log?.kcal ?? null;
              const dayLabel = new Date(s.date + "T00:00").toLocaleDateString(undefined, { weekday: "narrow" });
              const x = xFor(i);
              if (v == null) {
                // muted "no log" placeholder bar
                return (
                  <g key={s.date}>
                    <rect x={x} y={H - padB - 2} width={barW} height={2} fill="#e2e8f0" />
                    <text x={x + barW / 2} y={H - padB + 12} textAnchor="middle" fontSize="9" fill="#94a3b8">{dayLabel}</text>
                  </g>
                );
              }
              const yTop = yFor(v);
              const h = (H - padB) - yTop;
              const pct = v / goalK;
              const color = Math.abs(pct - 1) < 0.1 ? "#10b981" : Math.abs(pct - 1) < 0.25 ? "#f59e0b" : "#f43f5e";
              return (
                <g key={s.date}>
                  <text x={x + barW / 2} y={yTop - 2} textAnchor="middle" fontSize="8" fill="#475569">{v.toLocaleString()}</text>
                  <rect x={x} y={yTop} width={barW} height={Math.max(2, h)} fill={color} rx="1" />
                  <text x={x + barW / 2} y={H - padB + 12} textAnchor="middle" fontSize="9" fill="#94a3b8">{dayLabel}</text>
                </g>
              );
            })}
          </svg>
        </>
      )}
    </section>
  );
}

function pctOf(value: number, target: number): number {
  if (!target) return 0;
  return Math.round((value / target) * 100);
}

function Stat({ label, value, target, pct, color }: { label: string; value: string; target: string; pct: number; color: string }) {
  const tone = pct >= 90 && pct <= 110 ? "bg-emerald-500" : pct >= 75 && pct <= 125 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{label}</div>
      <div className={`text-base font-semibold mt-0.5 ${color}`}>{value}</div>
      <div className="text-[10px] text-slate-500">{target}</div>
      <div className="mt-1.5 h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div className={`h-full ${tone}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <div className="mt-0.5 text-[9px] text-slate-500">{pct}% of goal</div>
    </div>
  );
}
