// Server-side helpers for the patient-facing diet view. Reads through
// the patient's authenticated Supabase session — RLS handles the scoping.

import { getUser } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import type { AuthUser } from "@/lib/auth/server";
import { getActiveKcalForDate } from "@/lib/activity-calories";

export type ActivityMode = "static" | "dynamic" | "threshold";

export type DietPlanRow = {
  rmrValue: number | null;
  rmrMethod: string | null;
  rmrMeasuredOn: string | null;
  rmrMeasuredBy: string | null;
  activityMultiplier: number;
  deficitKcal: number;
  proteinPerKg: number;
  carbsPct: number;
  fatPct: number;
  fiberG: number;
  mealsPerDay: number;
  waterL: number;
  notes: string | null;
  activityMode: ActivityMode;
  baseMultiplier: number;
  activityCreditPct: number;
};

// Optional per-day activity input for dynamic plans.
export type ActivityInput = {
  activeKcal: number;                       // raw active calories for the day
  source: "wearable" | "estimated" | "none";
  provider?: string | null;
};

export type DietTargets = {
  tdee: number;
  goalKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  waterL: number;
  mealsPerDay: number;
  notes: string | null;
  rmrValue: number | null;
  rmrMethod: string | null;
  activityMultiplier: number;
  deficitKcal: number;
  // Activity-aware fields
  activityMode: ActivityMode;
  baseKcal: number;            // resting/base portion of TDEE
  activeKcalRaw: number;       // measured/estimated active calories
  activeKcalCredited: number;  // portion actually added to the target
  activityCreditPct: number;
  activitySource: "wearable" | "estimated" | "none";
  activityProvider: string | null;
  // Threshold-mode only: activity the multiplier already assumes. Calories
  // burned above this get added on top; at or below it, no adjustment.
  activityThresholdKcal: number;
};

export function deriveTargets(
  plan: DietPlanRow,
  weightKg: number | null,
  activity?: ActivityInput | null
): DietTargets {
  const rmr = plan.rmrValue ?? 0;

  let baseKcal: number;
  let activeKcalRaw = 0;
  let activeKcalCredited = 0;
  let activityThresholdKcal = 0;
  let activitySource: "wearable" | "estimated" | "none" = "none";
  let activityProvider: string | null = null;

  if (plan.activityMode === "dynamic") {
    // Resting base from a near-sedentary multiplier, then add credited
    // activity calories so we don't double-count movement.
    baseKcal = Math.round(rmr * plan.baseMultiplier);
    activeKcalRaw = activity?.activeKcal ?? 0;
    activitySource = activity?.source ?? "none";
    activityProvider = activity?.provider ?? null;
    activeKcalCredited = Math.round(activeKcalRaw * (plan.activityCreditPct / 100));
  } else if (plan.activityMode === "threshold") {
    // Keep the normal multiplier-based goal as the floor. The activity that
    // multiplier already assumes (rmr * (multiplier - 1)) is the threshold;
    // only calories burned ABOVE it get added on top. At or below it, no
    // adjustment — so a light day never lowers the target.
    baseKcal = Math.round(rmr * plan.activityMultiplier);
    activityThresholdKcal = Math.max(0, Math.round(rmr * (plan.activityMultiplier - 1)));
    activeKcalRaw = activity?.activeKcal ?? 0;
    activitySource = activity?.source ?? "none";
    activityProvider = activity?.provider ?? null;
    activeKcalCredited = Math.max(0, activeKcalRaw - activityThresholdKcal);
  } else {
    // Static: legacy single-multiplier TDEE.
    baseKcal = Math.round(rmr * plan.activityMultiplier);
  }

  const tdee = baseKcal + activeKcalCredited;
  const goalKcal = tdee + plan.deficitKcal;
  const proteinG = weightKg ? Math.round(weightKg * plan.proteinPerKg) : 0;
  const carbsG = Math.round((goalKcal * (plan.carbsPct / 100)) / 4);
  const fatG = Math.round((goalKcal * (plan.fatPct / 100)) / 9);
  return {
    tdee,
    goalKcal,
    proteinG,
    carbsG,
    fatG,
    fiberG: plan.fiberG,
    waterL: plan.waterL,
    mealsPerDay: plan.mealsPerDay,
    notes: plan.notes,
    rmrValue: plan.rmrValue,
    rmrMethod: plan.rmrMethod,
    activityMultiplier: plan.activityMultiplier,
    deficitKcal: plan.deficitKcal,
    activityMode: plan.activityMode,
    baseKcal,
    activeKcalRaw,
    activeKcalCredited,
    activityCreditPct: plan.activityCreditPct,
    activitySource,
    activityProvider,
    activityThresholdKcal,
  };
}

export type FoodLogRow = {
  logDate: string;
  source: string;
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  notes: string | null;
};

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Last N days, inclusive of today, sorted oldest→newest. Returns one slot per
// day; days without a log get null.
export function buildDaySlots(rows: FoodLogRow[], days = 7): Array<{ date: string; log: FoodLogRow | null }> {
  const map: Record<string, FoodLogRow> = {};
  rows.forEach((r) => { map[r.logDate] = r; });
  const out: Array<{ date: string; log: FoodLogRow | null }> = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = isoDate(d);
    out.push({ date: key, log: map[key] ?? null });
  }
  return out;
}

export type DayEntry = {
  id: string;
  meal: "breakfast" | "lunch" | "dinner" | "snack";
  quantityG: number;
  notes: string | null;
  food: {
    id: string;
    name: string;
    brand: string | null;
    kcalPer100: number | null;
    proteinGPer100: number | null;
    carbsGPer100: number | null;
    fatGPer100: number | null;
    fiberGPer100: number | null;
    vitaminDIuPer100: number | null;
    vitaminB12UgPer100: number | null;
    ironMgPer100: number | null;
    magnesiumMgPer100: number | null;
    calciumMgPer100: number | null;
    potassiumMgPer100: number | null;
    sodiumMgPer100: number | null;
    omega3MgPer100: number | null;
  };
};

export type DayTotals = {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  vitaminDIu: number;
  vitaminB12Ug: number;
  ironMg: number;
  magnesiumMg: number;
  calciumMg: number;
  potassiumMg: number;
  sodiumMg: number;
  omega3Mg: number;
};

export function entryContribution(e: DayEntry): DayTotals {
  const f = (v: number | null) => (v == null ? 0 : (v * e.quantityG) / 100);
  return {
    kcal:        Math.round(f(e.food.kcalPer100)),
    proteinG:    Math.round(f(e.food.proteinGPer100)),
    carbsG:      Math.round(f(e.food.carbsGPer100)),
    fatG:        Math.round(f(e.food.fatGPer100)),
    fiberG:      Math.round(f(e.food.fiberGPer100)),
    vitaminDIu:  Math.round(f(e.food.vitaminDIuPer100)),
    vitaminB12Ug: round1(f(e.food.vitaminB12UgPer100)),
    ironMg:      round1(f(e.food.ironMgPer100)),
    magnesiumMg: Math.round(f(e.food.magnesiumMgPer100)),
    calciumMg:   Math.round(f(e.food.calciumMgPer100)),
    potassiumMg: Math.round(f(e.food.potassiumMgPer100)),
    sodiumMg:    Math.round(f(e.food.sodiumMgPer100)),
    omega3Mg:    Math.round(f(e.food.omega3MgPer100)),
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function sumTotals(entries: DayEntry[]): DayTotals {
  const acc: DayTotals = {
    kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0,
    vitaminDIu: 0, vitaminB12Ug: 0, ironMg: 0, magnesiumMg: 0,
    calciumMg: 0, potassiumMg: 0, sodiumMg: 0, omega3Mg: 0,
  };
  entries.forEach((e) => {
    const c = entryContribution(e);
    (Object.keys(acc) as (keyof DayTotals)[]).forEach((k) => {
      acc[k] += c[k];
    });
  });
  acc.vitaminB12Ug = round1(acc.vitaminB12Ug);
  acc.ironMg = round1(acc.ironMg);
  return acc;
}

export async function getDayEntries(user: AuthUser, logDate: string): Promise<DayEntry[]> {
  const patientId = user.id;
  const [logRows] = await withAuth(user, (sql) =>
    sql`SELECT id FROM food_logs WHERE patient_id = ${patientId} AND log_date = ${logDate} LIMIT 1`
  );
  if (!logRows) return [];

  const rows = await withAuth(user, (sql) =>
    sql`
      SELECT fle.id, fle.meal, fle.quantity_g, fle.notes,
             f.id AS food_id, f.name AS food_name, f.brand,
             f.kcal_per_100, f.protein_g_per_100, f.carbs_g_per_100, f.fat_g_per_100, f.fiber_g_per_100,
             f.vitamin_d_iu_per_100, f.vitamin_b12_ug_per_100, f.iron_mg_per_100, f.magnesium_mg_per_100,
             f.calcium_mg_per_100, f.potassium_mg_per_100, f.sodium_mg_per_100, f.omega3_mg_per_100
      FROM food_log_entries fle
      JOIN foods f ON f.id = fle.food_id
      WHERE fle.food_log_id = ${logRows.id}
      ORDER BY fle.created_at ASC
    `
  );

  return rows.map((r: any) => ({
    id: r.id,
    meal: r.meal,
    quantityG: Number(r.quantity_g),
    notes: r.notes,
    food: {
      id: r.food_id,
      name: r.food_name ?? "(unknown)",
      brand: r.brand ?? null,
      kcalPer100:        toNum(r.kcal_per_100),
      proteinGPer100:    toNum(r.protein_g_per_100),
      carbsGPer100:      toNum(r.carbs_g_per_100),
      fatGPer100:        toNum(r.fat_g_per_100),
      fiberGPer100:      toNum(r.fiber_g_per_100),
      vitaminDIuPer100:  toNum(r.vitamin_d_iu_per_100),
      vitaminB12UgPer100: toNum(r.vitamin_b12_ug_per_100),
      ironMgPer100:      toNum(r.iron_mg_per_100),
      magnesiumMgPer100: toNum(r.magnesium_mg_per_100),
      calciumMgPer100:   toNum(r.calcium_mg_per_100),
      potassiumMgPer100: toNum(r.potassium_mg_per_100),
      sodiumMgPer100:    toNum(r.sodium_mg_per_100),
      omega3MgPer100:    toNum(r.omega3_mg_per_100),
    },
  }));
}

function toNum(v: any): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------
// Quick-add: favorites + recent foods
// ---------------------------------------------------------------------

export type QuickFood = {
  foodId: string;
  name: string;
  brand: string | null;
  kcalPer100: number | null;
  proteinGPer100: number | null;
  carbsGPer100: number | null;
  fatGPer100: number | null;
  defaultQuantityG: number | null;
  defaultMeal: "breakfast" | "lunch" | "dinner" | "snack" | null;
  servingSizeG: number | null;
  servingLabel: string | null;
  isFavorite: boolean;
  lastUsedAt: string | null;
};

// Returns up to `limit` of the patient's favorites, newest first.
export async function getFavoriteFoods(user: AuthUser, limit = 12): Promise<QuickFood[]> {
  const patientId = user.id;
  const rows = await withAuth(user, (sql) =>
    sql`
      SELECT ff.id, ff.default_quantity_g, ff.default_meal, ff.updated_at,
             f.id AS food_id, f.name, f.brand,
             f.kcal_per_100, f.protein_g_per_100, f.carbs_g_per_100, f.fat_g_per_100,
             f.serving_size_g, f.serving_label
      FROM food_favorites ff
      JOIN foods f ON f.id = ff.food_id
      WHERE ff.patient_id = ${patientId}
      ORDER BY ff.updated_at DESC
      LIMIT ${limit}
    `
  );

  return rows.map((r: any) => ({
    foodId: r.food_id,
    name: r.name,
    brand: r.brand,
    kcalPer100: toNum(r.kcal_per_100),
    proteinGPer100: toNum(r.protein_g_per_100),
    carbsGPer100: toNum(r.carbs_g_per_100),
    fatGPer100: toNum(r.fat_g_per_100),
    defaultQuantityG: toNum(r.default_quantity_g),
    defaultMeal: r.default_meal,
    servingSizeG: toNum(r.serving_size_g),
    servingLabel: r.serving_label ?? null,
    isFavorite: true,
    lastUsedAt: r.updated_at,
  }));
}

// Recently used foods (distinct by food_id), most recent first. Excludes
// favorites so the strip stays useful — favorites get their own row.
export async function getRecentFoods(user: AuthUser, limit = 12): Promise<QuickFood[]> {
  const patientId = user.id;
  const since = new Date();
  since.setDate(since.getDate() - 60);
  const sinceIso = isoDate(since);

  const entries = await withAuth(user, (sql) =>
    sql`
      SELECT fle.id, fle.meal, fle.quantity_g, fle.created_at, fle.food_id,
             f.name, f.brand, f.kcal_per_100, f.protein_g_per_100, f.carbs_g_per_100, f.fat_g_per_100,
             f.serving_size_g, f.serving_label
      FROM food_log_entries fle
      JOIN food_logs fl ON fl.id = fle.food_log_id
      JOIN foods f ON f.id = fle.food_id
      WHERE fl.patient_id = ${patientId} AND fl.log_date >= ${sinceIso}
      ORDER BY fle.created_at DESC
      LIMIT 200
    `
  );

  const favRows = await withAuth(user, (sql) =>
    sql`SELECT food_id FROM food_favorites WHERE patient_id = ${patientId}`
  );
  const favIds = new Set(favRows.map((r: any) => r.food_id as string));

  const seen = new Set<string>();
  const out: QuickFood[] = [];
  for (const r of entries) {
    if (seen.has(r.food_id)) continue;
    if (favIds.has(r.food_id)) continue;
    seen.add(r.food_id);
    out.push({
      foodId: r.food_id,
      name: r.name,
      brand: r.brand,
      kcalPer100: toNum(r.kcal_per_100),
      proteinGPer100: toNum(r.protein_g_per_100),
      carbsGPer100: toNum(r.carbs_g_per_100),
      fatGPer100: toNum(r.fat_g_per_100),
      defaultQuantityG: toNum(r.quantity_g),
      defaultMeal: r.meal,
      servingSizeG: toNum(r.serving_size_g),
      servingLabel: r.serving_label ?? null,
      isFavorite: false,
      lastUsedAt: r.created_at,
    });
    if (out.length >= limit) break;
  }
  return out;
}

// Reference daily intake values for clinically meaningful micronutrients.
// Adults, general population. Could be made per-patient later.
export const MICRO_REFS = {
  vitaminDIu:   { goal: 800,  label: "Vitamin D",  unit: "IU" },
  vitaminB12Ug: { goal: 2.4,  label: "Vitamin B12", unit: "µg" },
  ironMg:       { goal: 18,   label: "Iron",        unit: "mg" },
  magnesiumMg:  { goal: 400,  label: "Magnesium",   unit: "mg" },
  calciumMg:    { goal: 1000, label: "Calcium",     unit: "mg" },
  potassiumMg:  { goal: 4700, label: "Potassium",   unit: "mg" },
  sodiumMg:     { goal: 2300, label: "Sodium",      unit: "mg", upperLimit: true },
  omega3Mg:     { goal: 1100, label: "Omega-3",     unit: "mg" },
} as const;

export async function getRecentFoodLogs(patientId: string, days = 14, user?: AuthUser): Promise<FoodLogRow[]> {
  const resolvedUser = user ?? (await getUser());
  if (!resolvedUser) return [];
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  const sinceIso = isoDate(since);
  const rows = await withAuth(resolvedUser, (sql) =>
    sql`
      SELECT log_date::text AS log_date, source, kcal, protein_g, carbs_g, fat_g, fiber_g, notes
      FROM food_logs
      WHERE patient_id = ${patientId} AND log_date >= ${sinceIso}
      ORDER BY log_date DESC
    `
  );
  return rows.map((r: any) => ({
    logDate: r.log_date,
    source: r.source,
    kcal: r.kcal,
    proteinG: r.protein_g,
    carbsG: r.carbs_g,
    fatG: r.fat_g,
    fiberG: r.fiber_g,
    notes: r.notes,
  }));
}

export async function getMyDietTargets(): Promise<{
  targets: DietTargets | null;
  weightKg: number | null;
}> {
  const user = await getUser();
  if (!user) return { targets: null, weightKg: null };

  const [[profile], [plan]] = await Promise.all([
    withAuth(user, (sql) =>
      sql`SELECT weight_kg FROM patient_profiles WHERE profile_id = ${user.id} LIMIT 1`
    ),
    withAuth(user, (sql) =>
      sql`SELECT * FROM diet_plans WHERE patient_id = ${user.id} LIMIT 1`
    ),
  ]);

  const weightKg = profile?.weight_kg ?? null;
  if (!plan) return { targets: null, weightKg };

  const planRow: DietPlanRow = {
    rmrValue: plan.rmr_value,
    rmrMethod: plan.rmr_method,
    rmrMeasuredOn: plan.rmr_measured_on,
    rmrMeasuredBy: plan.rmr_measured_by,
    activityMultiplier: Number(plan.activity_multiplier),
    deficitKcal: plan.deficit_kcal,
    proteinPerKg: Number(plan.protein_per_kg),
    carbsPct: plan.carbs_pct,
    fatPct: plan.fat_pct,
    fiberG: plan.fiber_g,
    mealsPerDay: plan.meals_per_day,
    waterL: Number(plan.water_l),
    notes: plan.notes,
    activityMode: ((plan.activity_mode === "dynamic" || plan.activity_mode === "threshold")
      ? plan.activity_mode
      : "static") as ActivityMode,
    baseMultiplier: Number(plan.base_multiplier ?? 1.2),
    activityCreditPct: Number(plan.activity_credit_pct ?? 50),
  };

  // Only spend a query on activity when the plan actually uses it.
  let activity: ActivityInput | null = null;
  if (planRow.activityMode === "dynamic" || planRow.activityMode === "threshold") {
    const res = await getActiveKcalForDate(user, isoDate(new Date()), weightKg);
    activity = { activeKcal: res.kcal, source: res.source, provider: res.provider };
  }

  return { targets: deriveTargets(planRow, weightKg, activity), weightKg };
}
