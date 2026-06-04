// Per-medication adherence over a configurable window. Used by the
// clinician adherence report page; complements the 7-day strip in
// `getAdherenceStrip`.

import { getUser } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import type { AuthUser } from "@/lib/auth/server";
import { isoDate } from "./medications-utils";

export type MedAdherenceWindow = 7 | 14 | 30 | 90;

export type PerMedAdherence = {
  medicationId: string;
  name: string;
  kind: "medication" | "supplement";
  dose: string | null;
  active: boolean;
  scheduled: number;            // total dose-instances scheduled in window
  taken: number;
  pct: number | null;           // null if scheduled === 0
  // Longest stretch of consecutive scheduled days with NO taken log.
  // Days that had no scheduled doses are skipped (don't break the streak).
  longestMissedStreak: number;
  // Per-day breakdown for heat-map rendering (newest day last).
  days: Array<{ date: string; scheduled: number; taken: number }>;
};

export type AdherenceReport = {
  windowDays: MedAdherenceWindow;
  fromDate: string;
  toDate: string;
  totalScheduled: number;
  totalTaken: number;
  overallPct: number | null;
  perMed: PerMedAdherence[];
};

export async function getAdherenceReport(
  patientId: string,
  windowDays: MedAdherenceWindow = 30,
  user?: AuthUser,
): Promise<AdherenceReport> {
  const resolvedUser = user ?? (await getUser());
  if (!resolvedUser) {
    return { windowDays, fromDate: "", toDate: "", totalScheduled: 0, totalTaken: 0, overallPct: null, perMed: [] };
  }

  const now = new Date();
  const since = new Date(now);
  since.setDate(now.getDate() - (windowDays - 1));
  const fromDate = isoDate(since);
  const toDate = isoDate(now);

  // Pull active meds + their doses + logs in the window.
  const [meds, doses, logs] = await Promise.all([
    withAuth(resolvedUser, (sql) =>
      sql`SELECT id, name, kind, dose, active FROM medications WHERE patient_id = ${patientId} ORDER BY name ASC`
    ),
    withAuth(resolvedUser, (sql) =>
      sql`SELECT id, medication_id, days_of_week, time_local FROM medication_doses WHERE patient_id = ${patientId}`
    ),
    withAuth(resolvedUser, (sql) =>
      sql`SELECT dose_id, medication_id, scheduled_for FROM medication_dose_logs WHERE patient_id = ${patientId} AND scheduled_for >= ${fromDate} AND scheduled_for <= ${toDate}`
    ),
  ]);

  const dosesByMed: Record<string, { id: string; daysOfWeek: number[] }[]> = {};
  for (const d of doses) {
    const list = dosesByMed[(d as any).medication_id] ?? (dosesByMed[(d as any).medication_id] = []);
    list.push({
      id: (d as any).id,
      daysOfWeek: ((d as any).days_of_week ?? []).map((n: any) => Number(n)),
    });
  }

  // takenSet keyed by `${medication_id}::${YYYY-MM-DD}::${dose_id|''}` so we
  // can count taken-per-(dose,day) precisely.
  const takenSet = new Set<string>();
  // Also build a count of taken per (med, day) for the day breakdown.
  const takenPerMedDay: Record<string, number> = {};
  for (const l of logs) {
    const k = `${(l as any).medication_id}::${(l as any).scheduled_for}::${(l as any).dose_id ?? ""}`;
    takenSet.add(k);
    const mk = `${(l as any).medication_id}::${(l as any).scheduled_for}`;
    takenPerMedDay[mk] = (takenPerMedDay[mk] ?? 0) + 1;
  }

  // Iterate the window day-by-day for each med.
  const perMed: PerMedAdherence[] = [];
  for (const m of meds) {
    const medDoses = dosesByMed[(m as any).id] ?? [];
    const days: PerMedAdherence["days"] = [];
    let scheduled = 0;
    let taken = 0;
    let currentMissedStreak = 0;
    let longestMissedStreak = 0;

    for (let i = windowDays - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = isoDate(d);
      const dow = d.getDay();

      const todayScheduledDoses = medDoses.filter((x) => x.daysOfWeek.includes(dow));
      const dayScheduled = todayScheduledDoses.length;
      let dayTaken = 0;
      for (const dose of todayScheduledDoses) {
        if (takenSet.has(`${(m as any).id}::${key}::${dose.id}`)) dayTaken++;
      }
      // Cap at scheduled — extra logs (rare; clinician marking on patient's
      // behalf twice) shouldn't push pct over 100.
      if (dayTaken > dayScheduled) dayTaken = dayScheduled;

      scheduled += dayScheduled;
      taken += dayTaken;
      days.push({ date: key, scheduled: dayScheduled, taken: dayTaken });

      if (dayScheduled > 0) {
        if (dayTaken === 0) {
          currentMissedStreak++;
          if (currentMissedStreak > longestMissedStreak) {
            longestMissedStreak = currentMissedStreak;
          }
        } else {
          currentMissedStreak = 0;
        }
      }
      // Days with nothing scheduled neither extend nor break the streak.
    }

    perMed.push({
      medicationId: (m as any).id,
      name: (m as any).name,
      kind: ((m as any).kind ?? "medication") as "medication" | "supplement",
      dose: (m as any).dose ?? null,
      active: !!(m as any).active,
      scheduled,
      taken,
      pct: scheduled === 0 ? null : Math.round((taken / scheduled) * 100),
      longestMissedStreak,
      days,
    });
  }

  const totalScheduled = perMed.reduce((s, x) => s + x.scheduled, 0);
  const totalTaken = perMed.reduce((s, x) => s + x.taken, 0);
  return {
    windowDays,
    fromDate,
    toDate,
    totalScheduled,
    totalTaken,
    overallPct: totalScheduled === 0 ? null : Math.round((totalTaken / totalScheduled) * 100),
    perMed,
  };
}
