// Server-side helpers for the patient-facing training views.
// Everything here runs through the patient's authenticated Supabase session,
// so RLS does the scoping — these functions only ever return rows tied to
// programs the patient has been assigned.

import { getUser } from "@/lib/auth/server";
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
    sets: Array<{ id: string; setNumber: number; reps: number; weight: number }>;
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
             e.video_title, e.video_length, e.video_url
      FROM session_exercises se
      JOIN exercise_library e ON e.id = se.exercise_id
      WHERE se.session_id = ${sessionId}
      ORDER BY se.sort_order ASC
    `
  );

  const seIds = exercises.map((e: any) => e.id as string);
  const sets = seIds.length > 0
    ? await withAuth(user, (sql) =>
        sql`SELECT id, session_exercise_id, set_number, reps, weight FROM session_sets WHERE session_exercise_id = ANY(${seIds}) ORDER BY set_number ASC`
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
      sets: (setsByExercise[se.id] ?? []).map((set: any) => ({
        id: set.id, setNumber: set.set_number, reps: set.reps, weight: set.weight,
      })),
    })),
  };
}

export type SetLog = {
  setId: string;
  actualReps: number | null;
  actualWeight: number | null;
  done: boolean;
};

// Patient's logged actuals for a session on a given date, keyed by set id.
export async function getSetLogsForSession(
  sessionId: string,
  logDate: string
): Promise<Record<string, SetLog>> {
  const user = await getUser();
  if (!user) return {};
  const rows = await withAuth(user, (sql) =>
    sql`SELECT set_id, actual_reps, actual_weight, done
        FROM exercise_set_logs
        WHERE patient_id = ${user.id} AND session_id = ${sessionId} AND log_date = ${logDate}`
  );
  const map: Record<string, SetLog> = {};
  rows.forEach((r: any) => {
    map[r.set_id] = {
      setId: r.set_id,
      actualReps: r.actual_reps,
      actualWeight: r.actual_weight,
      done: r.done,
    };
  });
  return map;
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
