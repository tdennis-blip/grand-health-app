"use client";

import { useState } from "react";
import Link from "next/link";
import { Zap, Clock, Stethoscope, Info, Pill } from "lucide-react";

type Status = "on-target" | "borderline" | "off-target";
type Weight = "low" | "medium" | "high";

type Factor = {
  id: string;
  name: string;
  currentValue: string | null;
  unit: string | null;
  goal: string | null;
  status: Status;
  weight: Weight;
  source: string | null;
  note: string | null;
};

type Driver = { id: string; name: string; note: string | null };
type Rec = {
  id: string;
  title: string;
  why: string | null;
  cadence: string | null;
  status: "active" | "review" | "paused";
  link: string | null;
};
type LinkedMed = {
  id: string;
  name: string;
  dose: string | null;
  kind: "medication" | "supplement";
  instructions: string | null;
};

const STATUS_DOT: Record<Status, string> = {
  "on-target":  "bg-emerald-500",
  "borderline": "bg-amber-500",
  "off-target": "bg-rose-500",
};
const STATUS_CHIP: Record<Status, string> = {
  "on-target":  "bg-emerald-50 text-emerald-700 border-emerald-200",
  "borderline": "bg-amber-50 text-amber-700 border-amber-200",
  "off-target": "bg-rose-50 text-rose-700 border-rose-200",
};
const STATUS_LABEL: Record<Status, string> = {
  "on-target":  "On target",
  "borderline": "Borderline",
  "off-target": "Off target",
};

export function PillarDetailTabs({
  clinicianNote,
  factors,
  drivers,
  recs,
  linkedMeds = [],
}: {
  clinicianNote: string | null;
  factors: Factor[];
  drivers: Driver[];
  recs: Rec[];
  linkedMeds?: LinkedMed[];
}) {
  const [tab, setTab] = useState<"actions" | "risks" | "about">("actions");

  const active = recs.filter((r) => r.status === "active");
  const review = recs.filter((r) => r.status === "review");
  // Paused recs aren't shown to the patient.

  const tabs = [
    { id: "actions", label: "Recommendations", count: active.length + review.length },
    { id: "risks",   label: "Risks",           count: factors.length },
    { id: "about",   label: "About",           count: null as number | null },
  ] as const;

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
      <div className="inline-flex bg-slate-100 rounded-xl p-1 flex-wrap gap-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`text-xs px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
              tab === t.id ? "bg-white text-slate-900 shadow-sm font-semibold" : "text-slate-600"
            }`}
          >
            {t.label}
            {t.count != null && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                tab === t.id ? "bg-teal-50 text-teal-700" : "bg-slate-200 text-slate-600"
              }`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "actions" && (
        <ActionsTab active={active} review={review} linkedMeds={linkedMeds} />
      )}

      {tab === "risks" && (
        <RisksTab factors={factors} />
      )}

      {tab === "about" && (
        <AboutTab clinicianNote={clinicianNote} drivers={drivers} />
      )}
    </section>
  );
}

// ----- Actions / recommendations -----

function ActionsTab({
  active,
  review,
  linkedMeds,
}: {
  active: Rec[];
  review: Rec[];
  linkedMeds: LinkedMed[];
}) {
  if (active.length === 0 && review.length === 0 && linkedMeds.length === 0) {
    return (
      <div className="text-sm text-slate-500 italic py-6 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
        No recommendations yet.
      </div>
    );
  }
  return (
    <div className="space-y-4 pt-2">
      {active.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1">
            <Zap size={12} /> Active · {active.length}
          </div>
          <div className="space-y-2.5">
            {active.map((r, i) => <RecCard key={r.id} rec={r} rank={i + 1} />)}
          </div>
        </div>
      )}
      {linkedMeds.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1">
            <Pill size={12} /> Meds &amp; Supplements · {linkedMeds.length}
          </div>
          <div className="space-y-2">
            {linkedMeds.map((m) => (
              <div key={m.id} className="bg-violet-50 border border-violet-200 rounded-2xl p-3 flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-violet-200 text-violet-800 flex items-center justify-center flex-shrink-0">
                  <Pill size={13} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-semibold text-slate-900 truncate">
                    {m.name}
                    {m.dose && <span className="text-slate-500 font-normal"> · {m.dose}</span>}
                  </div>
                  {m.instructions && (
                    <div className="text-[11px] text-slate-600 truncate">{m.instructions}</div>
                  )}
                </div>
                <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded-full border bg-white text-violet-700 border-violet-200">
                  {m.kind === "supplement" ? "supp" : "med"}
                </span>
              </div>
            ))}
          </div>
          <Link
            href="/home/stack"
            className="text-[11px] font-semibold text-teal-700 hover:text-teal-800 inline-flex items-center gap-1 mt-2"
          >
            Open your full list →
          </Link>
        </div>
      )}
      {review.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1">
            <Clock size={12} /> Recheck cadence
          </div>
          <div className="space-y-2.5">
            {review.map((r) => <RecCard key={r.id} rec={r} review />)}
          </div>
        </div>
      )}
      <div className="bg-teal-50 border border-teal-200 rounded-2xl p-3 flex items-start gap-2">
        <Stethoscope size={14} className="text-teal-700 mt-0.5 flex-shrink-0" />
        <div className="text-[12px] text-teal-900 leading-snug">
          These steps were prescribed by your clinician. Message your care team if any of them are no longer feasible.
        </div>
      </div>
    </div>
  );
}

function RecCard({ rec, rank, review }: { rec: Rec; rank?: number; review?: boolean }) {
  const tone = review ? "bg-slate-50 border-slate-200" : "bg-white border-slate-200";
  return (
    <div className={`rounded-2xl border ${tone} p-3.5 flex items-start gap-3`}>
      {!review && rank ? (
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-teal-600 to-emerald-500 text-white text-[11px] font-semibold flex items-center justify-center flex-shrink-0">
          {rank}
        </div>
      ) : (
        <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center flex-shrink-0">
          <Clock size={13} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="text-[13.5px] font-semibold text-slate-900 leading-snug">
            {rec.title}
          </div>
          {rec.cadence && (
            <span className="text-[10px] uppercase tracking-wide font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">
              {rec.cadence}
            </span>
          )}
        </div>
        {rec.why && (
          <div className="text-[12px] text-slate-600 leading-snug mt-1">
            <span className="text-slate-500">Why · </span>{rec.why}
          </div>
        )}
      </div>
    </div>
  );
}

// ----- Risks / factors -----

function RisksTab({ factors }: { factors: Factor[] }) {
  if (factors.length === 0) {
    return (
      <div className="text-sm text-slate-500 italic py-6 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
        No risk markers tracked for this pillar yet.
      </div>
    );
  }
  return (
    <div className="space-y-2.5 pt-2">
      {factors.map((f) => <FactorCard key={f.id} factor={f} />)}
    </div>
  );
}

function FactorCard({ factor }: { factor: Factor }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full ${STATUS_DOT[factor.status]} flex-shrink-0`} />
          <div className="text-[13.5px] font-semibold text-slate-900 truncate">{factor.name}</div>
        </div>
        <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${STATUS_CHIP[factor.status]} flex-shrink-0`}>
          {STATUS_LABEL[factor.status]}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-2">
        <Kv label="Current" value={factor.currentValue ? `${factor.currentValue}${factor.unit ? ` ${factor.unit}` : ""}` : "—"} />
        <Kv label="Goal"    value={factor.goal ?? "—"} />
      </div>
      {factor.source && (
        <div className="text-[10px] text-slate-500 mt-2">{factor.source}</div>
      )}
      {factor.note && (
        <div className="text-[12px] text-slate-700 leading-snug mt-2 bg-slate-50 rounded-lg p-2 border border-slate-100">
          {factor.note}
        </div>
      )}
    </div>
  );
}

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{label}</div>
      <div className="text-sm font-semibold text-slate-900 tabular-nums mt-0.5 truncate">{value}</div>
    </div>
  );
}

// ----- About -----

function AboutTab({ clinicianNote, drivers }: { clinicianNote: string | null; drivers: Driver[] }) {
  return (
    <div className="space-y-3 pt-2">
      {clinicianNote ? (
        <div className="bg-teal-50 border border-teal-200 rounded-2xl p-3 flex items-start gap-2">
          <Stethoscope size={14} className="text-teal-700 mt-0.5 flex-shrink-0" />
          <div>
            <div className="text-[10px] uppercase tracking-wide text-teal-800 font-semibold">From your clinician</div>
            <div className="text-[13px] text-teal-900 leading-snug mt-0.5">{clinicianNote}</div>
          </div>
        </div>
      ) : (
        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-3 flex items-start gap-2">
          <Info size={14} className="text-slate-500 mt-0.5 flex-shrink-0" />
          <div className="text-[12px] text-slate-500 leading-snug">
            Your clinician hasn&apos;t added a note for this pillar yet.
          </div>
        </div>
      )}

      {drivers.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-2">Lifestyle drivers</div>
          <div className="space-y-2">
            {drivers.map((d) => (
              <div key={d.id} className="bg-white border border-slate-200 rounded-2xl p-3">
                <div className="text-sm font-semibold text-slate-900">{d.name}</div>
                {d.note && <div className="text-[12px] text-slate-600 leading-snug mt-1">{d.note}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
