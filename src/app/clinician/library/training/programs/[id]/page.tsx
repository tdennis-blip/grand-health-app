import Link from "next/link";
import { notFound } from "next/navigation";
import { requireClinician } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { ProgramEditor } from "./program-editor";

export default async function ProgramEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireClinician();

  const [program] = await withAuth(user, (sql) =>
    sql`SELECT id, name, description FROM program_library WHERE id = ${id} LIMIT 1`
  );
  if (!program) notFound();

  const [days, sessions] = await Promise.all([
    withAuth(user, (sql) => sql`SELECT id, day, session_id, sort_order FROM program_days WHERE program_id = ${id} AND session_id IS NOT NULL ORDER BY sort_order ASC`),
    withAuth(user, (sql) =>
      sql`SELECT id, kind, name, est_minutes, duration_min, rounds, work_min FROM session_library ORDER BY kind ASC, name ASC`
    ),
  ]);

  const dayMap: Record<string, { rowId: string; sessionId: string }[]> = {
    mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [],
  };
  days.forEach((d: any) => {
    if (d.session_id) dayMap[d.day].push({ rowId: d.id, sessionId: d.session_id });
  });

  return (
    <main className="max-w-4xl mx-auto px-6 py-6 space-y-6">
      <Link
        href="/clinician/library/training/programs"
        className="text-sm text-teal-700 hover:text-teal-800 inline-flex items-center gap-1"
      >
        &larr; Back to programs
      </Link>

      <ProgramEditor
        programId={program.id}
        initial={{ name: program.name, description: program.description }}
        initialDays={dayMap}
        sessions={sessions.map((s: any) => ({
          id: s.id,
          kind: s.kind as "strength" | "zone2" | "vo2max" | "mobility",
          name: s.name,
          estMinutes: s.est_minutes,
          durationMin: s.duration_min,
          rounds: s.rounds,
          workMin: s.work_min,
        }))}
      />
    </main>
  );
}
