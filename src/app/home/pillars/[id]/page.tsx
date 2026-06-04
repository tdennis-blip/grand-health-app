import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Heart, Zap, Brain, Bug, Dumbbell, FlaskConical } from "lucide-react";
import { requirePatient } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { PillarDetailTabs } from "./pillar-detail-tabs";
import { getMedicationsForPillar } from "@/lib/medications";

type PillarKind = "cv" | "metabolic" | "neuro" | "cancer" | "physical" | "endocrine";

const PILLAR_STYLE: Record<PillarKind, { Icon: typeof Heart; gradient: string }> = {
  cv:        { Icon: Heart,        gradient: "from-rose-600 to-red-600" },
  metabolic: { Icon: Zap,          gradient: "from-amber-500 to-orange-600" },
  neuro:     { Icon: Brain,        gradient: "from-indigo-600 to-violet-700" },
  cancer:    { Icon: Bug,          gradient: "from-fuchsia-600 to-pink-700" },
  physical:  { Icon: Dumbbell,     gradient: "from-emerald-600 to-teal-600" },
  endocrine: { Icon: FlaskConical, gradient: "from-blue-600 to-cyan-600" },
};

export default async function PatientPillarDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePatient();

  const [pillar] = await withAuth(user, (sql) =>
    sql`SELECT id, kind, name, description, clinician_note, hidden FROM pillars WHERE id = ${id} LIMIT 1`
  );

  if (!pillar || pillar.hidden) notFound();

  const [factors, drivers, recs, linkedMeds] = await Promise.all([
    withAuth(user, (sql) =>
      sql`SELECT id, name, current_value, unit, goal, status, weight, source, note, hidden, sort_order FROM pillar_factors WHERE pillar_id = ${id} AND hidden = false ORDER BY sort_order ASC`
    ),
    withAuth(user, (sql) =>
      sql`SELECT id, name, note, hidden, sort_order FROM lifestyle_drivers WHERE pillar_id = ${id} AND hidden = false ORDER BY sort_order ASC`
    ),
    withAuth(user, (sql) =>
      sql`SELECT id, title, why, cadence, status, link, hidden, sort_order FROM pillar_recommendations WHERE pillar_id = ${id} AND hidden = false ORDER BY sort_order ASC`
    ),
    getMedicationsForPillar(id, user),
  ]);

  const kind = pillar.kind as PillarKind;
  const style = PILLAR_STYLE[kind] ?? PILLAR_STYLE.cv;

  // Compute a simple risk level from factor statuses.
  const off = factors.filter((f) => f.status === "off-target").length;
  const border = factors.filter((f) => f.status === "borderline").length;
  const on = factors.filter((f) => f.status === "on-target").length;
  const total = off + border + on;
  const risk = off > 0
    ? { level: "Elevated", chip: "bg-rose-50 text-rose-700 border-rose-200" }
    : border > 0
    ? { level: "Moderate", chip: "bg-amber-50 text-amber-700 border-amber-200" }
    : { level: "Low", chip: "bg-emerald-50 text-emerald-700 border-emerald-200" };

  return (
    <main className="p-5 space-y-4 pb-6">
      <Link href="/home/pillars" className="text-sm text-teal-700 inline-flex items-center gap-1">
        <ChevronLeft size={14} /> All pillars
      </Link>

      {/* Hero */}
      <div className={`rounded-3xl p-5 text-white bg-gradient-to-br ${style.gradient}`}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <style.Icon size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-wide opacity-90">Pillar</div>
            <div className="text-xl font-semibold leading-tight">{pillar.name}</div>
          </div>
          {total > 0 && (
            <span className={`text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full border ${risk.chip} flex-shrink-0`}>
              {risk.level}
            </span>
          )}
        </div>
        {pillar.description && (
          <div className="text-[12px] opacity-90 mt-3 leading-snug">{pillar.description}</div>
        )}
        {total > 0 && (
          <div className="mt-3 flex h-2 rounded-full overflow-hidden bg-white/20">
            <div className="bg-emerald-400" style={{ width: `${(on / total) * 100}%` }} />
            <div className="bg-amber-300" style={{ width: `${(border / total) * 100}%` }} />
            <div className="bg-rose-400" style={{ width: `${(off / total) * 100}%` }} />
          </div>
        )}
      </div>

      <PillarDetailTabs
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
        }))}
        drivers={drivers.map((d) => ({ id: d.id, name: d.name, note: d.note }))}
        recs={recs.map((r) => ({
          id: r.id,
          title: r.title,
          why: r.why,
          cadence: r.cadence,
          status: r.status as "active" | "review" | "paused",
          link: r.link,
        }))}
        linkedMeds={linkedMeds.map((m) => ({
          id: m.id,
          name: m.name,
          dose: m.dose,
          kind: m.kind,
          instructions: m.instructions,
        }))}
      />
    </main>
  );
}
