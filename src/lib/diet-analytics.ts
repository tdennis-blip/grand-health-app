// Clinician-side: compare what we EXPECTED a patient to burn (their diet base
// from RMR × near-sedentary multiplier, plus the activity they planned that day)
// against what their tracker MEASURED. Lets a provider see how reliably a
// patient hits the expenditure the plan assumes — only meaningful when they wear
// a tracker.

import { withAuth } from "@/lib/db/connection";
import type { AuthUser } from "@/lib/auth/server";
import { isoDate } from "@/lib/diet";

export type BurnComparisonDay = {
  date: string;
  plannedKcal: number;        // stated-intent active kcal for the day
  expectedTotal: number;      // base + plannedKcal
  measuredTotal: number | null;   // wearable total_kcal
  measuredActive: number | null;  // wearable active_kcal (Oura; null for Whoop)
  provider: string | null;
};

export type BurnComparison = {
  baseKcal: number;           // RMR × base multiplier (resting + daily living)
  days: BurnComparisonDay[];  // oldest → newest
  daysWithTracker: number;
  daysMet: number;            // measuredTotal >= expectedTotal
  hitRatePct: number | null;  // over tracker days
  avgExpected: number | null;
  avgMeasured: number | null;
};

type PlanFields = { rmrValue: number | null; baseMultiplier: number };

export async function getBurnComparison(
  user: AuthUser,
  patientId: string,
  plan: PlanFields,
  days = 21
): Promise<BurnComparison | null> {
  if (!plan.rmrValue || plan.rmrValue <= 0) return null;
  const baseKcal = Math.round(plan.rmrValue * plan.baseMultiplier);

  // Window of dates, oldest → newest, inclusive of today.
  const dates: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    dates.push(isoDate(d));
  }
  const start = dates[0];

  const [intentRows, wearRows] = await Promise.all([
    withAuth(user, (sql) =>
      sql`
        SELECT intent_date::text AS date, COALESCE(SUM(expected_kcal), 0) AS planned
        FROM daily_activity_intents
        WHERE patient_id = ${patientId}
          AND intent_date >= ${start}
          AND status <> 'declined'
        GROUP BY intent_date
      `
    ),
    withAuth(user, (sql) =>
      sql`
        SELECT metric_date::text AS date, provider, active_kcal, total_kcal
        FROM wearable_daily_metrics
        WHERE patient_id = ${patientId}
          AND metric_date >= ${start}
          AND total_kcal IS NOT NULL
        ORDER BY total_kcal DESC
      `
    ),
  ]);

  const plannedByDate = new Map<string, number>();
  (intentRows as any[]).forEach((r) => plannedByDate.set(r.date, Number(r.planned) || 0));

  // If multiple providers on a day, keep the largest total (rows are sorted desc).
  const wearByDate = new Map<string, { active: number | null; total: number; provider: string | null }>();
  (wearRows as any[]).forEach((r) => {
    if (!wearByDate.has(r.date)) {
      wearByDate.set(r.date, {
        active: r.active_kcal == null ? null : Number(r.active_kcal),
        total: Number(r.total_kcal),
        provider: r.provider ?? null,
      });
    }
  });

  const out: BurnComparisonDay[] = dates.map((date) => {
    const planned = plannedByDate.get(date) ?? 0;
    const wear = wearByDate.get(date) ?? null;
    return {
      date,
      plannedKcal: planned,
      expectedTotal: baseKcal + planned,
      measuredTotal: wear ? wear.total : null,
      measuredActive: wear ? wear.active : null,
      provider: wear ? wear.provider : null,
    };
  });

  const trackerDays = out.filter((d) => d.measuredTotal != null);
  const daysMet = trackerDays.filter((d) => (d.measuredTotal as number) >= d.expectedTotal).length;
  const avgExpected = trackerDays.length
    ? Math.round(trackerDays.reduce((s, d) => s + d.expectedTotal, 0) / trackerDays.length)
    : null;
  const avgMeasured = trackerDays.length
    ? Math.round(trackerDays.reduce((s, d) => s + (d.measuredTotal as number), 0) / trackerDays.length)
    : null;

  return {
    baseKcal,
    days: out,
    daysWithTracker: trackerDays.length,
    daysMet,
    hitRatePct: trackerDays.length ? Math.round((daysMet / trackerDays.length) * 100) : null,
    avgExpected,
    avgMeasured,
  };
}
