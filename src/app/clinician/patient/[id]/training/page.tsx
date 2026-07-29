import Link from "next/link";
import { notFound } from "next/navigation";
import { requireClinician } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { canAccessPatient } from "@/lib/care-team";
import { TrainingHub } from "./training-hub";

export default async function PatientTrainingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireClinician();
  const access = await canAccessPatient(user, id);

  const [patient] = await withAuth(user, (sql) =>
    sql`SELECT first_name, last_name FROM profiles WHERE id = ${id} LIMIT 1`
  );
  if (!patient || !access) notFound();

  const [zones, patientSessions, genericSessions, patientPrograms, genericPrograms, assignments, hasGenericZones] =
    await Promise.all([
      withAuth(user, (sql) =>
        sql`SELECT id, zone_key, name, short_name, low_bpm, high_bpm, sort_order FROM hr_zones WHERE patient_id = ${id} ORDER BY sort_order ASC`
      ),
      withAuth(user, (sql) =>
        sql`SELECT id, kind, name, focus, est_minutes FROM session_library WHERE patient_id = ${id} ORDER BY kind ASC, name ASC`
      ),
      withAuth(user, (sql) =>
        sql`SELECT id, kind, name FROM session_library WHERE patient_id IS NULL AND clinic_id = ${user.clinicId} ORDER BY kind ASC, name ASC`
      ),
      withAuth(user, (sql) =>
        sql`SELECT id, name, description FROM program_library WHERE patient_id = ${id} ORDER BY name ASC`
      ),
      withAuth(user, (sql) =>
        sql`SELECT id, name FROM program_library WHERE patient_id IS NULL AND clinic_id = ${user.clinicId} ORDER BY name ASC`
      ),
      withAuth(user, (sql) =>
        sql`SELECT pa.id, pa.program_id, pa.ended_at, pl.name AS program_name
            FROM program_assignments pa JOIN program_library pl ON pl.id = pa.program_id
            WHERE pa.patient_id = ${id} ORDER BY pa.assigned_at DESC`
      ),
      withAuth(user, (sql) =>
        sql`SELECT 1 AS x FROM hr_zones WHERE patient_id IS NULL AND clinic_id = ${user.clinicId} LIMIT 1`
      ),
    ]);

  const name = `${patient.first_name ?? ""} ${patient.last_name ?? ""}`.trim() || "Patient";

  return (
    <main className="max-w-3xl mx-auto px-6 py-6 space-y-5">
      <Link href={`/clinician/patient/${id}`} className="text-sm text-teal-700 hover:text-teal-800">&larr; Back to patient</Link>
      <header>
        <div className="text-xs uppercase tracking-wide text-slate-500">Training programs</div>
        <div className="text-xl font-semibold text-slate-900">{name}</div>
        <div className="text-xs text-slate-500 mt-1">Build this patient&apos;s own HR zones, sessions, and programs — or clone from the clinic templates and customize.</div>
      </header>

      <TrainingHub
        patientId={id}
        zones={(zones as any[]).map((z) => ({ id: z.id, zoneKey: z.zone_key, name: z.name, shortName: z.short_name, lowBpm: z.low_bpm, highBpm: z.high_bpm }))}
        hasGenericZones={(hasGenericZones as any[]).length > 0}
        patientSessions={(patientSessions as any[]).map((s) => ({ id: s.id, kind: s.kind, name: s.name, focus: s.focus, estMinutes: s.est_minutes }))}
        genericSessions={(genericSessions as any[]).map((s) => ({ id: s.id, kind: s.kind, name: s.name }))}
        patientPrograms={(patientPrograms as any[]).map((p) => ({ id: p.id, name: p.name, description: p.description }))}
        genericPrograms={(genericPrograms as any[]).map((p) => ({ id: p.id, name: p.name }))}
        assignments={(assignments as any[]).map((a) => ({ id: a.id, programId: a.program_id, programName: a.program_name, ended: a.ended_at != null }))}
      />
    </main>
  );
}
