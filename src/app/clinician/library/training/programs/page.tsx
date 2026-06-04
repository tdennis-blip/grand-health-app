import Link from "next/link";
import { Plus, Calendar } from "lucide-react";
import { requireClinician } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { ProgramRowActions } from "./program-row-actions";

const DAY_LABELS: Record<string, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};
const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const KIND_CELL: Record<string, string> = {
  strength: "bg-blue-50 text-blue-700 border-blue-200",
  zone2:    "bg-teal-50 text-teal-700 border-teal-200",
  vo2max:   "bg-rose-50 text-rose-700 border-rose-200",
  mobility: "bg-amber-50 text-amber-700 border-amber-200",
};

export default async function ProgramsPage() {
  const user = await requireClinician();

  const [programRows, dayRows, assignmentRows] = await Promise.all([
    withAuth(user, (sql) =>
      sql`SELECT id, name, description FROM program_library ORDER BY name ASC`
    ),
    withAuth(user, (sql) =>
      sql`SELECT pd.program_id, pd.day, s.id AS session_id, s.name AS session_name, s.kind FROM program_days pd LEFT JOIN session_library s ON s.id = pd.session_id`
    ),
    withAuth(user, (sql) =>
      sql`SELECT id, program_id, ended_at FROM program_assignments`
    ),
  ]);

  const programs = programRows.map((p: any) => ({
    ...p,
    days: dayRows.filter((d: any) => d.program_id === p.id).map((d: any) => ({
      day: d.day,
      session: d.session_id ? { id: d.session_id, name: d.session_name, kind: d.kind } : null,
    })),
    assignments: assignmentRows.filter((a: any) => a.program_id === p.id),
  }));

  return (
    <main className="max-w-5xl mx-auto px-6 py-6 space-y-6">
      <Link href="/clinician/library/training" className="text-sm text-teal-700 hover:text-teal-800 inline-flex items-center gap-1">
        &larr; Training library
      </Link>
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Training library</div>
          <div className="text-xl font-semibold text-slate-900">Programs</div>
          <div className="text-xs text-slate-500 mt-1">
            Weekly schedules built from sessions, assignable to any patient.
          </div>
        </div>
        <Link
          href="/clinician/library/training/programs/new"
          className="text-xs font-semibold bg-teal-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-teal-800 flex-shrink-0"
        >
          <Plus size={13} /> New program
        </Link>
      </header>

      {(programs.length === 0) ? (
        <div className="text-sm text-slate-500 italic py-12 text-center bg-white rounded-2xl border border-dashed border-slate-200">
          No programs yet. Build your first weekly schedule.
        </div>
      ) : (
        <div className="space-y-2">
          {programs.map((p: any) => {
            const dayMap: Record<string, any> = {};
            (p.days ?? []).forEach((d: any) => { dayMap[d.day] = d.session ?? null; });
            const filled = DAY_ORDER.filter((d) => dayMap[d]).length;
            const activeAssignments = (p.assignments ?? []).filter((a: any) => !a.ended_at).length;

            return (
              <div
                key={p.id}
                className="bg-white border border-slate-200 rounded-xl p-3 flex items-start gap-3 hover:border-teal-300 transition"
              >
                <div className="w-10 h-10 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center flex-shrink-0">
                  <Calendar size={18} />
                </div>
                <Link href={`/clinician/library/training/programs/${p.id}`} className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-900 truncate">{p.name}</div>
                  {p.description && <div className="text-[11px] text-slate-500 leading-snug line-clamp-1">{p.description}</div>}
                  <div className="grid grid-cols-7 gap-1 mt-2">
                    {DAY_ORDER.map((day) => {
                      const sess = dayMap[day];
                      const cellCls = sess
                        ? (KIND_CELL[sess.kind] ?? "bg-slate-50 text-slate-500 border-slate-200")
                        : "bg-slate-50 text-slate-400 border-slate-200";
                      return (
                        <div key={day} className={`text-center border rounded-md py-1 px-0.5 ${cellCls}`} title={sess?.name || "Rest"}>
                          <div className="text-[9px] uppercase tracking-wide font-semibold opacity-70">{DAY_LABELS[day]}</div>
                          <div className="text-[10px] font-semibold truncate">{sess?.name || "Rest"}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {filled} session{filled === 1 ? "" : "s"}/wk · {7 - filled} rest day{7 - filled === 1 ? "" : "s"}
                    {activeAssignments > 0 && <span className="ml-2 text-emerald-700 font-medium">· {activeAssignments} active assignment{activeAssignments === 1 ? "" : "s"}</span>}
                  </div>
                </Link>
                <ProgramRowActions programId={p.id} programName={p.name} />
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
