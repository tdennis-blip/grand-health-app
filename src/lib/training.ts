// Server-side helpers for the patient-facing training views.
// Everything here runs through the patient's authenticated Supabase session,
// so RLS does the scoping — these functions only ever return rows tied to
// programs the patient has been assigned.

import { getUser } from "@/lib/auth/server";
import type { AuthUser } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";

export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export const DAY_KEYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const DAY_LABELS: Record<DayKey, string> = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
  fri: "Friday", sat: "Saturday", sun: "Sunday",
};
export const DAY_SHORT: Record<DayKey, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

// JS getDay() → 0=Sun..6=Sat. Convert to our Mon-first ordering.
export function todayKey(): DayKey {
  const d = new Date().getDay();
  return d === 0 ? "sun" : (DAY_KEYS[d - 1] as DayKey);
}

export type ActiveAssignment = {
  id: string;
  programId: string;
  programName: string;
  programDescription: string | null;
};

// Returns the patient's currently-active program (no ended_at) if any.
// If there are multiple (rare), returns the most recently assigned one.
export async function getActiveAssignment(): Promise<ActiveAssignment | null> {
  const user = await getUser();
  if (!user) return null;

  const [row] = await withAuth(user, (sql) =>
    sql`
      SELECT pa.id, pa.program_id, pl.name AS program_name, pl.description AS program_description
      FROM program_assignments pa
      JOIN program_library pl ON pl.id = pa.program_id
      WHERE pa.patient_id = ${user.id} AND pa.ended_at IS NULL
      ORDER BY pa.assigned_at DESC
      LIMIT 1
    `
  );
  if (!row) return null;
  return {
    id: row.id,
    programId: row.program_id,
    programName: row.program_name,
    programDescription: row.program_description,
  };
}

export type WeekSessionLite = {
  id: string;
  kind: "strength" | "zone2" | "vo2max" | "mobility";
  name: string;
  focus: string | null;
  estMinutes: number;
  accent: string | null;
};

export type WeekSession = {
  day: DayKey;
  // Ordered list of sessions scheduled for the day (empty = rest day).
  sessions: WeekSessionLite[];
};

// Returns the 7-day schedule for the patient's active program, in Mon-Sun order.
// Every day is included; a day with no scheduled sessions is a rest day.
export async function getWeekSchedule(programId: string): Promise<WeekSession[]> {
  const user = await getUser();
  if (!user) return DAY_KEYS.map((day) => ({ day, sessions: [] }));

  const rows = await withAuth(user, (sql) =>
    sql`
      SELECT pd.day, pd.sort_order, s.id AS session_id, s.kind, s.name, s.focus, s.est_minutes, s.accent
      FROM program_days pd
      JOIN session_library s ON s.id = pd.session_id
      WHERE pd.program_id = ${programId}
      ORDER BY pd.sort_order ASC, s.name ASC
    `
  );

  const dayMap: Record<DayKey, WeekSessionLite[]> = {
    mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [],
  };
  rows.forEach((row: any) => {
    dayMap[row.day as DayKey].push({
      id: row.session_id,
      kind: row.kind,
      name: row.name,
      focus: row.focus,
      estMinutes: row.est_minutes,
      accent: row.accent,
    });
  });
  return DAY_KEYS.map((day) => ({ day, sessions: dayMap[day] }));
}

export type SessionDetail = {
  id: string;
  kind: "strength" | "zone2" | "vo2max" | "mobility";
  name: string;
  focus: string | null;
  estMinutes: number;
  accent: string | null;
  coachNote: string | null;
  // cardio
  modality: string | null;
  durationMin: number | null;
  warmupMin: number | null;
  rounds: number | null;
  workMin: number | null;
  recoverMin: number | null;
  cooldownMin: number | null;
  targetZone: ZoneRef | null;
  workZone: ZoneRef | null;
  recoverZone: ZoneRef | null;
  // strength / mobility
  exercises: Array<{
    id: string;
    sortOrder: number;
    name: string;
    primaryArea: string | null;
    coachNote: string | null;
    videoTitle: string | null;
    videoLength: string | null;
    videoUrl: string | null;
    perSide: boolean;
    sets: Array<{ id: string; setNumber: number; reps: number; weight: number; durationSeconds: number | null }>;
  }>;
};

type ZoneRef = { id: string; shortName: string; name: string; lowBpm: number; highBpm: number };

export async function getSessionDetail(sessionId: string): Promise<SessionDetail | null> {
  const user = await getUser();
  if (!user) return null;

  const [s] = await withAuth(user, (sql) =>
    sql`
      SELECT s.id, s.kind, s.name, s.focus, s.est_minutes, s.accent, s.coach_note,
             s.modality, s.duration_min, s.warmup_min, s.rounds, s.work_min, s.recover_min, s.cooldown_min,
             tz.id AS tz_id, tz.short_name AS tz_short_name, tz.name AS tz_name, tz.low_bpm AS tz_low, tz.high_bpm AS tz_high,
             wz.id AS wz_id, wz.short_name AS wz_short_name, wz.name AS wz_name, wz.low_bpm AS wz_low, wz.high_bpm AS wz_high,
             rz.id AS rz_id, rz.short_name AS rz_short_name, rz.name AS rz_name, rz.low_bpm AS rz_low, rz.high_bpm AS rz_high
      FROM session_library s
      LEFT JOIN hr_zones tz ON tz.id = s.target_zone_id
      LEFT JOIN hr_zones wz ON wz.id = s.work_zone_id
      LEFT JOIN hr_zones rz ON rz.id = s.recover_zone_id
      WHERE s.id = ${sessionId}
      LIMIT 1
    `
  );

  if (!s) return null;

  const exercises = await withAuth(user, (sql) =>
    sql`
      SELECT se.id, se.sort_order, se.exercise_id,
             e.name AS exercise_name, e.primary_area, e.coach_note AS exercise_coach_note,
             e.video_title, e.video_length, e.video_url, e.per_side
      FROM session_exercises se
      JOIN exercise_library e ON e.id = se.exercise_id
      WHERE se.session_id = ${sessionId}
      ORDER BY se.sort_order ASC
    `
  );

  const seIds = exercises.map((e: any) => e.id as string);
  const sets = seIds.length > 0
    ? await withAuth(user, (sql) =>
        sql`SELECT id, session_exercise_id, set_number, reps, weight, duration_seconds FROM session_sets WHERE session_exercise_id = ANY(${seIds}) ORDER BY set_number ASC`
      )
    : [];

  const setsByExercise: Record<string, any[]> = {};
  sets.forEach((set: any) => {
    (setsByExercise[set.session_exercise_id] ?? (setsByExercise[set.session_exercise_id] = [])).push(set);
  });

  const mapZone = (id: any, shortName: any, name: any, low: any, high: any): ZoneRef | null =>
    id ? { id, shortName: shortName, name, lowBpm: low, highBpm: high } : null;

  return {
    id: s.id,
    kind: s.kind,
    name: s.name,
    focus: s.focus,
    estMinutes: s.est_minutes,
    accent: s.accent,
    coachNote: s.coach_note,
    modality: s.modality,
    durationMin: s.duration_min,
    warmupMin: s.warmup_min,
    rounds: s.rounds,
    workMin: s.work_min,
    recoverMin: s.recover_min,
    cooldownMin: s.cooldown_min,
    targetZone: mapZone(s.tz_id, s.tz_short_name, s.tz_name, s.tz_low, s.tz_high),
    workZone:   mapZone(s.wz_id, s.wz_short_name, s.wz_name, s.wz_low, s.wz_high),
    recoverZone: mapZone(s.rz_id, s.rz_short_name, s.rz_name, s.rz_low, s.rz_high),
    exercises: exercises.map((se: any) => ({
      id: se.id,
      sortOrder: se.sort_order,
      name: se.exercise_name ?? "(unknown)",
      primaryArea: se.primary_area ?? null,
      coachNote: se.exercise_coach_note ?? null,
      videoTitle: se.video_title ?? null,
      videoLength: se.video_length ?? null,
      videoUrl: se.video_url ?? null,
      perSide: se.per_side ?? false,
      sets: (setsByExercise[se.id] ?? []).map((set: any) => ({
        id: set.id, setNumber: set.set_number, reps: set.reps, weight: set.weight,
        durationSeconds: set.duration_seconds ?? null,
      })),
    })),
  };
}

export type SetLog = {
  setId: string;
  side: string; // 'na' | 'left' | 'right'
  actualReps: number | null;
  actualWeight: number | null;
  actualSeconds: number | null;
  done: boolean;
};

// Patient's logged actuals for a session on a given date, keyed by
// `${setId}:${side}` so per-side (left/right) logs are addressable.
export async function getSetLogsForSession(
  sessionId: string,
  logDate: string
): Promise<Record<string, SetLog>> {
  const user = await getUser();
  if (!user) return {};
  const rows = await withAuth(user, (sql) =>
    sql`SELECT set_id, side, actual_reps, actual_weight, actual_seconds, done
        FROM exercise_set_logs
        WHERE patient_id = ${user.id} AND session_id = ${sessionId} AND log_date = ${logDate}`
  );
  const map: Record<string, SetLog> = {};
  rows.forEach((r: any) => {
    map[`${r.set_id}:${r.side}`] = {
      setId: r.set_id,
      side: r.side,
      actualReps: r.actual_reps,
      actualWeight: r.actual_weight,
      actualSeconds: r.actual_seconds,
      done: r.done,
    };
  });
  return map;
}

// ---------------------------------------------------------------------------
// Today's training compliance score (drives the Home hero "Training" domain).
//   · Rest day (no sessions)        → 100
//   · Strength / mobility session   → % of prescribed sets marked done
//   · Zone 2 / VO2 max session      → done = 100, not done = 0
//   · Multiple sessions in a day    → average of the per-session scores
//   · No program assigned           → null (not scored)
// ---------------------------------------------------------------------------
async function sessionCompletionFraction(
  user: AuthUser,
  session: WeekSessionLite,
  logDate: string
): Promise<number> {
  if (session.kind === "zone2" || session.kind === "vo2max") {
    const [row] = await withAuth(user, (sql) =>
      sql`SELECT done FROM cardio_session_logs
          WHERE patient_id = ${user.id} AND session_id = ${session.id} AND log_date = ${logDate}
          LIMIT 1`
    );
    return row?.done ? 1 : 0;
  }
  // strength / mobility — fraction of prescribed sets logged done.
  const [counts] = await withAuth(user, (sql) =>
    sql`
      SELECT
        (SELECT count(*)::int FROM session_sets ss
           JOIN session_exercises se ON se.id = ss.session_exercise_id
          WHERE se.session_id = ${session.id}) AS total,
        (SELECT count(*)::int FROM exercise_set_logs
          WHERE patient_id = ${user.id} AND session_id = ${session.id}
            AND log_date = ${logDate} AND done = true) AS done
    `
  );
  const total = Number(counts?.total ?? 0);
  const done = Number(counts?.done ?? 0);
  return total > 0 ? Math.min(1, done / total) : 0;
}

export async function getTrainingComplianceScore(
  sessions: WeekSessionLite[] | null
): Promise<{ value: number | null; caption: string; ok?: boolean }> {
  const user = await getUser();
  const logDate = new Date().toISOString().slice(0, 10);

  // Patient-logged ad-hoc activities for today count toward training too.
  let activityCount = 0;
  if (user) {
    const [row] = await withAuth(user, (sql) =>
      sql`SELECT count(*)::int AS n FROM patient_activities WHERE patient_id = ${user.id} AND log_date = ${logDate}`
    );
    activityCount = Number(row?.n ?? 0);
  }

  if (sessions == null) {
    if (activityCount > 0) {
      return { value: 100, caption: `${activityCount} logged ${activityCount === 1 ? "activity" : "activities"}`, ok: true };
    }
    return { value: null, caption: "No program assigned" };
  }
  if (sessions.length === 0) {
    return {
      value: 100,
      caption: activityCount > 0 ? "Rest day + extra activity" : "Rest day — recovery is part of the plan",
      ok: true,
    };
  }
  if (!user) return { value: null, caption: "Sign in to score training" };

  const fractions: number[] = [];
  for (const s of sessions) fractions.push(await sessionCompletionFraction(user, s, logDate));
  for (let i = 0; i < activityCount; i++) fractions.push(1);

  const value = Math.round((fractions.reduce((a, b) => a + b, 0) / fractions.length) * 100);
  const label = sessions.length === 1 ? sessions[0].name : `${sessions.length} sessions`;
  const extra = activityCount > 0 ? ` +${activityCount} extra` : "";
  return { value, caption: `${label} · ${value}% complete${extra}`, ok: value >= 100 };
}

export type PatientActivity = {
  id: string;
  logDate: string;
  kind: "zone2" | "vo2max" | "cardio" | "strength" | "mobility";
  name: string;
  minutes: number | null;
  sets: Array<{ setNumber: number; reps: number | null; weight: number | null; durationSeconds: number | null }>;
};

async function hydrateActivities(user: AuthUser, acts: any[]): Promise<PatientActivity[]> {
  if (acts.length === 0) return [];
  const ids = acts.map((a: any) => a.id as string);
  const sets = await withAuth(user, (sql) =>
    sql`SELECT activity_id, set_number, reps, weight, duration_seconds
        FROM patient_activity_sets WHERE activity_id = ANY(${ids}) ORDER BY set_number ASC`
  );
  const byActivity: Record<string, any[]> = {};
  sets.forEach((s: any) => (byActivity[s.activity_id] ?? (byActivity[s.activity_id] = [])).push(s));
  return acts.map((a: any) => ({
    id: a.id,
    logDate: a.log_date,
    kind: a.kind,
    name: a.name,
    minutes: a.minutes,
    sets: (byActivity[a.id] ?? []).map((s: any) => ({
      setNumber: s.set_number,
      reps: s.reps,
      weight: s.weight,
      durationSeconds: s.duration_seconds,
    })),
  }));
}

// The patient's own ad-hoc activities logged for a date.
export async function getPatientActivitiesForDate(logDate: string): Promise<PatientActivity[]> {
  const user = await getUser();
  if (!user) return [];
  const acts = await withAuth(user, (sql) =>
    sql`SELECT id, log_date::text AS log_date, kind, name, minutes FROM patient_activities
        WHERE patient_id = ${user.id} AND log_date = ${logDate}
        ORDER BY created_at ASC`
  );
  return hydrateActivities(user, acts);
}

// The patient's recent ad-hoc activities across the last N days (newest first).
export async function getRecentPatientActivities(days = 14): Promise<PatientActivity[]> {
  const user = await getUser();
  if (!user) return [];
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (days - 1));
  const sinceIso = since.toISOString().slice(0, 10);
  const acts = await withAuth(user, (sql) =>
    sql`SELECT id, log_date::text AS log_date, kind, name, minutes FROM patient_activities
        WHERE patient_id = ${user.id} AND log_date >= ${sinceIso}
        ORDER BY log_date DESC, created_at DESC`
  );
  return hydrateActivities(user, acts);
}

export type CardioLog = { actualMinutes: number | null; done: boolean };

// The patient's logged completion + actual minutes for a cardio session on a
// given date (zone2 / vo2max). Null if nothing logged yet.
export async function getCardioLogForSession(
  sessionId: string,
  logDate: string
): Promise<CardioLog | null> {
  const user = await getUser();
  if (!user) return null;
  const [row] = await withAuth(user, (sql) =>
    sql`SELECT actual_minutes, done
        FROM cardio_session_logs
        WHERE patient_id = ${user.id} AND session_id = ${sessionId} AND log_date = ${logDate}
        LIMIT 1`
  );
  if (!row) return null;
  return { actualMinutes: row.actual_minutes, done: row.done };
}
