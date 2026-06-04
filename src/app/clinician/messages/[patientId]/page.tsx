import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { requireClinician } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { getThread, getThreadParticipants } from "@/lib/messages";
import { ClinicianThreadClient } from "./thread-client";

export default async function ClinicianThreadPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const user = await requireClinician();

  const [[patient], messages, participants, cliniciansRaw] = await Promise.all([
    withAuth(user, (sql) => sql`SELECT first_name, last_name, email FROM profiles WHERE id = ${patientId} LIMIT 1`),
    getThread(patientId),
    getThreadParticipants(patientId),
    withAuth(user, (sql) => sql`SELECT id, first_name, last_name FROM profiles WHERE clinic_id = ${user.clinicId} AND role = 'clinician'`),
  ]);

  const clinicians = cliniciansRaw.map((c: any) => ({
    id: c.id,
    firstName: c.first_name,
    lastName: c.last_name,
  }));

  const patientName = `${patient?.first_name ?? ""} ${patient?.last_name ?? ""}`.trim() || "Patient";

  return (
    <main className="max-w-3xl mx-auto px-6 py-6 space-y-4">
      <Link
        href="/clinician/messages"
        className="text-xs text-slate-500 hover:text-slate-900 inline-flex items-center gap-1"
      >
        <ArrowLeft size={12} /> Inbox
      </Link>
      <header>
        <div className="text-xs uppercase tracking-wide text-slate-500">Thread</div>
        <div className="text-xl font-semibold text-slate-900">{patientName}</div>
        {patient?.email && <div className="text-[11px] text-slate-500">{patient.email}</div>}
      </header>

      <ClinicianThreadClient
        meId={user.id}
        patientId={patientId}
        clinicians={clinicians}
        initialMessages={messages}
        initialParticipants={participants}
      />
    </main>
  );
}
