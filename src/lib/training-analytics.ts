// Clinician-side training progress analytics for a patient.
//   · Weekly zone 2 + VO2 max minutes (from cardio_session_logs).
//   · Per-exercise estimated 1RM over time (from exercise_set_logs), using the
//     Epley formula: 1RM = weight × (1 + reps/30), taking the best set per
//     exercise per session date.
//
// Reads go through withAuth(clinician) — RLS lets a clinic clinician read their
// patients' logs.
import { withAuth } from "@/lib/db/connection";
import type { AuthUser } from "@/lib/auth/server";

export type CardioWeek = { weekStart: string; zone2Min: number; vo2maxMin: number };

// Monday-anchored week start (YYYY-MM-DD) for a given date.
function weekStartOf(d: Date): string {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = dt.getUTCDay(); // 0=Sun..6=Sat
  const diff = dow === 0 ? 6 : dow - 1; // back to Monday
  dt.setUTCDate(dt.getUTCDate() - diff);
  return dt.toISOString().slice(0, 10);
}

export async function getWeeklyCardioMinutes(
  user: AuthUser,
  patientId: string,
  weeks = 12
): Promise<CardioWeek[]> {
  const rows = await withAuth(user, (sql) =>
    sql`
      SELECT to_char(date_trunc('week', csl.log_date), 'YYYY-MM-DD') AS week_start,
             s.kind AS kind,
             sum(coalesce(csl.actual_minutes, 0))::int AS minutes
      FROM cardio_session_logs csl
      JOIN session_library s ON s.id = csl.session_id
      WHERE csl.patient_id = ${patientId}
        AND csl.done = true
        AND s.kind IN ('zone2', 'vo2max')
        AND csl.log_date >= (current_date - ${weeks * 7})
      GROUP BY 1, 2
    `
  );

  const byWeek = new Map<string, { zone2Min: number; vo2maxMin: number }>();
  for (const r of rows as any[]) {
    const w = byWeek.get(r.week_start) ?? { zone2Min: 0, vo2maxMin: 0 };
    if (r.kind === "zone2") w.zone2Min += Number(r.minutes) || 0;
    else if (r.kind === "vo2max") w.vo2maxMin += Number(r.minutes) || 0;
    byWeek.set(r.week_start, w);
  }

  // Emit a continuous run of the last `weeks` Mondays, oldest → newest.
  const out: CardioWeek[] = [];
  const thisMonday = weekStartOf(new Date());
  const base = new Date(`${thisMonday}T00:00:00Z`);
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - i * 7);
    const ws = d.toISOString().slice(0, 10);
    const v = byWeek.get(ws) ?? { zone2Min: 0, vo2maxMin: 0 };
    out.push({ weekStart: ws, zone2Min: v.zone2Min, vo2maxMin: v.vo2maxMin });
  }
  return out;
}

export type OneRmPoint = { date: string; oneRm: number };
export type Exercise1RM = { exerciseId: string; name: string; points: OneRmPoint[] };

export async function getExercise1RMSeries(
  user: AuthUser,
  patientId: string
): Promise<Exercise1RM[]> {
  // Per exercise per session date, pick the single most max-like set — heaviest
  // load, tie-broken by more reps — among sets at ≤12 reps (Epley loses
  // accuracy past that). Then estimate 1RM from that set with Epley.
  const rows = await withAuth(user, (sql) =>
    sql`
      SELECT DISTINCT ON (e.id, esl.log_date)
             e.id AS exercise_id, e.name AS name,
             to_char(esl.log_date, 'YYYY-MM-DD') AS date,
             esl.actual_weight AS weight, esl.actual_reps AS reps
      FROM exercise_set_logs esl
      JOIN session_sets ss ON ss.id = esl.set_id
      JOIN session_exercises se ON se.id = ss.session_exercise_id
      JOIN exercise_library e ON e.id = se.exercise_id
      WHERE esl.patient_id = ${patientId}
        AND esl.actual_weight IS NOT NULL AND esl.actual_weight > 0
        AND esl.actual_reps IS NOT NULL AND esl.actual_reps > 0
        AND esl.actual_reps <= 12
      ORDER BY e.id, esl.log_date, esl.actual_weight DESC, esl.actual_reps DESC
    `
  );

  const byExercise = new Map<string, Exercise1RM>();
  for (const r of rows as any[]) {
    const ex: Exercise1RM = byExercise.get(r.exercise_id) ?? { exerciseId: r.exercise_id, name: r.name, points: [] };
    const weight = Number(r.weight);
    const reps = Number(r.reps);
    const oneRm = Math.round(weight * (1 + reps / 30)); // Epley
    ex.points.push({ date: r.date, oneRm });
    byExercise.set(r.exercise_id, ex);
  }
  // DISTINCT ON returns rows ordered by exercise/date; sort points by date and
  // exercises by name for stable display.
  const out = Array.from(byExercise.values());
  out.forEach((ex) => ex.points.sort((a, b) => a.date.localeCompare(b.date)));
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
