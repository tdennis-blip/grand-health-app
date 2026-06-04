import { requireClinician } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { Grand100LibraryClient, type LibActivity } from "./grand100-library-client";

export default async function Grand100LibraryPage() {
  const user = await requireClinician();

  const activities = await withAuth(user, (sql) =>
    sql`SELECT id, name, description, icon, accent, tier, required_vo2, required_strength_lb, required_strength_level, required_mobility_level, sort_order, hidden FROM grand100_activities ORDER BY sort_order ASC`
  );

  const initial: LibActivity[] = activities.map((a: any) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    icon: a.icon,
    accent: a.accent,
    tier: a.tier,
    requiredVo2: a.required_vo2,
    requiredStrengthLb: a.required_strength_lb ?? null,
    requiredStrengthLevel: a.required_strength_level,
    requiredMobilityLevel: a.required_mobility_level,
    sortOrder: a.sort_order ?? 0,
    hidden: !!a.hidden,
  }));

  return (
    <main className="max-w-5xl mx-auto px-6 py-6 space-y-6">
      <header>
        <div className="text-xs uppercase tracking-wide text-slate-500">Clinic library</div>
        <div className="text-xl font-semibold text-slate-900">Grand 100 activities</div>
        <div className="text-xs text-slate-500 mt-1">
          The shared list of &quot;what you want to be doing at 100&quot;. Every patient in the clinic sees these activities, with their own back-cast math layered on top.
        </div>
      </header>

      <Grand100LibraryClient initialActivities={initial} />
    </main>
  );
}
