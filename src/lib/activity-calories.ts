// Estimates a patient's "active calories" for a given day, used by the diet
// engine when a plan is in dynamic mode (see lib/diet.ts deriveTargets).
//
// Source priority:
//   1. Wearable — wearable_daily_metrics.active_kcal for the day (Oura/Whoop).
//   2. MET estimate — from the sessions scheduled for that weekday in the
//      patient's active program. kcal = MET * bodyweight(kg) * minutes / 60.
//
// MET fallback uses session_library.met when set, else a per-kind default.
// It is intentionally simple (one MET per session, based on est_minutes) so
// clinicians don't have to tag every exercise.

import { getUser } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import type { AuthUser } from "@/lib/auth/server";
import { todayKey, type DayKey, DAY_KEYS } from "@/lib/training";

export type SessionKind = "strength" | "zone2" | "vo2max" | "mobility";

// Approximate metabolic equivalents by session kind. ~1 MET = 1 kcal/kg/hour.
export const MET_BY_KIND: Record<SessionKind, number> = {
  strength: 5.0, // vigorous resistance training
  zone2: 6.5,    // steady aerobic
  vo2max: 8.5,   // intervals / HIIT
  mobility: 2.8, // stretching / light movement
};

export function metForSession(kind: SessionKind, met: number | null): number {
  if (met != null && Number.isFinite(met) && met > 0) return met;
  return MET_BY_KIND[kind] ?? 4.0;
}

// kcal burned ≈ MET × bodyweight(kg) × hours.
export function kcalFromMet(metValue: number, weightKg: number, minutes: number): number {
  if (!weightKg || weightKg <= 0 || !minutes || minutes <= 0) return 0;
  return Math.round(metValue * weightKg * (minutes / 60));
}

export type ActiveKcalSource = "wearable" | "estimated" | "none";

export type ActiveKcalResult = {
  kcal: number;
  source: ActiveKcalSource;
  provider?: string | null; // wearable provider when source === 'wearable'
};

// JS getDay() (0=Sun..6=Sat) → our Mon-first DayKey, for an arbitrary date.
function dayKeyForIso(iso: string): DayKey {
  const d = new Date(`${iso}T00:00:00`).getDay();
  return d === 0 ? "sun" : (DAY_KEYS[d - 1] as DayKey);
}

// Estimate active calories for the day from the patient's scheduled sessions.
async function estimateFromSchedule(
  user: AuthUser,
  dayKey: DayKey,
  weightKg: number | null
): Promise<number> {
  if (!weightKg || weightKg <= 0) return 0;

  // Sessions scheduled for this weekday in the patient's active program.
  // RLS scopes program_days/session_library to assigned programs.
  const rows = await withAuth(user, (sql) =>
    sql`
      SELECT s.kind, s.est_minutes, s.met
      FROM program_assignments pa
      JOIN program_days pd ON pd.program_id = pa.program_id
      JOIN session_library s ON s.id = pd.session_id
      WHERE pa.patient_id = ${user.id}
        AND pa.ended_at IS NULL
        AND pd.day = ${dayKey}
    `
  );

  let total = 0;
  for (const r of rows as any[]) {
    const kind = r.kind as SessionKind;
    const minutes = Number(r.est_minutes) || 0;
    const met = metForSession(kind, r.met == null ? null : Number(r.met));
    total += kcalFromMet(met, weightKg, minutes);
  }
  return total;
}

// Resolve active calories for a date. Wearable first, then MET estimate.
export async function getActiveKcalForDate(
  user: AuthUser,
  dateIso: string,
  weightKg: number | null
): Promise<ActiveKcalResult> {
  // 1. Wearable active calories for the day (prefer the largest if multiple
  //    providers are connected — most complete picture of movement).
  const [wear] = await withAuth(user, (sql) =>
    sql`
      SELECT provider, active_kcal
      FROM wearable_daily_metrics
      WHERE patient_id = ${user.id}
        AND metric_date = ${dateIso}
        AND active_kcal IS NOT NULL
      ORDER BY active_kcal DESC
      LIMIT 1
    `
  );
  if (wear && wear.active_kcal != null) {
    return { kcal: Number(wear.active_kcal), source: "wearable", provider: wear.provider };
  }

  // 2. MET estimate from the day's schedule.
  const dayKey = dateIso === isoToday() ? todayKey() : dayKeyForIso(dateIso);
  const est = await estimateFromSchedule(user, dayKey, weightKg);
  if (est > 0) return { kcal: est, source: "estimated" };

  return { kcal: 0, source: "none" };
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

// Convenience wrapper using the current authed user.
export async function getMyActiveKcalForDate(
  dateIso: string,
  weightKg: number | null
): Promise<ActiveKcalResult> {
  const user = await getUser();
  if (!user) return { kcal: 0, source: "none" };
  return getActiveKcalForDate(user, dateIso, weightKg);
}
