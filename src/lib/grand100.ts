// Grand 100 math + data helpers. Server-only (uses Cognito auth + postgres-js).
import { getUser } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";

// Standard age-related decline, expressed as percentage-per-decade.
// trained = patient maintains regular Zone 2 + strength + mobility work.
// untrained = sedentary baseline. Conservative numbers most longevity
// clinicians use as planning defaults.
export const GRAND100_DECLINE = {
  vo2max:   { trained: 5,  untrained: 10 }, // %/decade
  strength: { trained: 8,  untrained: 15 }, // %/decade after age 40
  mobility: { trained: 4,  untrained: 12 }, // %/decade
} as const;

// Project a value forward N years given a percentage-per-decade decline.
export function projectDecline(currentValue: number, currentAge: number, targetAge: number, pctPerDecade: number): number {
  const decades = (targetAge - currentAge) / 10;
  return currentValue * Math.pow(1 - pctPerDecade / 100, decades);
}

// Inverse: given a target value at targetAge, what do you need at currentAge?
export function requiredToday(targetValue: number, currentAge: number, targetAge: number, pctPerDecade: number): number {
  const decades = (targetAge - currentAge) / 10;
  const factor = Math.pow(1 - pctPerDecade / 100, decades);
  if (factor <= 0) return targetValue;
  return targetValue / factor;
}

// Returns age in whole years from an ISO 'YYYY-MM-DD' DOB.
export function ageFromDob(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const d = new Date(dob + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

export type Grand100Activity = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  accent: string | null;
  tier: "essential" | "important" | "stretch";
  requiredVo2: number;
  requiredStrengthLb: number | null;
  requiredStrengthLevel: "low" | "moderate" | "high";
  requiredMobilityLevel: "low" | "moderate" | "high";
  sortOrder: number;
  // Effective target age for this patient (overridden by their own row if set).
  targetAge: number;
};

export type Grand100Baseline = {
  vo2Now: number | null;
  gripKg: number | null;
  squat1rmLb: number | null;
  strengthPercentile: number | null;
  mobilityPercentile: number | null;
  measuredOn: string | null;
};

export type Grand100Bundle = {
  ageNow: number | null;
  baseline: Grand100Baseline | null;
  activities: Grand100Activity[];
};

// Patient-side fetch: their DOB + baseline + clinic's full activity list + per-activity target ages.
export async function getMyGrand100(): Promise<Grand100Bundle> {
  const user = await getUser();
  if (!user) return { ageNow: null, baseline: null, activities: [] };

  const [[pp], [baseline], activities, targets] = await Promise.all([
    withAuth(user, (sql) =>
      sql`SELECT date_of_birth FROM patient_profiles WHERE profile_id = ${user.id} LIMIT 1`
    ),
    withAuth(user, (sql) =>
      sql`SELECT vo2_now, grip_kg, squat_1rm_lb, strength_percentile, mobility_percentile, measured_on FROM grand100_baselines WHERE patient_id = ${user.id} LIMIT 1`
    ),
    withAuth(user, (sql) =>
      sql`SELECT id, name, description, icon, accent, tier, required_vo2, required_strength_lb, required_strength_level, required_mobility_level, sort_order FROM grand100_activities WHERE hidden = false ORDER BY sort_order ASC`
    ),
    withAuth(user, (sql) =>
      sql`SELECT activity_id, target_age FROM grand100_patient_targets WHERE patient_id = ${user.id}`
    ),
  ]);

  const targetMap = new Map<string, number>(targets.map((t: any) => [t.activity_id, t.target_age]));

  return {
    ageNow: ageFromDob(pp?.date_of_birth ?? null),
    baseline: baseline
      ? {
          vo2Now: baseline.vo2_now,
          gripKg: baseline.grip_kg,
          squat1rmLb: baseline.squat_1rm_lb,
          strengthPercentile: baseline.strength_percentile,
          mobilityPercentile: baseline.mobility_percentile,
          measuredOn: baseline.measured_on,
        }
      : null,
    activities: activities.map((a: any) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      icon: a.icon,
      accent: a.accent,
      tier: a.tier,
      requiredVo2: a.required_vo2,
      requiredStrengthLb: a.required_strength_lb ?? null,
      requiredStrengthLevel: a.required_strength_level,
      requiredMobilityLevel: a.required_mobility_level,
      sortOrder: a.sort_order,
      targetAge: targetMap.get(a.id) ?? 100,
    })),
  };
}
