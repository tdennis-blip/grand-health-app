import Link from "next/link";
import { ChevronLeft, TrendingUp, Download } from "lucide-react";
import { requireClinician } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { getAdherenceReport, type MedAdherenceWindow } from "@/lib/medications-adherence";

export const dynamic = "force-dynamic";

const ALLOWED: MedAdherenceWindow[] = [7, 14, 30, 90];

export default async function StackAdherencePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ window?: string }>;
}) {
  const { id } = await params;
  const { window: w } = await searchParams;
  const windowDays: MedAdherenceWindow =
    (ALLOWED.find((n) => String(n) === w) ?? 30) as MedAdherenceWindow;

  const user = await requireClinician();
  const [[patientRow], report] = await Promise.all([
    withAuth(user, (sql) =>
      sql`SELECT p.first_name, p.last_name FROM patient_profiles pp JOIN profiles p ON p.id = pp.profile_id WHERE pp.profile_id = ${id} LIMIT 1`
    ),
    getAdherenceReport(id, windowDays, user),
  ]);

  const p = patientRow;

  return (
    <main className="max-w-3xl mx-auto px-6 py-6 space-y-5">
      <Link
        href={`/clinician/patient/${id}/stack`}
        className="text-sm text-teal-700 inline-flex items-center gap-1"
      >
        <ChevronLeft size={14} /> Stack
      </Link>

      <header>
        <div className="text-xs uppercase tracking-wide text-slate-500">
          {p?.first_name} {p?.last_name}
        </div>
        <div className="text-xl font-semibold text-slate-900 flex items-center gap-1.5">
          <TrendingUp size={18} className="text-teal-600" /> Adherence report
        </div>
        <div className="text-[12px] text-slate-500 mt-1">
          {report.fromDate} → {report.toDate}
        </div>
      </header>

      <nav className="flex items-center gap-1">
        {ALLOWED.map((n) => (
          <Link
            key={n}
            href={`/clinician/patient/${id}/stack/adherence?window=${n}`}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border ${
              n === windowDays
                ? "bg-teal-700 text-white border-teal-700"
                : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
            }`}
          >
            {n}d
          </Link>
        ))}
        <a
          href={`/api/medications/adherence.csv?patient=${id}&window=${windowDays}`}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg border bg-white text-slate-700 border-slate-200 hover:border-teal-400 inline-flex items-center gap-1 ml-auto"
        >
          <Download size={12} /> Export CSV
        </a>
      </nav>

      <section className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Overall</div>
        <div className="text-4xl font-semibold text-slate-900 tabular-nums mt-1">
          {report.overallPct == null ? "—" : `${report.overallPct}%`}
        </div>
        <div className="text-[12px] text-slate-500 mt-1">
          {report.totalTaken} of {report.totalScheduled} scheduled doses taken
        </div>
      </section>

      <section className="space-y-3">
        <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
          Per medication
        </div>
        {report.perMed.length === 0 && (
          <div className="text-[12px] text-slate-500 italic">No medications on file.</div>
        )}
        {report.perMed.map((m) => (
          <article
            key={m.medicationId}
            className="bg-white border border-slate-200 rounded-2xl p-4"
          >
            <div className="flex items-baseline justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 truncate">
                  {m.name}
                  {m.dose && <span className="text-slate-400 font-normal"> · {m.dose}</span>}
                  {!m.active && (
                    <span className="ml-2 text-[10px] uppercase tracking-wide font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-full">
                      Paused
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500">
                  {m.taken} / {m.scheduled} taken · longest miss streak {m.longestMissedStreak}
                  {m.longestMissedStreak === 1 ? " day" : " days"}
                </div>
              </div>
              <div className={`text-2xl font-semibold tabular-nums ${pctTone(m.pct)}`}>
                {m.pct == null ? "—" : `${m.pct}%`}
              </div>
            </div>
            <div className="mt-3">
              <Heatmap days={m.days} />
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

function pctTone(pct: number | null): string {
  if (pct == null) return "text-slate-400";
  if (pct >= 90) return "text-emerald-600";
  if (pct >= 60) return "text-amber-600";
  return "text-rose-600";
}

function Heatmap({ days }: { days: { date: string; scheduled: number; taken: number }[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {days.map((d) => {
        const pct = d.scheduled === 0 ? null : d.taken / d.scheduled;
        const tone =
          pct == null
            ? "bg-slate-100 border-slate-200"
            : pct >= 1
            ? "bg-emerald-500 border-emerald-600"
            : pct >= 0.5
            ? "bg-amber-400 border-amber-500"
            : pct > 0
            ? "bg-rose-300 border-rose-400"
            : "bg-rose-500 border-rose-600";
        const title = d.scheduled === 0
          ? `${d.date}: nothing scheduled`
          : `${d.date}: ${d.taken}/${d.scheduled} taken`;
        return (
          <div
            key={d.date}
            title={title}
            className={`w-4 h-4 rounded-sm border ${tone}`}
          />
        );
      })}
    </div>
  );
}
