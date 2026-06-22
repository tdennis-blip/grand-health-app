// Read-side helpers — used by patient + clinician pages.
// Uses serviceRoleSql with explicit patient_id filter — callers are always
// authenticated server components; the explicit WHERE is the access control.
import { serviceRoleSql } from "@/lib/db/connection";
import type { WearableProvider } from "./types";

export type DailyMetricRow = {
  metric_date: string;
  provider: WearableProvider;
  sleep_total_minutes: number | null;
  sleep_efficiency_pct: number | null;
  sleep_score: number | null;
  hrv_rmssd_ms: number | null;
  resting_hr_bpm: number | null;
  recovery_score: number | null;
  readiness_score: number | null;
  strain_score: number | null;
  activity_score: number | null;
  active_kcal: number | null;
  bedtime_start: string | null;
  bedtime_end: string | null;
};

/** Most recent N days of metrics for a patient. */
export async function getRecentMetrics(
  patientId: string,
  days: number = 30
): Promise<DailyMetricRow[]> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  const sinceIso = since.toISOString().slice(0, 10);

  const rows = await serviceRoleSql<DailyMetricRow[]>`
    SELECT metric_date, provider,
           sleep_total_minutes, sleep_efficiency_pct, sleep_score,
           hrv_rmssd_ms, resting_hr_bpm, recovery_score,
           readiness_score, strain_score, activity_score,
           active_kcal, bedtime_start, bedtime_end
    FROM wearable_daily_metrics
    WHERE patient_id = ${patientId}
      AND metric_date >= ${sinceIso}
    ORDER BY metric_date DESC
  `;
  return rows;
}

/** Latest metric per provider for a patient, prefer most recent overall. */
export async function getLatestMetric(
  patientId: string
): Promise<DailyMetricRow | null> {
  const [row] = await serviceRoleSql<DailyMetricRow[]>`
    SELECT metric_date, provider,
           sleep_total_minutes, sleep_efficiency_pct, sleep_score,
           hrv_rmssd_ms, resting_hr_bpm, recovery_score,
           readiness_score, strain_score, activity_score,
           active_kcal, bedtime_start, bedtime_end
    FROM wearable_daily_metrics
    WHERE patient_id = ${patientId}
    ORDER BY metric_date DESC
    LIMIT 1
  `;
  return row ?? null;
}

/**
 * Today's device-measured active calories (movement/exercise burn), if any
 * connected wearable reported them. Used by the Today page's "Calories burned"
 * card — returns null when no device measured it.
 */
export async function getActiveKcalToday(
  patientId: string
): Promise<{ kcal: number; provider: WearableProvider } | null> {
  const todayIso = isoDate(new Date());
  const [row] = await serviceRoleSql<Array<{ active_kcal: number; provider: WearableProvider }>>`
    SELECT active_kcal, provider
    FROM wearable_daily_metrics
    WHERE patient_id = ${patientId}
      AND metric_date = ${todayIso}
      AND active_kcal IS NOT NULL
    ORDER BY active_kcal DESC
    LIMIT 1
  `;
  return row ? { kcal: Number(row.active_kcal), provider: row.provider } : null;
}

/** Has the patient connected anything? */
export async function hasAnyConnection(patientId: string): Promise<boolean> {
  const { serviceRoleSql } = await import("@/lib/db/connection");
  const rows = await serviceRoleSql<[{ n: string }]>`
    SELECT count(*)::text AS n
    FROM wearable_connections
    WHERE patient_id = ${patientId}
      AND status = 'active'
  `;
  return parseInt(rows[0]?.n ?? "0", 10) > 0;
}

// ---------------------------------------------------------------------------
// Formatting helpers shared by the cards.
// ---------------------------------------------------------------------------

// Format a wearable bedtime/wake ISO string (with embedded UTC offset) into a
// local clock time like "11:14 PM" — reading the HH:MM directly off the string
// so we show the device's local time, not the server's timezone.
export function formatClockTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = iso.match(/T(\d{2}):(\d{2})/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${min} ${ampm}`;
}

export function formatSleepDuration(minutes: number | null | undefined): string | null {
  if (minutes == null || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

export function pickPrimary(rows: DailyMetricRow[]): DailyMetricRow | null {
  if (rows.length === 0) return null;
  // Prefer the row with the most signal filled in (rough — count non-null
  // fields that matter for the Today card).
  const score = (r: DailyMetricRow) =>
    [r.sleep_total_minutes, r.hrv_rmssd_ms, r.recovery_score, r.readiness_score].filter(
      (v) => v != null
    ).length;
  return rows.slice().sort((a, b) => score(b) - score(a))[0];
}

// ---------------------------------------------------------------------------
// Sleep-focused aggregates — used by the patient /home/sleep dashboard.
// ---------------------------------------------------------------------------

export type SleepNight = {
  date: string;
  durationMin: number | null;
  efficiencyPct: number | null;
  sleepScore: number | null;
  hrvMs: number | null;
  restingHrBpm: number | null;
  recoveryScore: number | null;
  bedtimeStart: string | null;
  bedtimeEnd: string | null;
  provider: WearableProvider | null;
};

export type SleepSummary = {
  windowDays: number;
  nightsWithData: number;
  avgDurationMin: number | null;
  avgEfficiencyPct: number | null;
  avgSleepScore: number | null;
  avgHrvMs: number | null;
  avgRestingHrBpm: number | null;
  avgRecoveryScore: number | null;
  nightsMeetingDurationGoal: number; // count of nights where dur >= 7h
  durationGoalMinutes: number;
  /** Last 7 days ascending. */
  shortTrend: SleepNight[];
  /** Last 30 days ascending. */
  longTrend: SleepNight[];
  /** Most recent night with any sleep signal. */
  last: SleepNight | null;
};

const DURATION_GOAL_MIN = 7 * 60;

/**
 * Build a sleep-focused view of the last N days. Returns nights with no
 * signal too (durationMin etc null) so the chart x-axis stays even.
 */
export async function getSleepSummary(
  patientId: string,
  days: number = 30
): Promise<SleepSummary> {
  const rows = await getRecentMetrics(patientId, days);

  // Index by date, picking the row with most signal per date (a patient may
  // run both Oura and Whoop simultaneously).
  const byDate = new Map<string, DailyMetricRow>();
  for (const r of rows) {
    const existing = byDate.get(r.metric_date);
    if (!existing) {
      byDate.set(r.metric_date, r);
      continue;
    }
    const sig = (x: DailyMetricRow) =>
      [x.sleep_total_minutes, x.sleep_efficiency_pct, x.hrv_rmssd_ms, x.recovery_score].filter(
        (v) => v != null
      ).length;
    if (sig(r) > sig(existing)) byDate.set(r.metric_date, r);
  }

  // Walk the day window ascending, fill gaps.
  const todayIso = isoDate(new Date());
  const allNights: SleepNight[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const iso = isoDate(d);
    const r = byDate.get(iso);
    allNights.push({
      date: iso,
      durationMin: r?.sleep_total_minutes ?? null,
      efficiencyPct: r?.sleep_efficiency_pct != null ? Number(r.sleep_efficiency_pct) : null,
      sleepScore: r?.sleep_score ?? null,
      hrvMs: r?.hrv_rmssd_ms != null ? Number(r.hrv_rmssd_ms) : null,
      restingHrBpm: r?.resting_hr_bpm != null ? Number(r.resting_hr_bpm) : null,
      recoveryScore: r?.recovery_score ?? r?.readiness_score ?? null,
      bedtimeStart: r?.bedtime_start ?? null,
      bedtimeEnd: r?.bedtime_end ?? null,
      provider: (r?.provider as WearableProvider | undefined) ?? null,
    });
  }

  const longTrend = allNights;
  const shortTrend = allNights.slice(-7);

  const last = [...allNights]
    .reverse()
    .find(
      (n) =>
        n.durationMin != null ||
        n.efficiencyPct != null ||
        n.hrvMs != null ||
        n.recoveryScore != null
    ) ?? null;

  const meanOf = (vals: Array<number | null>): number | null => {
    const ns = vals.filter((v): v is number => v != null && Number.isFinite(v));
    if (ns.length === 0) return null;
    return ns.reduce((a, b) => a + b, 0) / ns.length;
  };

  const nightsWithData = allNights.filter(
    (n) =>
      n.durationMin != null ||
      n.efficiencyPct != null ||
      n.hrvMs != null ||
      n.recoveryScore != null
  ).length;

  const nightsMeetingDurationGoal = allNights.filter(
    (n) => n.durationMin != null && n.durationMin >= DURATION_GOAL_MIN
  ).length;

  // Quiet referenced variable so the linter doesn't yell.
  void todayIso;

  return {
    windowDays: days,
    nightsWithData,
    avgDurationMin: meanOf(allNights.map((n) => n.durationMin)),
    avgEfficiencyPct: meanOf(allNights.map((n) => n.efficiencyPct)),
    avgSleepScore: meanOf(allNights.map((n) => n.sleepScore)),
    avgHrvMs: meanOf(allNights.map((n) => n.hrvMs)),
    avgRestingHrBpm: meanOf(allNights.map((n) => n.restingHrBpm)),
    avgRecoveryScore: meanOf(allNights.map((n) => n.recoveryScore)),
    nightsMeetingDurationGoal,
    durationGoalMinutes: DURATION_GOAL_MIN,
    shortTrend,
    longTrend,
    last,
  };
}

function isoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function prettyProvider(p: WearableProvider | null): string {
  if (!p) return "";
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
