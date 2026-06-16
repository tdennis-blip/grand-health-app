import Link from "next/link";
import { Dumbbell, Activity, Flame, Sparkles, ChevronRight, Calendar } from "lucide-react";
import {
  getActiveAssignment,
  getWeekSchedule,
  todayKey,
  DAY_SHORT,
  DAY_LABELS,
  DAY_KEYS,
} from "@/lib/training";

const KIND_ICON = {
  strength: Dumbbell, zone2: Activity, vo2max: Flame, mobility: Sparkles,
} as const;
const KIND_LABEL = {
  strength: "Strength", zone2: "Zone 2", vo2max: "VO₂ max", mobility: "Mobility",
} as const;
const KIND_TILE = {
  strength: "from-blue-600 to-cyan-600",
  zone2:    "from-teal-500 to-cyan-600",
  vo2max:   "from-rose-500 to-red-600",
  mobility: "from-amber-500 to-orange-500",
} as const;

export default async function PatientTrainingWeek() {
  const assignment = await getActiveAssignment();
  if (!assignment) {
    return (
      <main className="max-w-md mx-auto px-5 py-5 space-y-3">
        <Link href="/home" className="text-sm text-teal-700">&larr; Home</Link>
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-5 text-center">
          <div className="text-sm font-semibold text-slate-900">No training program yet</div>
          <div className="text-[12px] text-slate-500 leading-snug mt-1">
            Your clinician hasn&apos;t assigned a program. Check back after your next visit.
          </div>
        </div>
      </main>
    );
  }

  const week = await getWeekSchedule(assignment.programId);
  const tKey = todayKey();

  return (
    <main className="max-w-md mx-auto px-5 py-5 space-y-4">
      <Link href="/home" className="text-sm text-teal-700">&larr; Home</Link>
      <header>
        <div className="text-xs uppercase tracking-wide text-slate-500">Your training</div>
        <div className="text-xl font-semibold text-slate-900">{assignment.programName}</div>
        {assignment.programDescription && (
          <div className="text-[12px] text-slate-500 leading-snug mt-1">{assignment.programDescription}</div>
        )}
      </header>

      <section className="space-y-3">
        {week.map(({ day, sessions }) => {
          const isToday = day === tKey;
          if (sessions.length === 0) {
            return (
              <div
                key={day}
                className={`rounded-2xl border p-3 flex items-center gap-3 ${
                  isToday ? "bg-slate-50 border-slate-300" : "bg-white border-slate-200"
                }`}
              >
                <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center flex-shrink-0">
                  <Calendar size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                    {DAY_SHORT[day]} {isToday && <span className="text-teal-700">· Today</span>}
                  </div>
                  <div className="text-sm font-semibold text-slate-500">Rest day</div>
                </div>
              </div>
            );
          }
          return (
            <div key={day} className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold px-1">
                {DAY_SHORT[day]} {isToday && <span className="text-teal-700">· Today</span>}
                {sessions.length > 1 && <span className="text-slate-400"> · {sessions.length} sessions</span>}
              </div>
              {sessions.map((session) => {
                const Icon = KIND_ICON[session.kind];
                const gradient = session.accent || KIND_TILE[session.kind];
                return (
                  <Link
                    key={session.id}
                    href={`/home/training/${day}?s=${session.id}`}
                    className={`block rounded-2xl border p-3 flex items-center gap-3 transition ${
                      isToday ? "bg-white border-teal-300 ring-1 ring-teal-200" : "bg-white border-slate-200 hover:border-teal-300"
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${gradient} text-white flex items-center justify-center flex-shrink-0`}>
                      <Icon size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">{session.name}</div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {KIND_LABEL[session.kind]} · {session.focus || `~${session.estMinutes}m`}
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-slate-400 flex-shrink-0" />
                  </Link>
                );
              })}
            </div>
          );
        })}
      </section>
    </main>
  );
}
