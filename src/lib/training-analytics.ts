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

// ── Adherence by modality (completed vs prescribed) ─────────────────────────
export type ModalityAdherence = {
  kind: "strength" | "zone2" | "vo2max" | "mobility";
  label: string;
  prescribed: number; // sessions the active program prescribes over the window
  completed: number;  // distinct (session, date) the patient logged as done
  pct: number | null; // completed/prescribed, capped 100; null if none prescribed
};

const MODALITY_LABEL: Record<ModalityAdherence["kind"], string> = {
  strength: "Strength", zone2: "Zone 2", vo2max: "VO₂ max", mobility: "Movements & practices",
};

// Per-modality adherence over the last `weeks` weeks: how many prescribed
// sessions of each modality the patient actually completed. Prescribed count =
// (sessions of that kind per week in the active program) × weeks. Completed =
// distinct (session, date) with a done log (strength/mobility → set logs;
// zone2/vo2max → cardio logs).
export async function getModalityAdherence(
  user: AuthUser,
  patientId: string,
  weeks = 4
): Promise<ModalityAdherence[] | null> {
  const [assignment] = await withAuth(user, (sql) =>
    sql`SELECT program_id FROM program_assignments WHERE patient_id = ${patientId} AND ended_at IS NULL ORDER BY assigned_at DESC LIMIT 1`
  );
  if (!assignment) return null;

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - weeks * 7);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const [perWeek, strengthDone, cardioDone] = await Promise.all([
    withAuth(user, (sql) =>
      sql`SELECT s.kind, COUNT(*)::int AS n
          FROM program_days pd JOIN session_library s ON s.id = pd.session_id
          WHERE pd.program_id = ${assignment.program_id} GROUP BY s.kind`
    ),
    withAuth(user, (sql) =>
      sql`SELECT s.kind, COUNT(DISTINCT esl.session_id::text || '|' || esl.log_date::text)::int AS n
          FROM exercise_set_logs esl JOIN session_library s ON s.id = esl.session_id
          WHERE esl.patient_id = ${patientId} AND esl.done = true AND esl.log_date >= ${cutoffIso}
          GROUP BY s.kind`
    ),
    withAuth(user, (sql) =>
      sql`SELECT s.kind, COUNT(DISTINCT csl.session_id::text || '|' || csl.log_date::text)::int AS n
          FROM cardio_session_logs csl JOIN session_library s ON s.id = csl.session_id
          WHERE csl.patient_id = ${patientId} AND csl.done = true AND csl.log_date >= ${cutoffIso}
          GROUP BY s.kind`
    ),
  ]);

  const prescribedByKind = new Map<string, number>();
  (perWeek as any[]).forEach((r) => prescribedByKind.set(r.kind, Number(r.n) * weeks));
  const completedByKind = new Map<string, number>();
  [...(strengthDone as any[]), ...(cardioDone as any[])].forEach((r) => completedByKind.set(r.kind, Number(r.n)));

  const kinds: ModalityAdherence["kind"][] = ["strength", "zone2", "vo2max", "mobility"];
  return kinds.map((kind) => {
    const prescribed = prescribedByKind.get(kind) ?? 0;
    const completed = completedByKind.get(kind) ?? 0;
    return {
      kind,
      label: MODALITY_LABEL[kind],
      prescribed,
      completed,
      pct: prescribed > 0 ? Math.min(100, Math.round((completed / prescribed) * 100)) : null,
    };
  });
}

// ── Modality monitoring calendar (last N weeks) ─────────────────────────────
// Per-day grid of prescribed vs. completed sessions, split by modality, with
// per-session set/feedback detail so the clinician can drill into any training.
export type ModalityKind = "strength" | "zone2" | "vo2max" | "mobility";

export type MonitorSet = {
  exercise: string;
  setNumber: number;
  target: string;
  actual: string;
  done: boolean;
};

export type MonitorItem = {
  sessionId: string;
  sessionName: string;
  kind: ModalityKind;
  prescribed: boolean; // scheduled by the active program on this weekday
  done: boolean;       // patient logged it as done on this date
  minutes: number | null; // cardio minutes, if any
  rpe: number | null;
  comment: string | null;
  sets: MonitorSet[];
};

export type MonitorDay = { date: string; items: MonitorItem[] };
export type MonitorCalendar = { days: MonitorDay[]; hasProgram: boolean };

const DOW_KEY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]; // JS getUTCDay() index

// Monday of the current week, in UTC.
function thisMondayUtc(): Date {
  const now = new Date();
  const dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = dt.getUTCDay();
  const diff = dow === 0 ? 6 : dow - 1;
  dt.setUTCDate(dt.getUTCDate() - diff);
  return dt;
}

export async function getModalityCalendar(
  user: AuthUser,
  patientId: string,
  weeks = 4
): Promise<MonitorCalendar> {
  const [assignment] = await withAuth(user, (sql) =>
    sql`SELECT program_id FROM program_assignments WHERE patient_id = ${patientId} AND ended_at IS NULL ORDER BY assigned_at DESC LIMIT 1`
  );

  // Window: `weeks` Monday-anchored rows ending with the current week.
  const start = thisMondayUtc();
  start.setUTCDate(start.getUTCDate() - (weeks - 1) * 7);
  const startIso = start.toISOString().slice(0, 10);

  const [programDaysRows, strengthRows, cardioRows, feedbackRows] = await Promise.all([
    assignment
      ? withAuth(user, (sql) =>
          sql`SELECT pd.day, s.id AS session_id, s.name AS session_name, s.kind
              FROM program_days pd JOIN session_library s ON s.id = pd.session_id
              WHERE pd.program_id = ${assignment.program_id} AND pd.session_id IS NOT NULL`
        )
      : Promise.resolve([] as any[]),
    withAuth(user, (sql) =>
      sql`SELECT to_char(esl.log_date, 'YYYY-MM-DD') AS d, esl.session_id, sl.name AS session_name, sl.kind,
                 el.name AS exercise_name, ss.set_number,
                 ss.reps AS target_reps, ss.reps_min AS target_reps_min, ss.reps_max AS target_reps_max, ss.weight AS target_weight,
                 esl.actual_reps, esl.actual_weight, esl.done
          FROM exercise_set_logs esl
          JOIN session_sets ss ON ss.id = esl.set_id
          JOIN session_exercises se ON se.id = ss.session_exercise_id
          JOIN exercise_library el ON el.id = se.exercise_id
          JOIN session_library sl ON sl.id = esl.session_id
          WHERE esl.patient_id = ${patientId} AND esl.log_date >= ${startIso}
          ORDER BY esl.log_date, sl.name, el.name, ss.set_number`
    ),
    withAuth(user, (sql) =>
      sql`SELECT to_char(csl.log_date, 'YYYY-MM-DD') AS d, csl.session_id, sl.name AS session_name, sl.kind,
                 csl.actual_minutes, csl.done
          FROM cardio_session_logs csl JOIN session_library sl ON sl.id = csl.session_id
          WHERE csl.patient_id = ${patientId} AND csl.log_date >= ${startIso}`
    ),
    withAuth(user, (sql) =>
      sql`SELECT to_char(log_date, 'YYYY-MM-DD') AS d, session_id, rpe, comment
          FROM session_feedback_logs
          WHERE patient_id = ${patientId} AND log_date >= ${startIso}`
    ),
  ]);

  // Prescribed sessions grouped by weekday key.
  const prescribedByDow = new Map<string, { sessionId: string; sessionName: string; kind: ModalityKind }[]>();
  for (const r of programDaysRows as any[]) {
    const arr = prescribedByDow.get(r.day) ?? [];
    arr.push({ sessionId: r.session_id, sessionName: r.session_name, kind: r.kind });
    prescribedByDow.set(r.day, arr);
  }

  const feedbackByKey = new Map<string, { rpe: number | null; comment: string | null }>();
  for (const f of feedbackRows as any[]) {
    feedbackByKey.set(`${f.d}|${f.session_id}`, { rpe: f.rpe, comment: f.comment });
  }

  // Logged sessions per (date, sessionId): merge strength sets + cardio.
  type Logged = { sessionName: string; kind: ModalityKind; done: boolean; minutes: number | null; sets: MonitorSet[] };
  const loggedByKey = new Map<string, Logged>();

  for (const r of strengthRows as any[]) {
    const key = `${r.d}|${r.session_id}`;
    const rec: Logged = loggedByKey.get(key) ?? { sessionName: r.session_name, kind: r.kind, done: false, minutes: null, sets: [] };
    const target =
      r.target_reps_min != null && r.target_reps_max != null && r.target_reps_min !== r.target_reps_max
        ? `${r.target_reps_min}–${r.target_reps_max}×${r.target_weight}`
        : `${r.target_reps_max ?? r.target_reps}×${r.target_weight}`;
    const actual =
      r.actual_reps != null || r.actual_weight != null
        ? `${r.actual_reps ?? "–"}×${r.actual_weight ?? "–"}`
        : "–";
    rec.sets.push({ exercise: r.exercise_name, setNumber: r.set_number, target, actual, done: !!r.done });
    if (r.done) rec.done = true;
    loggedByKey.set(key, rec);
  }

  for (const r of cardioRows as any[]) {
    const key = `${r.d}|${r.session_id}`;
    const rec: Logged = loggedByKey.get(key) ?? { sessionName: r.session_name, kind: r.kind, done: false, minutes: null, sets: [] };
    rec.minutes = r.actual_minutes != null ? Number(r.actual_minutes) : rec.minutes;
    if (r.done) rec.done = true;
    loggedByKey.set(key, rec);
  }

  // Emit each day in the window, oldest → newest.
  const days: MonitorDay[] = [];
  const totalDays = weeks * 7;
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const dowKey = DOW_KEY[d.getUTCDay()];

    // Union of prescribed sessions for this weekday and any sessions logged today.
    const bySession = new Map<string, MonitorItem>();
    for (const p of prescribedByDow.get(dowKey) ?? []) {
      bySession.set(p.sessionId, {
        sessionId: p.sessionId, sessionName: p.sessionName, kind: p.kind,
        prescribed: true, done: false, minutes: null, rpe: null, comment: null, sets: [],
      });
    }
    for (const [key, rec] of loggedByKey) {
      if (!key.startsWith(`${iso}|`)) continue;
      const sessionId = key.slice(iso.length + 1);
      const existing = bySession.get(sessionId);
      const fb = feedbackByKey.get(key);
      if (existing) {
        existing.done = rec.done;
        existing.minutes = rec.minutes;
        existing.sets = rec.sets;
        existing.rpe = fb?.rpe ?? null;
        existing.comment = fb?.comment ?? null;
      } else {
        bySession.set(sessionId, {
          sessionId, sessionName: rec.sessionName, kind: rec.kind,
          prescribed: false, done: rec.done, minutes: rec.minutes,
          rpe: fb?.rpe ?? null, comment: fb?.comment ?? null, sets: rec.sets,
        });
      }
    }
    days.push({ date: iso, items: Array.from(bySession.values()) });
  }

  return { days, hasProgram: !!assignment };
}

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
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - weeks * 7);
  const sinceIso = since.toISOString().slice(0, 10);

  const rows = await withAuth(user, (sql) =>
    sql`
      SELECT week_start, kind, sum(minutes)::int AS minutes FROM (
        SELECT to_char(date_trunc('week', csl.log_date), 'YYYY-MM-DD') AS week_start,
               s.kind::text AS kind, coalesce(csl.actual_minutes, 0) AS minutes
        FROM cardio_session_logs csl
        JOIN session_library s ON s.id = csl.session_id
        WHERE csl.patient_id = ${patientId} AND csl.done = true
          AND s.kind IN ('zone2', 'vo2max')
          AND csl.log_date >= ${sinceIso}
        UNION ALL
        SELECT to_char(date_trunc('week', pa.log_date), 'YYYY-MM-DD') AS week_start,
               pa.kind AS kind, coalesce(pa.minutes, 0) AS minutes
        FROM patient_activities pa
        WHERE pa.patient_id = ${patientId}
          AND pa.kind IN ('zone2', 'vo2max')
          AND pa.log_date >= ${sinceIso}
      ) t
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
  // Group by exercise NAME (lowercased) so prescribed + patient-added sets for
  // the same movement merge into one trend line.
  const rows = await withAuth(user, (sql) =>
    sql`
      SELECT DISTINCT ON (name_key, d)
             name_key, name, to_char(d, 'YYYY-MM-DD') AS date, weight, reps
      FROM (
        SELECT lower(e.name) AS name_key, e.name AS name, esl.log_date AS d,
               esl.actual_weight AS weight, esl.actual_reps AS reps
        FROM exercise_set_logs esl
        JOIN session_sets ss ON ss.id = esl.set_id
        JOIN session_exercises se ON se.id = ss.session_exercise_id
        JOIN exercise_library e ON e.id = se.exercise_id
        WHERE esl.patient_id = ${patientId}
          AND esl.actual_weight > 0 AND esl.actual_reps > 0 AND esl.actual_reps <= 12
        UNION ALL
        SELECT lower(pa.name) AS name_key, pa.name AS name, pa.log_date AS d,
               pas.weight AS weight, pas.reps AS reps
        FROM patient_activity_sets pas
        JOIN patient_activities pa ON pa.id = pas.activity_id
        WHERE pa.patient_id = ${patientId}
          AND pa.kind IN ('strength', 'mobility')
          AND pas.weight > 0 AND pas.reps > 0 AND pas.reps <= 12
      ) u
      ORDER BY name_key, d, weight DESC, reps DESC
    `
  );

  const byExercise = new Map<string, Exercise1RM>();
  for (const r of rows as any[]) {
    const ex: Exercise1RM = byExercise.get(r.name_key) ?? { exerciseId: r.name_key, name: r.name, points: [] };
    const weight = Number(r.weight);
    const reps = Number(r.reps);
    const oneRm = Math.round(weight * (1 + reps / 30)); // Epley
    ex.points.push({ date: r.date, oneRm });
    byExercise.set(r.name_key, ex);
  }
  // DISTINCT ON returns rows ordered by exercise/date; sort points by date and
  // exercises by name for stable display.
  const out = Array.from(byExercise.values());
  out.forEach((ex) => ex.points.sort((a, b) => a.date.localeCompare(b.date)));
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
