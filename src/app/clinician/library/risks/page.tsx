import { requireClinician } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { LibraryClient } from "./library-client";

export default async function RiskLibraryPage() {
  const user = await requireClinician();

  const [factors, setsRaw] = await Promise.all([
    withAuth(user, (sql) =>
      sql`SELECT id, name, unit, default_goal, weight, default_status, source, note, category FROM risk_factor_library ORDER BY category ASC, name ASC`
    ),
    withAuth(user, (sql) =>
      sql`SELECT rs.id, rs.name, rs.description, rs.pillar_kind, ri.factor_id, ri.sort_order AS item_sort FROM risk_factor_sets rs LEFT JOIN risk_factor_set_items ri ON ri.set_id = rs.id ORDER BY rs.name ASC, ri.sort_order ASC`
    ),
  ]);

  // Group set items by set id
  const setMap = new Map<string, any>();
  for (const row of setsRaw) {
    if (!setMap.has(row.id)) setMap.set(row.id, { ...row, items: [] });
    if (row.factor_id) setMap.get(row.id).items.push({ factor_id: row.factor_id, sort_order: row.item_sort });
  }
  const sets = Array.from(setMap.values());

  return (
    <main className="max-w-5xl mx-auto px-6 py-6 space-y-6">
      <header>
        <div className="text-xs uppercase tracking-wide text-slate-500">Clinic library</div>
        <div className="text-xl font-semibold text-slate-900">Risk factors</div>
        <div className="text-xs text-slate-500 mt-1">
          Reusable risk-factor definitions and saved sets. Used by the &quot;Add risk&quot; picker on every patient&apos;s pillar.
        </div>
      </header>

      <LibraryClient
        initialFactors={factors.map((f) => ({
          id: f.id,
          name: f.name,
          unit: f.unit,
          defaultGoal: f.default_goal,
          weight: f.weight as "low" | "medium" | "high",
          defaultStatus: f.default_status as "on-target" | "borderline" | "off-target",
          source: f.source,
          note: f.note,
          category: f.category,
        }))}
        initialSets={sets.map((s: any) => ({
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
