import Link from "next/link";
import { notFound } from "next/navigation";
import { requireClinician } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { PillarTabs } from "./pillar-tabs";

export default async function PillarEditPage({
  params,
}: {
  params: Promise<{ id: string; pillarId: string }>;
}) {
  const { id, pillarId } = await params;
  const user = await requireClinician();

  const [pillar] = await withAuth(user, (sql) =>
    sql`SELECT id, patient_id, kind, name, description, clinician_note FROM pillars WHERE id = ${pillarId} LIMIT 1`
  );

  if (!pillar || pillar.patient_id !== id) notFound();

  const [patient, factors, drivers, recs, libFactors, libSetsRaw] = await Promise.all([
    withAuth(user, (sql) =>
      sql`SELECT first_name, last_name FROM profiles WHERE id = ${id} LIMIT 1`
    ).then((rows) => rows[0] ?? null),
    withAuth(user, (sql) =>
      sql`SELECT id, name, current_value, unit, goal, status, weight, source, note, hidden, sort_order FROM pillar_factors WHERE pillar_id = ${pillarId} ORDER BY sort_order ASC`
    ),
    withAuth(user, (sql) =>
      sql`SELECT id, name, note, hidden, sort_order FROM lifestyle_drivers WHERE pillar_id = ${pillarId} ORDER BY sort_order ASC`
    ),
    withAuth(user, (sql) =>
      sql`SELECT id, title, why, cadence, status, link, hidden, sort_order FROM pillar_recommendations WHERE pillar_id = ${pillarId} ORDER BY sort_order ASC`
    ),
    withAuth(user, (sql) =>
      sql`SELECT id, name, unit, default_goal, weight, default_status, source, category FROM risk_factor_library ORDER BY category ASC, name ASC`
    ),
    withAuth(user, (sql) =>
      sql`SELECT rs.id, rs.name, rs.description, rs.pillar_kind, ri.factor_id, ri.sort_order AS item_sort FROM risk_factor_sets rs LEFT JOIN risk_factor_set_items ri ON ri.set_id = rs.id ORDER BY rs.name ASC, ri.sort_order ASC`
    ),
  ]);

  const setMap = new Map<string, any>();
  for (const row of libSetsRaw) {
    if (!setMap.has(row.id)) setMap.set(row.id, { ...row, items: [] });
    if (row.factor_id) setMap.get(row.id).items.push({ factor_id: row.factor_id, sort_order: row.item_sort });
  }
  const libSets = Array.from(setMap.values());

  return (
    <main className="max-w-3xl mx-auto px-6 py-6 space-y-6">
      <Link
        href={`/clinician/patient/${id}`}
        className="text-sm text-teal-700 hover:text-teal-800 inline-flex items-center gap-1"
      >
        &larr; Back to {patient?.first_name ?? "patient"}
      </Link>

      <header>
        <div className="text-xs uppercase tracking-wide text-slate-500">
          {patient?.first_name} {patient?.last_name} · Pillar
        </div>
        <div className="text-xl font-semibold text-slate-900">{pillar.name}</div>
      </header>

      <PillarTabs
        patientId={id}
        pillarId={pillarId}
        pillarName={pillar.name}
        pillarKind={pillar.kind}
        description={pillar.description}
        clinicianNote={pillar.clinician_note}
        factors={factors.map((f) => ({
          id: f.id,
          name: f.name,
          currentValue: f.current_value,
          unit: f.unit,
          goal: f.goal,
          status: f.status as "on-target" | "borderline" | "off-target",
          weight: f.weight as "low" | "medium" | "high",
          source: f.source,
          note: f.note,
          hidden: f.hidden,
        }))}
        drivers={drivers.map((d) => ({
          id: d.id,
          name: d.name,
          note: d.note,
          hidden: d.hidden,
        }))}
        recs={recs.map((r) => ({
          id: r.id,
          title: r.title,
          why: r.why,
          cadence: r.cadence,
          status: r.status as "active" | "review" | "paused",
          link: r.link,
          hidden: r.hidden,
        }))}
        libraryFactors={libFactors.map((f) => ({
          id: f.id,
          name: f.name,
          unit: f.unit,
          defaultGoal: f.default_goal,
          category: f.category,
          source: f.source,
        }))}
        librarySets={libSets.map((s: any) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          pillarKind: s.pillar_kind,
          factorIds: (s.items ?? [])
            .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
            .map((it: any) => it.factor_id),
        }))}
      />
    </main>
  );
}
