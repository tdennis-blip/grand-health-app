// Client-safe helpers and shared types for the medications/supplements stack.
//
// This file deliberately does NOT import from `@/lib/supabase/server` or any
// other server-only module. Client components can import from here directly.
// The data-fetching counterpart lives in `./medications` and pulls from
// supabase via the server client.

export type MedicationKind = "medication" | "supplement";

export type Medication = {
  id: string;
  patientId: string;
  clinicId: string;
  kind: MedicationKind;
  name: string;
  dose: string | null;
  form: string | null;
  instructions: string | null;
  notes: string | null;
  pillarId: string | null;
  pillarName: string | null;
  startDate: string | null;
  endDate: string | null;
  active: boolean;
  sortOrder: number;
  // Refill tracking (0017). All numerics come back as strings from supabase-js;
  // the fetchers coerce them to numbers before returning.
  quantityOnHand: number | null;
  quantityPerDose: number | null;
  refillThresholdDays: number | null;
  lastRefillOn: string | null;
  // With food flag (0022).
  withFood: boolean | null;
  // Nutrient content per dose (0018). Supplements only; null for medications.
  vitaminDIu: number | null;
  vitaminB12Ug: number | null;
  ironMg: number | null;
  magnesiumMg: number | null;
  calciumMg: number | null;
  potassiumMg: number | null;
  sodiumMg: number | null;
  dhaMg: number | null;
  epaMg: number | null;
  creatineMg: number | null;
  coq10Mg: number | null;
  fiberG: number | null;
};

export type ScheduledDose = {
  id: string;
  medicationId: string;
  timeLocal: string;          // "HH:MM:SS"
  label: string | null;
  withFood: boolean | null;
  daysOfWeek: number[];       // 0..6, Sun..Sat
  amountOverride: string | null;
  sortOrder: number;
};

export type StackItem = Medication & {
  doses: ScheduledDose[];
};

export type TodayDose = {
  doseId: string;
  medicationId: string;
  name: string;
  kind: MedicationKind;
  dose: string | null;
  timeLocal: string;
  label: string | null;
  withFood: boolean | null;
  amountOverride: string | null;
  taken: boolean;
  takenAt: string | null;
  logId: string | null;
};

export type AdherenceDay = {
  date: string;
  scheduled: number;
  taken: number;
};

// ---------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// JS getDay() returns 0..6 with Sunday=0, matching our schema.
export function dowOf(d: Date): number {
  return d.getDay();
}

// ---------------------------------------------------------------------
// Time + day-of-week formatting
// ---------------------------------------------------------------------

// "07:00:00" → "7:00 AM"
export function formatTime12(timeLocal: string): string {
  const [hStr, mStr] = timeLocal.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

// "07:00 AM" / "7am" / "7:30" → "HH:MM:00"
export function parseTime24(input: string): string | null {
  const s = input.trim().toLowerCase();
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const ampm = m[3];
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  if (h > 23) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`;
}

const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// "[0..6]" → "Daily", "[1..5]" → "Mon–Fri", arbitrary → "Mon Wed Fri"
export function formatDaysOfWeek(days: number[]): string {
  const set = new Set(days);
  if (set.size === 7) return "Daily";
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return "Weekdays";
  if (set.size === 2 && set.has(0) && set.has(6)) return "Weekends";
  return [0, 1, 2, 3, 4, 5, 6]
    .filter((d) => set.has(d))
    .map((d) => DOW_SHORT[d])
    .join(" ");
}

// ---------------------------------------------------------------------
// Refill math
// ---------------------------------------------------------------------

// Average units consumed per day across the week, given a per-day mask of
// scheduled doses. Honors days_of_week so a Sunday-only rapamycin doesn't
// look like a daily med for refill purposes.
export function dailyConsumption(item: StackItem): number {
  if (!item.active) return 0;
  const perDose = item.quantityPerDose ?? 1;
  let unitsPerWeek = 0;
  for (const d of item.doses) {
    unitsPerWeek += (d.daysOfWeek?.length ?? 0) * perDose;
  }
  return unitsPerWeek / 7;
}

export type RefillStatus = {
  daysRemaining: number | null;
  state: "ok" | "low" | "out" | "unknown";
};

export function refillStatus(item: StackItem): RefillStatus {
  const qty = item.quantityOnHand;
  if (qty == null) return { daysRemaining: null, state: "unknown" };
  const perDay = dailyConsumption(item);
  if (perDay <= 0) return { daysRemaining: null, state: "unknown" };
  const days = qty / perDay;
  const threshold = item.refillThresholdDays ?? 7;
  let state: RefillStatus["state"] = "ok";
  if (days <= 0) state = "out";
  else if (days <= threshold) state = "low";
  return { daysRemaining: Math.floor(days), state };
}
