import Link from "next/link";
import { Check } from "lucide-react";
import { requireClinician } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";

type LogRow = {
  log_date: string;
  actual_reps: number | null;
  actual_weight: number | null;
  done: boolean;
  set_number: number;
  target_reps: number;
  target_weight: number;
  exercise_name: string;
  session_name: string;
};

export default async function PatientWorkoutsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireClinician();

  const [[patient], rows] = await Promise.all([
    withAuth(user, (sql) =>
      sql`SELECT first_name, last_name FROM profiles WHERE id = ${id} LIMIT 1`
    ),
    withAuth(user, (sql) =>
      sql`
        SELECT esl.log_date, esl.actual_reps, esl.actual_weight, esl.done,
               ss.set_number, ss.reps AS target_reps, ss.weight AS target_weight,
               el.name AS exercise_name, sl.name AS session_name
        FROM exercise_set_logs esl
        JOIN session_sets ss ON ss.id = esl.set_id
        JOIN session_exercises se ON se.id = ss.session_exercise_id
        JOIN exercise_library el ON el.id = se.exercise_id
        JOIN session_library sl ON sl.id = esl.session_id
        WHERE esl.patient_id = ${id}
        ORDER BY esl.log_date DESC, sl.name ASC, el.name ASC, ss.set_number ASC
        LIMIT 300
      ` as Promise<LogRow[]>
    ),
  ]);

  // Group: date -> "session · exercise" -> rows
  const byDate = new Map<string, Map<string, LogRow[]>>();
  rows.forEach((r) => {
    const d = String(r.log_date).slice(0, 10);
    const key = `${r.session_name} · ${r.exercise_name}`;
    if (!byDate.has(d)) byDate.set(d, new Map());
    const m = byDate.get(d)!;
    if (!m.has(key)) m.set(key, []);
    m.get(key)!.push(r);
  });

  const patientName = patient ? `${patient.first_name ?? ""} ${patient.last_name ?? ""}`.trim() : "Patient";

  return (
    <main className="max-w-3xl mx-auto px-6 py-6 space-y-6">
      <Link href={`/clinician/patient/${id}`} className="text-sm text-teal-700 hover:text-teal-800 inline-flex items-center gap-1">
        &larr; Back to patient
      </Link>
      <header>
        <div className="text-xs uppercase tracking-wide text-slate-500">Logged workouts</div>
        <div className="text-xl font-semibold text-slate-900">{patientName}</div>
        <div className="text-xs text-slate-500 mt-1">What the patient actually did, vs. the prescribed reps × weight.</div>
      </header>

      {byDate.size === 0 ? (
        <div className="text-sm text-slate-500 italic py-10 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
          No workout sets logged yet.
        </div>
      ) : (
        <div className="space-y-5">
          {[...byDate.entries()].map(([date, exercises]) => (
            <section key={date} className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="text-sm font-semibold text-slate-900 mb-3">
                {new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
              </div>
              <div className="space-y-4">
                {[...exercises.entries()].map(([key, sets]) => (
                  <div key={key}>
                    <div className="text-[12px] font-semibold text-slate-700 mb-1">{key}</div>
                    <div className="space-y-1">
                      <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                        <div className="col-span-2">Set</div>
                        <div className="col-span-4 text-center">Prescribed</div>
                        <div className="col-span-4 text-center">Actual</div>
                        <div className="col-span-2 text-center">Done</div>
                      </div>
                      {sets.map((s) => {
                        const actual = s.actual_reps != null || s.actual_weight != null
                          ? `${s.actual_reps ?? "–"}×${s.actual_weight ?? "–"}`
                          : "–";
                        return (
                          <div key={s.set_number} className="grid grid-cols-12 gap-2 text-sm py-1 border-t border-slate-100 items-center">
                            <div className="col-span-2 font-medium text-slate-700">#{s.set_number}</div>
                            <div className="col-span-4 text-center tabular-nums text-slate-400">{s.target_reps}×{s.target_weight}</div>
                            <div className="col-span-4 text-center tabular-nums text-slate-900 font-semibold">{actual}</div>
                            <div className="col-span-2 flex justify-center">
                              {s.done ? <Check size={15} className="text-teal-600" /> : <span className="text-slate-300">–</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
