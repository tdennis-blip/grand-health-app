import Link from "next/link";
import { Dumbbell, Sparkles, Calendar, Heart, ChevronRight } from "lucide-react";
import { requireClinician } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";

export default async function TrainingLibraryHome() {
  const user = await requireClinician();

  const [[exRow], [sessRow], [progRow]] = await Promise.all([
    withAuth(user, (sql) => sql`SELECT count(*)::int AS n FROM exercise_library`),
    withAuth(user, (sql) => sql`SELECT count(*)::int AS n FROM session_library`),
    withAuth(user, (sql) => sql`SELECT count(*)::int AS n FROM program_library`),
  ]);
  const exerciseCount = exRow?.n ?? 0;
  const sessionCount = sessRow?.n ?? 0;
  const programCount = progRow?.n ?? 0;

  const tiles = [
    {
      href: "/clinician/library/training/exercises",
      label: "Exercises",
      desc: "Atomic moves — strength and mobility — with attached videos.",
      Icon: Dumbbell,
      count: exerciseCount ?? 0,
      ready: true,
    },
    {
      href: "/clinician/library/training/sessions",
      label: "Sessions",
      desc: "Named workouts — Strength, Zone 2, VO₂ max, Mobility flows.",
      Icon: Sparkles,
      count: sessionCount ?? 0,
      ready: true,
    },
    {
      href: "/clinician/library/training/programs",
      label: "Programs",
      desc: "Weekly schedules built from sessions, assignable to patients.",
      Icon: Calendar,
      count: programCount ?? 0,
      ready: true,
    },
    {
      href: "/clinician/library/training/zones",
      label: "Zones & targets",
      desc: "HR zones (Z1–Z5) and weekly volume targets.",
      Icon: Heart,
      count: null,
      ready: true,
    },
  ];

  return (
    <main className="max-w-5xl mx-auto px-6 py-6 space-y-6">
      <header>
        <div className="text-xs uppercase tracking-wide text-slate-500">Clinic library</div>
        <div className="text-xl font-semibold text-slate-900">Training</div>
        <div className="text-xs text-slate-500 mt-1">
          Build your reusable training library once, assign to any patient.
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {tiles.map(({ href, label, desc, Icon, count, ready }) => {
          const className = `bg-white border border-slate-200 rounded-2xl p-5 flex items-start gap-3 transition ${
            ready ? "hover:border-teal-300 cursor-pointer" : "opacity-60"
          }`;
          const inner = (
            <>
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-teal-600 to-emerald-500 text-white flex items-center justify-center flex-shrink-0">
                <Icon size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold text-slate-900">{label}</div>
                  {count != null && (
                    <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-full">
                      {count}
                    </span>
                  )}
                  {!ready && (
                    <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                      Coming next round
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 leading-snug mt-0.5">{desc}</div>
              </div>
              {ready && <ChevronRight size={16} className="text-slate-300 mt-1 flex-shrink-0" />}
            </>
          );
          return ready ? (
            <Link key={label} href={href} className={className}>
              {inner}
            </Link>
          ) : (
            <div key={label} className={className}>
              {inner}
            </div>
          );
        })}
      </div>
    </main>
  );
}
