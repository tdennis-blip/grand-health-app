import Link from "next/link";
import { Heart, Zap, Brain, Bug, Dumbbell, FlaskConical, ShieldAlert, ChevronRight } from "lucide-react";
import { requirePatient } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";

type PillarKind = "cv" | "metabolic" | "neuro" | "cancer" | "physical" | "endocrine";

const PILLAR_STYLE: Record<PillarKind, { Icon: typeof Heart; gradient: string }> = {
  cv:        { Icon: Heart,        gradient: "from-rose-600 to-red-600" },
  metabolic: { Icon: Zap,          gradient: "from-amber-500 to-orange-600" },
  neuro:     { Icon: Brain,        gradient: "from-indigo-600 to-violet-700" },
  cancer:    { Icon: Bug,          gradient: "from-fuchsia-600 to-pink-700" },
  physical:  { Icon: Dumbbell,     gradient: "from-emerald-600 to-teal-600" },
  endocrine: { Icon: FlaskConical, gradient: "from-blue-600 to-cyan-600" },
};

const STATUS_DOT: Record<string, string> = {
  "on-target":  "bg-emerald-500",
  "borderline": "bg-amber-500",
  "off-target": "bg-rose-500",
};

export default async function PatientPillars() {
  const user = await requirePatient();

  // Fetch pillars + their factors in two queries, join in JS.
  const [pillarsRaw, allFactorsRaw] = await Promise.all([
    withAuth(user, (sql) =>
      sql`SELECT id, kind, name, description, sort_order, hidden FROM pillars WHERE hidden = false ORDER BY sort_order ASC`
    ),
    withAuth(user, (sql) =>
      sql`SELECT pf.id, pf.pillar_id, pf.status, pf.hidden FROM pillar_factors pf JOIN pillars p ON p.id = pf.pillar_id WHERE p.hidden = false`
    ),
  ]);

  const factorsByPillar: Record<string, any[]> = {};
  for (const f of allFactorsRaw) {
    (factorsByPillar[f.pillar_id] ?? (factorsByPillar[f.pillar_id] = [])).push(f);
  }
  const pillars = pillarsRaw.map((p: any) => ({ ...p, factors: factorsByPillar[p.id] ?? [] }));

  const allFactors = pillars.flatMap((p: any) => (p.factors ?? []).filter((f: any) => !f.hidden));
  const on = allFactors.filter((f) => f.status === "on-target").length;
  const border = allFactors.filter((f) => f.status === "borderline").length;
  const off = allFactors.filter((f) => f.status === "off-target").length;
  const total = on + border + off;

  return (
    <div className="p-5 space-y-4">
      <div>
        <div className="text-xs uppercase tracking-wide text-slate-500">Your health, by pillar</div>
        <div className="text-xl font-semibold text-slate-900 flex items-center gap-1.5">
          <ShieldAlert size={18} className="text-slate-600" /> Pillars of Health
        </div>
      </div>

      {/* Overall summary */}
      {total > 0 && (
        <div className="bg-white rounded-2xl p-4 border border-slate-200">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">Across all pillars</div>
            <div className="text-[11px] text-slate-500">{total} factor{total === 1 ? "" : "s"}</div>
          </div>
          <div className="mt-3 flex h-2.5 rounded-full overflow-hidden">
            <div className="bg-emerald-500" style={{ width: `${(on / total) * 100}%` }} />
            <div className="bg-amber-400" style={{ width: `${(border / total) * 100}%` }} />
            <div className="bg-rose-500" style={{ width: `${(off / total) * 100}%` }} />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <StatChip label="On target" value={on} dot="bg-emerald-500" />
            <StatChip label="Borderline" value={border} dot="bg-amber-500" />
            <StatChip label="Off target" value={off} dot="bg-rose-500" />
          </div>
        </div>
      )}

      {/* Pillar cards */}
      <div className="space-y-3">
        {(pillars ?? []).map((p: any) => {
          const kind = p.kind as PillarKind;
          const style = PILLAR_STYLE[kind] ?? PILLAR_STYLE.cv;
          const Icon = style.Icon;
          const factors = (p.factors ?? []).filter((f: any) => !f.hidden);
          return (
            <Link
              key={p.id}
              href={`/home/pillars/${p.id}`}
              className="block bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-md transition"
            >
              <div className="flex items-start gap-3">
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${style.gradient} flex items-center justify-center text-white flex-shrink-0`}>
                  <Icon size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-900">{p.name}</div>
                  {p.description && (
                    <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{p.description}</div>
                  )}
                  {factors.length > 0 && (
                    <div className="mt-2.5 flex items-center gap-1">
                      {factors.slice(0, 12).map((f: any, i: number) => (
                        <span key={i} className={`w-2 h-2 rounded-full ${STATUS_DOT[f.status] || "bg-slate-300"}`} />
                      ))}
                      <span className="ml-2 text-[11px] text-slate-500">
                        {factors.length} factor{factors.length === 1 ? "" : "s"}
                      </span>
                    </div>
                  )}
                </div>
                <ChevronRight size={16} className="text-slate-300 mt-1 flex-shrink-0" />
              </div>
            </Link>
          );
        })}
        {(!pillars || pillars.length === 0) && (
          <div className="text-sm text-slate-500 italic bg-white rounded-xl border border-dashed border-slate-200 p-6 text-center">
            No pillars yet. Your clinician will set them up.
          </div>
        )}
      </div>
    </div>
  );
}

function StatChip({ label, value, dot }: { label: string; value: number; dot: string }) {
  return (
    <div className="bg-slate-50 rounded-lg py-2 border border-slate-100">
      <div className="flex items-center justify-center gap-1">
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        <span className="text-[10px] uppercase tracking-wide text-slate-500">{label}</span>
      </div>
      <div className="text-lg font-semibold text-slate-900 mt-0.5">{value}</div>
    </div>
  );
}
