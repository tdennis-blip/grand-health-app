// Compute per-domain 0-100 scores from real data for the patient Home hero.
//
// Domains we currently score:
//   · Diet:     today's logged kcal + protein vs the patient's targets.
//   · Sleep:    last night wearable — duration vs goal, efficiency, recovery.
//   · Training: assigned-vs-rest (boolean today); week adherence = % of
//               scheduled session days that have *some* wearable activity
//               signal. Best-effort until per-session completion logging
//               lands.
//
// Returns null for any domain we don't have data for. The overall is the
// simple mean of the domains that DO have a score — so a brand-new patient
// with only a diet plan still gets a number.
//
// All reads go through the patient's own Supabase session and rely on RLS
// for scoping (the helpers below already do that).
import { getUser } from "@/lib/auth/server";
import { getMyDietTargets, getRecentFoodLogs } from "@/lib/diet";
import { getActiveAssignment, getWeekSchedule, todayKey } from "@/lib/training";
import { getRecentMetrics, pickPrimary, type DailyMetricRow } from "@/lib/wearables/queries";
import type { DietTargets } from "@/lib/diet";

export type DomainScore = {
  /** 0-100, or null if we don't have data to score this domain today. */
  value: number | null;
  /** Short caption shown under the metric (e.g. "1,840 / 2,300 kcal"). */
  caption: string;
  /** Optional "did you do the thing" boolean for non-scored domains. */
  ok?: boolean;
};

export type TodayScore = {
  date: string; // YYYY-MM-DD (UTC)
  overall: number | null;
  diet: DomainScore;
  sleep: DomainScore;
  training: DomainScore;
  /** Last 7 days including today, oldest first; null for days with no data. */
  history: Array<{ date: string; value: number | null }>;
};

export async function getTodayScore(): Promise<TodayScore> {
  const user = await getUser();
  if (!user) {
    return emptyScore();
  }

  // Pull everything in parallel — none of these depend on each other.
  const [
    dietTargetsRes,
    foodLogs,
    wearableMetrics,
    assignment,
  ] = await Promise.all([
    getMyDietTargets(),
    getRecentFoodLogs(user.id, 7, user),
    getRecentMetrics(user.id, 7),
    getActiveAssignment(),
  ]);

  const weekSchedule = assignment ? await getWeekSchedule(assignment.programId) : [];
  const todaySession = weekSchedule.find((w) => w.day === todayKey());

  const todayUtc = isoDate(new Date());
  const todayLog = foodLogs.find((l) => l.logDate === todayUtc);
  const todayMetric = pickPrimary(wearableMetrics.filter((m) => m.metric_date === todayUtc));

  const diet = scoreDiet(todayLog, dietTargetsRes.targets);
  const sleep = scoreSleep(todayMetric, wearableMetrics);
  const training = scoreTraining(todaySession);

  // 7-day history: per-day overall score using whatever data we have.
  const history = buildHistory(foodLogs, wearableMetrics, dietTargetsRes.targets);

  const overall = average([diet.value, sleep.value, training.value]);

  return {
    date: todayUtc,
    overall,
    diet,
    sleep,
    training,
    history,
  };
}

// ---------------------------------------------------------------------------
// Per-domain scorers
// ---------------------------------------------------------------------------

function scoreDiet(
  log: { kcal: number | null; proteinG: number | null } | undefined,
  targets: DietTargets | null
): DomainScore {
  if (!targets || targets.goalKcal === 0) {
    return { value: null, caption: "Set up a diet plan to start scoring" };
  }
  if (!log) {
    return {
      value: 0,
      caption: `0 / ${targets.goalKcal.toLocaleString()} kcal · 0 / ${targets.proteinG}g protein`,
    };
  }
  const kcal = log.kcal ?? 0;
  const protein = log.proteinG ?? 0;
  // Adherence as ratio-toward-target, capped at 1.0 (over-eating doesn't go
  // negative here — the diet detail view handles surplus warnings).
  const kcalScore = clamp01(targets.goalKcal === 0 ? 0 : kcal / targets.goalKcal);
  const proteinScore = clamp01(targets.proteinG === 0 ? 0 : protein / targets.proteinG);
  const value = Math.round(((kcalScore + proteinScore) / 2) * 100);
  return {
    value,
    caption: `${kcal.toLocaleString()} / ${targets.goalKcal.toLocaleString()} kcal · ${protein} / ${targets.proteinG}g protein`,
  };
}

function scoreSleep(
  today: DailyMetricRow | null,
  recent: DailyMetricRow[]
): DomainScore {
  // Prefer the most recent night with actual sleep data (duration/score) so the
  // card isn't driven by a row that only has a partial signal. Today's row may
  // carry just a sleep score before duration/HRV finalize.
  const row =
    (today?.sleep_total_minutes != null || today?.sleep_score != null ? today : null) ??
    recent.find((r) => r.sleep_total_minutes != null || r.sleep_score != null) ??
    today ??
    recent[0] ??
    null;
  if (!row) {
    return { value: null, caption: "Connect a tracker to score sleep" };
  }
  const dur = row.sleep_total_minutes ?? null;
  const hrv = row.hrv_rmssd_ms != null ? Number(row.hrv_rmssd_ms) : null;
  const sleepScore = row.sleep_score != null ? Math.round(Number(row.sleep_score)) : null;

  // Headline value is Oura's nightly sleep score when available.
  if (sleepScore == null && dur == null) {
    return { value: null, caption: "Waiting on tonight's sync" };
  }
  const durLabel = dur != null ? `${Math.floor(dur / 60)}h ${dur % 60}m` : null;
  const captionBits = [
    sleepScore != null ? `Score ${sleepScore}` : null,
    durLabel ? `${durLabel} sleep` : null,
    hrv != null ? `${Math.round(hrv)}ms HRV` : null,
  ].filter(Boolean);
  // If no sleep score yet, fall back to duration-vs-8h as the numeric value.
  const value =
    sleepScore != null
      ? sleepScore
      : dur != null
      ? Math.round(clamp01(dur / (8 * 60)) * 100)
      : null;
  return { value, caption: captionBits.join(" · ") || "Last night" };
}

function scoreTraining(
  todaySession:
    | { sessions: { name: string; estMinutes: number }[]; day: string }
    | undefined
): DomainScore {
  // No completion tracking yet — we score boolean: scheduled vs rest. A
  // "rest day" counts as on-target (it's a deliberate part of the plan),
  // so it scores 100. A scheduled day with no completion logged gets a
  // neutral 50 to keep the overall mean honest.
  if (!todaySession) {
    return { value: null, caption: "No program assigned" };
  }
  const sessions = todaySession.sessions ?? [];
  if (sessions.length === 0) {
    return { value: 100, caption: "Rest day — recovery is part of the plan", ok: true };
  }
  if (sessions.length === 1) {
    return { value: 50, caption: `${sessions[0].name} · ~${sessions[0].estMinutes}m` };
  }
  const totalMin = sessions.reduce((sum, s) => sum + s.estMinutes, 0);
  return { value: 50, caption: `${sessions.length} sessions · ~${totalMin}m` };
}

// ---------------------------------------------------------------------------
// 7-day history
// ---------------------------------------------------------------------------

function buildHistory(
  foodLogs: Array<{ logDate: string; kcal: number | null; proteinG: number | null }>,
  metrics: DailyMetricRow[],
  targets: DietTargets | null
): Array<{ date: string; value: number | null }> {
  const days: Array<{ date: string; value: number | null }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const iso = isoDate(d);
    const dietScore = targets
      ? scoreDiet(foodLogs.find((l) => l.logDate === iso), targets).value
      : null;
    const sleepScore = scoreSleep(
      metrics.find((m) => m.metric_date === iso) ?? null,
      metrics.filter((m) => m.metric_date <= iso)
    ).value;
    const overall = average([dietScore, sleepScore]);
    days.push({ date: iso, value: overall });
  }
  return days;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyScore(): TodayScore {
  const today = isoDate(new Date());
  return {
    date: today,
    overall: null,
    diet: { value: null, caption: "Sign in to start scoring" },
    sleep: { value: null, caption: "Sign in to start scoring" },
    training: { value: null, caption: "Sign in to start scoring" },
    history: [],
  };
}

function isoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function average(values: Array<number | null>): number | null {
  const ns = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (ns.length === 0) return null;
  return Math.round(ns.reduce((a, b) => a + b, 0) / ns.length);
}

export function scoreColor(value: number | null): {
  ring: string;        // hex
  ringClass: string;   // tailwind text- for icon coloring
  badgeClass: string;  // tailwind bg+text+border for pill
} {
  if (value == null) {
    return {
      ring: "#94a3b8",
      ringClass: "text-slate-400",
      badgeClass: "bg-slate-50 text-slate-500 border-slate-200",
    };
  }
  if (value >= 85) {
    return {
      ring: "#059669",
      ringClass: "text-emerald-600",
      badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    };
  }
  if (value >= 67) {
    return {
      ring: "#0d9488",
      ringClass: "text-teal-600",
      badgeClass: "bg-teal-50 text-teal-700 border-teal-200",
    };
  }
  if (value >= 50) {
    return {
      ring: "#d97706",
      ringClass: "text-amber-600",
      badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
    };
  }
  return {
    ring: "#e11d48",
    ringClass: "text-rose-600",
    badgeClass: "bg-rose-50 text-rose-700 border-rose-200",
  };
}
