import Link from "next/link";
import { ChevronLeft, Pill, TrendingUp, History as HistoryIcon } from "lucide-react";
import { requireClinician } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { getStack } from "@/lib/medications";
import { checkPatientStack } from "@/lib/medications-interactions";
import { StackEditor } from "./stack-editor";

export default async function ClinicianStackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireClinician();
  const [[patientRow], pillars, stack] = await Promise.all([
    withAuth(user, (sql) =>
      sql`SELECT pp.profile_id, p.first_name, p.last_name FROM patient_profiles pp JOIN profiles p ON p.id = pp.profile_id WHERE pp.profile_id = ${id} LIMIT 1`
    ),
    withAuth(user, (sql) =>
      sql`SELECT id, name FROM pillars WHERE patient_id = ${id} AND hidden = false ORDER BY sort_order ASC`
    ),
    getStack(id, user),
  ]);
  const patient = patientRow;

  const interactions = await checkPatientStack(
    stack.map((m) => ({ id: m.id, name: m.name, active: m.active })),
  );

  if (!patient) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-6">
        <Link href="/clinician/dashboard" className="text-sm text-teal-700">&larr; Back</Link>
        <div className="mt-4 text-sm text-slate-600">Patient not found.</div>
      </main>
    );
  }

  const p = patient;
  return (
    <main className="max-w-3xl mx-auto px-6 py-6 space-y-5">
      <Link href={`/clinician/patient/${id}`} className="text-sm text-teal-700 inline-flex items-center gap-1">
        <ChevronLeft size={14} /> {p?.first_name} {p?.last_name}
      </Link>

      <header>
        <div className="text-xs uppercase tracking-wide text-slate-500">Editor</div>
        <div className="text-xl font-semibold text-slate-900 flex items-center gap-1.5">
          <Pill size={18} className="text-violet-600" /> Meds &amp; Supplements
        </div>
      </header>

      <nav className="flex gap-2">
        <Link
          href={`/clinician/patient/${id}/stack/adherence`}
          className="text-xs font-semibold bg-white text-slate-700 border border-slate-200 hover:border-teal-400 px-3 py-1.5 rounded-lg inline-flex items-center gap-1"
        >
          <TrendingUp size={12} /> Adherence report
        </Link>
        <Link
          href={`/clinician/patient/${id}/stack/history`}
          className="text-xs font-semibold bg-white text-slate-700 border border-slate-200 hover:border-teal-400 px-3 py-1.5 rounded-lg inline-flex items-center gap-1"
        >
          <HistoryIcon size={12} /> Change history
        </Link>
      </nav>

      <StackEditor
        patientId={id}
        initialStack={stack}
        pillars={pillars.map((p: any) => ({ id: p.id, name: p.name }))}
        interactions={interactions}
      />
    </main>
  );
}
