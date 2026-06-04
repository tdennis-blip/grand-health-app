import Link from "next/link";
import { Plus, Dumbbell, Activity, Flame, Sparkles } from "lucide-react";
import { requireClinician } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { SessionRowActions } from "./session-row-actions";

type SessionKind = "strength" | "zone2" | "vo2max" | "mobility";

const KIND_STYLE: Record<SessionKind, { Icon: typeof Dumbbell; label: string; badge: string; tile: string }> = {
  strength: { Icon: Dumbbell, label: "Strength", badge: "bg-blue-50 text-blue-700 border-blue-200",   tile: "from-blue-600 to-cyan-600" },
  zone2:    { Icon: Activity, label: "Zone 2",   badge: "bg-teal-50 text-teal-700 border-teal-200",   tile: "from-teal-500 to-cyan-600" },
  vo2max:   { Icon: Flame,    label: "VO₂ max",  badge: "bg-rose-50 text-rose-700 border-rose-200",   tile: "from-rose-500 to-red-600" },
  mobility: { Icon: Sparkles, label: "Mobility", badge: "bg-amber-50 text-amber-700 border-amber-200",tile: "from-amber-500 to-orange-500" },
};

export default async function SessionsPage() {
  const user = await requireClinician();

  const [sessionRows, tzRows, wzRows, exerciseRows] = await Promise.all([
    withAuth(user, (sql) =>
      sql`SELECT id, kind, name, focus, est_minutes, accent, modality, duration_min, rounds, work_min, recover_min, target_zone_id, work_zone_id FROM session_library ORDER BY kind ASC, name ASC`
    ),
    withAuth(user, (sql) =>
      sql`SELECT id, short_name, low_bpm, high_bpm FROM hr_zones`
    ),
    withAuth(user, (sql) =>
      sql`SELECT se.session_id, e.name AS exercise_name FROM session_exercises se JOIN exercise_library e ON e.id = se.exercise_id`
    ),
    withAuth(user, (sql) =>
      sql`SELECT se.id, se.session_id FROM session_exercises se`
    ),
  ]);

  const zoneMap = new Map(tzRows.map((z: any) => [z.id, z]));
  const exsBySession: Record<string, any[]> = {};
  for (const e of exerciseRows) {
    (exsBySession[e.session_id] ?? (exsBySession[e.session_id] = [])).push(e);
  }
  const exIdsBySession: Record<string, any[]> = {};
  for (const e of exerciseRows) {
    (exIdsBySession[e.session_id] ?? (exIdsBySession[e.session_id] = [])).push(e);
  }

  const sessions = sessionRows.map((s: any) => ({
    ...s,
    target_zone: s.target_zone_id ? zoneMap.get(s.target_zone_id) ?? null : null,
    work_zone: s.work_zone_id ? zoneMap.get(s.work_zone_id) ?? null : null,
    session_exercises: (exsBySession[s.id] ?? []).map((e: any) => ({ exercise: { name: e.exercise_name } })),
  }));

  return (
    <main className="max-w-5xl mx-auto px-6 py-6 space-y-6">
      <Link href="/clinician/library/training" className="text-sm text-teal-700 hover:text-teal-800 inline-flex items-center gap-1">
        &larr; Training library
      </Link>
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Training library</div>
          <div className="text-xl font-semibold text-slate-900">Sessions</div>
          <div className="text-xs text-slate-500 mt-1">
            Named workouts — pick a kind. Strength &amp; mobility hold exercise lists; Zone 2 &amp; VO₂ max hold cardio protocols.
          </div>
        </div>
        <Link
          href="/clinician/library/training/sessions/new"
          className="text-xs font-semibold bg-teal-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-teal-800 flex-shrink-0"
        >
          <Plus size={13} /> New session
        </Link>
      </header>

      {(sessions.length === 0) ? (
        <div className="text-sm text-slate-500 italic py-12 text-center bg-white rounded-2xl border border-dashed border-slate-200">
          No sessions yet. Build your first one — strength, mobility, Zone 2, or VO₂ max.
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((s: any) => {
            const kind = (s.kind as SessionKind);
            const style = KIND_STYLE[kind];
            const Icon = style.Icon;

            let summary = "";
            let detail = "";
            if (kind === "strength" || kind === "mobility") {
              const exs = s.session_exercises ?? [];
              summary = `${exs.length} ${kind === "mobility" ? "move" : "exercise"}${exs.length === 1 ? "" : "s"}`;
              detail = exs.slice(0, 3).map((se: any) => se.exercise?.name).filter(Boolean).join(", ");
              if (exs.length > 3) detail += ` +${exs.length - 3} more`;
            } else if (kind === "zone2") {
              const z = s.target_zone;
              summary = `${s.modality || "Cardio"} · ${s.duration_min ?? s.est_minutes}m`;
              detail = z ? `Target ${z.short_name} · ${z.low_bpm}–${z.high_bpm} bpm` : "Steady aerobic";
            } else if (kind === "vo2max") {
              summary = `${s.rounds || 4} × ${s.work_min || 4}m @ ${s.work_zone?.short_name || "Z5"} · ${s.recover_min || 3}m recovery`;
              detail = `${s.modality || "Cardio"} · total ${s.est_minutes}m`;
            }

            return (
              <div
                key={s.id}
                className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-3 hover:border-teal-300 transition"
              >
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${s.accent || style.tile} text-white flex items-center justify-center flex-shrink-0`}>
                  <Icon size={18} />
                </div>
                <Link href={`/clinician/library/training/sessions/${s.id}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <div className="text-sm font-semibold text-slate-900 truncate">{s.name}</div>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${style.badge}`}>{style.label}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {s.focus || "—"} · ~{s.est_minutes}m · {summary}
                  </div>
                  {detail && (
                    <div className="text-[11px] text-slate-400 truncate mt-0.5">{detail}</div>
                  )}
                </Link>
                <SessionRowActions sessionId={s.id} sessionName={s.name} />
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
