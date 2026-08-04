import Link from "next/link";
import { requireClinician } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { getModalityCalendar, getExercise1RMSeries } from "@/lib/training-analytics";
import { TrainingMonitor } from "./training-monitor";

export default async function PatientMonitoringPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireClinician();

  const [[patient], calendar, oneRmSeries] = await Promise.all([
    withAuth(user, (sql) =>
      sql`SELECT first_name, last_name FROM profiles WHERE id = ${id} LIMIT 1`
    ),
    getModalityCalendar(user, id, 4),
    getExercise1RMSeries(user, id),
  ]);

  const patientName = patient
    ? `${patient.first_name ?? ""} ${patient.last_name ?? ""}`.trim()
    : "Patient";

  return (
    <main className="max-w-3xl mx-auto px-6 py-6 space-y-6">
      <Link href={`/clinician/patient/${id}`} className="text-sm text-teal-700 hover:text-teal-800 inline-flex items-center gap-1">
        &larr; Back to patient
      </Link>
      <header>
        <div className="text-xs uppercase tracking-wide text-slate-500">Training monitoring</div>
        <div className="text-xl font-semibold text-slate-900">{patientName}</div>
        <div className="text-xs text-slate-500 mt-1">Prescribed vs. completed sessions by modality, with per-session detail and strength trends.</div>
      </header>

      <TrainingMonitor days={calendar.days} hasProgram={calendar.hasProgram} exercises={oneRmSeries} />
    </main>
  );
}
