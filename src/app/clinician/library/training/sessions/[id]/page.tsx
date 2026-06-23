import Link from "next/link";
import { notFound } from "next/navigation";
import { requireClinician } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { SessionEditor } from "./session-editor";

type SessionKind = "strength" | "zone2" | "vo2max" | "mobility";

export default async function SessionEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireClinician();

  const [session] = await withAuth(user, (sql) =>
    sql`SELECT id, kind, name, focus, est_minutes, accent, coach_note, modality, duration_min, target_zone_id, warmup_min, rounds, work_min, work_zone_id, recover_min, recover_zone_id, cooldown_min FROM session_library WHERE id = ${id} LIMIT 1`
  );

  if (!session) notFound();

  const kind = session.kind as SessionKind;

  const zones = await withAuth(user, (sql) =>
    sql`SELECT id, zone_key, name, short_name, low_bpm, high_bpm FROM hr_zones ORDER BY sort_order ASC`
  );

  let attached: any[] = [];
  let exerciseLibrary: any[] = [];
  if (kind === "strength" || kind === "mobility") {
    const [seRows, libRows, setRows] = await Promise.all([
      withAuth(user, (sql) =>
        sql`SELECT se.id, se.sort_order, se.exercise_id, e.id AS ex_id, e.name AS ex_name, e.primary_area, e.video_title FROM session_exercises se JOIN exercise_library e ON e.id = se.exercise_id WHERE se.session_id = ${id} ORDER BY se.sort_order ASC`
      ),
      withAuth(user, (sql) =>
        sql`SELECT id, name, primary_area FROM exercise_library WHERE kind = ${kind} ORDER BY name ASC`
      ),
      withAuth(user, (sql) =>
        sql`SELECT ss.id, ss.session_exercise_id, ss.set_number, ss.reps, ss.weight, ss.duration_seconds FROM session_sets ss JOIN session_exercises se ON se.id = ss.session_exercise_id WHERE se.session_id = ${id} ORDER BY ss.set_number ASC`
      ),
    ]);
    const setsByEx: Record<string, any[]> = {};
    for (const s of setRows) (setsByEx[s.session_exercise_id] ?? (setsByEx[s.session_exercise_id] = [])).push(s);
    attached = seRows.map((se: any) => ({
      id: se.id,
      sortOrder: se.sort_order,
      exerciseId: se.exercise_id,
      exerciseName: se.ex_name ?? "(unknown)",
      primaryArea: se.primary_area ?? null,
      videoTitle: se.video_title ?? null,
      sets: (setsByEx[se.id] ?? []).map((s: any) => ({ id: s.id, setNumber: s.set_number, reps: s.reps, weight: s.weight, durationSeconds: s.duration_seconds ?? null })),
    }));
    exerciseLibrary = libRows.map((e: any) => ({ id: e.id, name: e.name, primaryArea: e.primary_area }));
  }

  return (
    <main className="max-w-4xl mx-auto px-6 py-6 space-y-6">
      <Link
        href="/clinician/library/training/sessions"
        className="text-sm text-teal-700 hover:text-teal-800 inline-flex items-center gap-1"
      >
        &larr; Back to sessions
      </Link>

      <SessionEditor
        sessionId={session.id}
        initial={{
          kind,
          name: session.name,
          focus: session.focus,
          estMinutes: session.est_minutes,
          accent: session.accent,
          coachNote: session.coach_note,
          modality: session.modality,
          durationMin: session.duration_min,
          targetZoneId: session.target_zone_id,
          warmupMin: session.warmup_min,
          rounds: session.rounds,
          workMin: session.work_min,
          workZoneId: session.work_zone_id,
          recoverMin: session.recover_min,
          recoverZoneId: session.recover_zone_id,
          cooldownMin: session.cooldown_min,
        }}
        zones={zones.map((z) => ({
          id: z.id,
          zoneKey: z.zone_key,
          name: z.name,
          shortName: z.short_name,
          lowBpm: z.low_bpm,
          highBpm: z.high_bpm,
        }))}
        attached={attached}
        exerciseLibrary={exerciseLibrary}
      />
    </main>
  );
}
