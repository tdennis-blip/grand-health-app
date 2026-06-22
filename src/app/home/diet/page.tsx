import Link from "next/link";
import { Apple, Droplet, ChevronLeft } from "lucide-react";
import { requirePatient } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import {
  getMyDietTargets,
  getRecentFoodLogs,
  getDayEntries,
  getFavoriteFoods,
  getRecentFoods,
  isoDate,
  buildDaySlots,
  sumTotals,
  MICRO_REFS,
} from "@/lib/diet";
import { FoodLogger } from "./food-logger";
import { getSupplementMicrosForDate } from "@/lib/medications";
import { AIDietPlan } from "./ai-plan";

export default async function PatientDiet() {
  const user = await requirePatient();
  const { targets } = await getMyDietTargets();
  const todayIso = isoDate(new Date());

  const [recent, entries, favorites, recentFoods, suppMicros, [patientProfile]] = await Promise.all([
    getRecentFoodLogs(user.id, 7, user),
    getDayEntries(user, todayIso),
    getFavoriteFoods(user, 12),
    getRecentFoods(user, 12),
    getSupplementMicrosForDate(user.id, todayIso, user),
    withAuth(user, (sql) => sql`SELECT dietary_preferences FROM patient_profiles WHERE profile_id = ${user.id} LIMIT 1`),
  ]);

  const hasPreferences = !!patientProfile?.dietary_preferences;

  const foodTotals = sumTotals(entries);
  // Merge supplement micronutrients into food totals for the micro grid.
  const totals = suppMicros
    ? {
        ...foodTotals,
        vitaminDIu:   foodTotals.vitaminDIu   + suppMicros.vitaminDIu,
        vitaminB12Ug: foodTotals.vitaminB12Ug + suppMicros.vitaminB12Ug,
        ironMg:       foodTotals.ironMg       + suppMicros.ironMg,
        magnesiumMg:  foodTotals.magnesiumMg  + suppMicros.magnesiumMg,
        calciumMg:    foodTotals.calciumMg    + suppMicros.calciumMg,
        potassiumMg:  foodTotals.potassiumMg  + suppMicros.potassiumMg,
        sodiumMg:     foodTotals.sodiumMg     + suppMicros.sodiumMg,
        omega3Mg:     foodTotals.omega3Mg     + (suppMicros.dhaMg + suppMicros.epaMg),
      }
    : foodTotals;
  const slots = buildDaySlots(recent, 7);
  const suppSources = suppMicros?.sources ?? [];

  return (
    <main className="p-5 space-y-4">
      <Link href="/home" className="text-sm text-teal-700 inline-flex items-center gap-1">
        <ChevronLeft size={14} /> Home
      </Link>
      <header>
        <div className="text-xs uppercase tracking-wide text-slate-500">Today's targets</div>
        <div className="text-xl font-semibold text-slate-900 flex items-center gap-1.5">
          <Apple size={18} className="text-orange-600" /> Diet
        </div>
      </header>

      {!targets ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-5 text-center">
          <div className="text-sm font-semibold text-slate-900">No diet plan yet</div>
          <div className="text-[12px] text-slate-500 leading-snug mt-1">
            Your clinician hasn&apos;t set up your targets. They&apos;ll appear here once they do.
          </div>
        </div>
      ) : (
        <>
          {/* Headline kcal */}
          <div className="bg-gradient-to-br from-orange-500 via-orange-500 to-rose-500 text-white rounded-3xl p-5">
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-wide opacity-90">Daily kcal goal</div>
              {targets.activityMode === "dynamic" && targets.activitySource !== "none" && (
                <span className="text-[9.5px] uppercase tracking-wide font-semibold bg-white/20 rounded-full px-2 py-0.5">
                  {targets.activitySource === "wearable"
                    ? `${targets.activityProvider ?? "wearable"} synced`
                    : "estimated"}
                </span>
              )}
            </div>
            <div className="text-4xl font-semibold mt-1 tabular-nums">{targets.goalKcal.toLocaleString()}</div>
            {targets.activityMode === "dynamic" ? (
              <>
                <div className="text-[12px] opacity-90 mt-1">
                  Base {targets.baseKcal.toLocaleString()}
                  {targets.activeKcalCredited > 0 && ` + ${targets.activeKcalCredited} from activity`}
                  {targets.deficitKcal !== 0 && ` · ${targets.deficitKcal > 0 ? "+" : ""}${targets.deficitKcal} kcal/day`}
                </div>
                {targets.activeKcalRaw > 0 && targets.activityCreditPct < 100 && (
                  <div className="text-[10.5px] opacity-80 mt-1">
                    {targets.activeKcalRaw.toLocaleString()} active kcal today · crediting {targets.activityCreditPct}%
                  </div>
                )}
                {targets.activeKcalCredited === 0 && (
                  <div className="text-[10.5px] opacity-80 mt-1">
                    Goal rises as you log workouts or sync your wearable.
                  </div>
                )}
              </>
            ) : (
              <div className="text-[12px] opacity-90 mt-1">
                TDEE {targets.tdee.toLocaleString()}
                {targets.deficitKcal !== 0 && ` · ${targets.deficitKcal > 0 ? "+" : ""}${targets.deficitKcal} kcal/day`}
              </div>
            )}
          </div>

          {/* Today logged vs target — progress bars */}
          <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Today</div>
                <div className="text-sm font-semibold text-slate-900">
                  {entries.length > 0 ? `${totals.kcal.toLocaleString()} / ${targets.goalKcal.toLocaleString()} kcal` : "Nothing logged yet"}
                </div>
              </div>
              {entries.length > 0 && (
                <span className={`text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full border ${badgeClsForKcal(totals.kcal, targets.goalKcal)}`}>
                  {pctOf(totals.kcal, targets.goalKcal)}%
                </span>
              )}
            </div>
            <ProgressBar label="kcal"    value={totals.kcal}     target={targets.goalKcal} color="bg-orange-500" />
            <ProgressBar label="Protein" value={totals.proteinG} target={targets.proteinG} color="bg-teal-500" suffix="g" />
            <ProgressBar label="Carbs"   value={totals.carbsG}   target={targets.carbsG}   color="bg-amber-500" suffix="g" />
            <ProgressBar label="Fat"     value={totals.fatG}     target={targets.fatG}     color="bg-rose-500"  suffix="g" />
            <ProgressBar label="Fiber"   value={totals.fiberG}   target={targets.fiberG}   color="bg-emerald-500" suffix="g" />
          </section>

          {/* The logger itself — search USDA + per-meal entries */}
          <FoodLogger
            logDate={todayIso}
            entries={entries}
            favorites={favorites}
            recents={recentFoods}
          />

          {/* Micronutrient summary */}
          <section className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="flex items-baseline justify-between mb-3">
              <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Today's micronutrients</div>
              {suppSources.length > 0 && (
                <div className="text-[9.5px] text-violet-600 font-medium">
                  + {suppSources.join(", ")}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(MICRO_REFS) as [keyof typeof MICRO_REFS, typeof MICRO_REFS[keyof typeof MICRO_REFS]][]).map(([key, ref]) => {
                const value = (totals as any)[key] as number;
                return <MicroTile key={key} value={value} spec={ref} />;
              })}
            </div>
          </section>

          {/* AI meal planner */}
          <AIDietPlan hasPreferences={hasPreferences} />

          {/* Macro tiles (target reference) */}
          <section className="grid grid-cols-3 gap-2">
            <MacroTile label="Protein" value={`${targets.proteinG}g`} tone="teal" />
            <MacroTile label="Carbs"   value={`${targets.carbsG}g`}   tone="amber" />
            <MacroTile label="Fat"     value={`${targets.fatG}g`}     tone="rose" />
          </section>

          {/* Secondary targets */}
          <section className="grid grid-cols-3 gap-2">
            <SmallTile label="Fiber" value={`${targets.fiberG}g`} />
            <SmallTile label="Meals" value={`${targets.mealsPerDay}/day`} />
            <SmallTile label="Water" icon={<Droplet size={11} className="text-blue-500" />} value={`${targets.waterL}L`} />
          </section>

          {/* Recent 7 days */}
          <section className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-2">Last 7 days</div>
            <RecentStrip slots={slots} goalKcal={targets.goalKcal} />
          </section>

          {/* Clinician note */}
          {targets.notes && (
            <section className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">From your clinician</div>
              <div className="text-[13px] text-slate-700 leading-snug">{targets.notes}</div>
            </section>
          )}
        </>
      )}
    </main>
  );
}

function pctOf(value: number | null, target: number): number {
  if (!target) return 0;
  return Math.round(((value ?? 0) / target) * 100);
}

function badgeClsForKcal(value: number | null, target: number): string {
  const pct = pctOf(value, target);
  if (pct >= 90 && pct <= 110) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (pct >= 75 && pct <= 125) return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-rose-50 text-rose-700 border-rose-200";
}

function ProgressBar({ label, value, target, color, suffix }: { label: string; value: number; target: number; color: string; suffix?: string }) {
  const pct = target ? Math.min(120, Math.round((value / target) * 100)) : 0;
  const widthPct = Math.min(100, pct);
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className="text-slate-600">{label}</span>
        <span className="tabular-nums text-slate-700">
          {value.toLocaleString()}{suffix || ""}
          <span className="text-slate-400">/{target.toLocaleString()}{suffix || ""}</span>
        </span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${widthPct}%` }} />
      </div>
    </div>
  );
}

function MacroTile({ label, value, tone }: { label: string; value: string; tone: "teal" | "amber" | "rose" }) {
  const cls =
    tone === "teal" ? "bg-teal-50 border-teal-200 text-teal-900"
    : tone === "amber" ? "bg-amber-50 border-amber-200 text-amber-900"
    : "bg-rose-50 border-rose-200 text-rose-900";
  return (
    <div className={`rounded-2xl border p-3 text-center ${cls}`}>
      <div className="text-[10px] uppercase tracking-wide font-semibold opacity-80">{label}</div>
      <div className="text-lg font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

function SmallTile({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-2.5 text-center">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold flex items-center justify-center gap-1">
        {icon} {label}
      </div>
      <div className="text-sm font-semibold text-slate-900 tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

function MicroTile({ value, spec }: { value: number; spec: { goal: number; label: string; unit: string; upperLimit?: boolean } }) {
  const pct = spec.goal ? Math.min(150, Math.round((value / spec.goal) * 100)) : 0;
  // Upper-limit nutrients (like sodium) flip the color logic — staying under the goal is good.
  const tone = spec.upperLimit
    ? pct <= 100 ? "bg-emerald-500" : pct <= 150 ? "bg-amber-500" : "bg-rose-500"
    : pct >= 90 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-rose-500";
  const widthPct = Math.min(100, pct);
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{spec.label}</div>
        <div className="text-[10px] text-slate-500 tabular-nums">{pct}%</div>
      </div>
      <div className="text-sm font-semibold text-slate-900 tabular-nums mt-0.5">
        {value}{spec.unit}
        <span className="text-[10px] font-medium text-slate-400 ml-1">
          /{spec.goal}{spec.unit}
          {spec.upperLimit ? " max" : ""}
        </span>
      </div>
      <div className="mt-1 h-1 bg-slate-200 rounded-full overflow-hidden">
        <div className={`h-full ${tone}`} style={{ width: `${widthPct}%` }} />
      </div>
    </div>
  );
}

function RecentStrip({ slots, goalKcal }: { slots: Array<{ date: string; log: any }>; goalKcal: number }) {
  const ceiling = Math.max(goalKcal * 1.2, ...slots.map((s) => s.log?.kcal || 0));
  return (
    <div className="flex items-end gap-1.5 h-24">
      {slots.map((s) => {
        const kcal = s.log?.kcal ?? null;
        const heightPct = kcal == null ? 4 : Math.max(4, (kcal / ceiling) * 100);
        const dayLabel = new Date(s.date + "T00:00").toLocaleDateString(undefined, { weekday: "narrow" });
        const tone = kcal == null
          ? "bg-slate-200"
          : Math.abs(kcal / goalKcal - 1) < 0.1 ? "bg-emerald-500"
          : Math.abs(kcal / goalKcal - 1) < 0.25 ? "bg-amber-500" : "bg-rose-500";
        return (
          <div key={s.date} className="flex-1 flex flex-col items-center gap-1">
            <div className="text-[9px] text-slate-500 tabular-nums">{kcal == null ? "—" : kcal}</div>
            <div className="w-full bg-slate-100 rounded-t flex items-end" style={{ height: "calc(100% - 24px)" }}>
              <div className={`w-full ${tone} rounded-t`} style={{ height: `${heightPct}%` }} />
            </div>
            <div className="text-[9px] text-slate-500">{dayLabel}</div>
          </div>
        );
      })}
    </div>
  );
}
