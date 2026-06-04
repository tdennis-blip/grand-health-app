"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { PillarNoteEditor } from "./pillar-note-editor";
import { FactorRow, type Factor } from "./factor-row";
import { RiskActions } from "./risk-actions";
import { DriverRow, type Driver } from "./driver-row";
import { RecRow, type Recommendation } from "./rec-row";
import { addBlankDriver, addBlankRec } from "./actions";

type LibFactor = {
  id: string;
  name: string;
  unit: string | null;
  defaultGoal: string | null;
  category: string | null;
  source: string | null;
};

type LibSet = {
  id: string;
  name: string;
  description: string | null;
  pillarKind: string | null;
  factorIds: string[];
};

export function PillarTabs({
  patientId,
  pillarId,
  pillarName,
  pillarKind,
  description,
  clinicianNote,
  factors,
  drivers,
  recs,
  libraryFactors,
  librarySets,
}: {
  patientId: string;
  pillarId: string;
  pillarName: string;
  pillarKind: string;
  description: string | null;
  clinicianNote: string | null;
  factors: Factor[];
  drivers: Driver[];
  recs: Recommendation[];
  libraryFactors: LibFactor[];
  librarySets: LibSet[];
}) {
  const [tab, setTab] = useState<"risks" | "drivers" | "recs" | "note">("risks");

  const tabs: ReadonlyArray<{
    id: "risks" | "drivers" | "recs" | "note";
    label: string;
    count?: number;
  }> = [
    { id: "risks",   label: "Risks",           count: factors.length },
    { id: "drivers", label: "Lifestyle drivers", count: drivers.length },
    { id: "recs",    label: "Recommendations", count: recs.length },
    { id: "note",    label: "Clinician note" },
  ];

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
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

      {tab === "risks" && (
        <RisksTab
          patientId={patientId}
          pillarId={pillarId}
          pillarName={pillarName}
          pillarKind={pillarKind}
          factors={factors}
          libraryFactors={libraryFactors}
          librarySets={librarySets}
        />
      )}
      {tab === "drivers" && (
        <DriversTab patientId={patientId} pillarId={pillarId} drivers={drivers} />
      )}
      {tab === "recs" && (
        <RecsTab patientId={patientId} pillarId={pillarId} recs={recs} />
      )}
      {tab === "note" && (
        <div className="pt-2">
          <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
            Description &amp; clinician note
          </div>
          <div className="text-[11px] text-slate-500 mb-3">
            Both are visible to the patient inside this pillar.
          </div>
          <PillarNoteEditor
            patientId={patientId}
            pillarId={pillarId}
            description={description}
            clinicianNote={clinicianNote}
          />
        </div>
      )}
    </section>
  );
}

// ----- Tabs -----

function RisksTab({
  patientId,
  pillarId,
  pillarName,
  pillarKind,
  factors,
  libraryFactors,
  librarySets,
}: {
  patientId: string;
  pillarId: string;
  pillarName: string;
  pillarKind: string;
  factors: Factor[];
  libraryFactors: LibFactor[];
  librarySets: LibSet[];
}) {
  const visibleCount = factors.filter((f) => !f.hidden).length;
  return (
    <>
      <div className="flex items-center justify-between gap-2 pt-2">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Risks / factors</div>
          <div className="text-[11px] text-slate-500">
            Order = priority. Top of the list shows first in the patient app.
          </div>
        </div>
        <RiskActions
          patientId={patientId}
          pillarId={pillarId}
          pillarName={pillarName}
          visibleFactorCount={visibleCount}
          libraryFactors={libraryFactors}
          librarySets={librarySets}
          currentPillarKind={pillarKind}
        />
      </div>

      {factors.length === 0 ? (
        <div className="text-sm text-slate-500 italic py-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
          No risks yet. Click &quot;Add risk&quot; to start tracking markers.
        </div>
      ) : (
        <div className="space-y-2">
          {factors.map((f, idx) => (
            <FactorRow
              key={f.id}
              factor={f}
              index={idx}
              total={factors.length}
              patientId={patientId}
              pillarId={pillarId}
            />
          ))}
        </div>
      )}
    </>
  );
}

function DriversTab({
  patientId,
  pillarId,
  drivers,
}: {
  patientId: string;
  pillarId: string;
  drivers: Driver[];
}) {
  const [pending, startTransition] = useTransition();
  return (
    <>
      <div className="flex items-center justify-between gap-2 pt-2">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Lifestyle drivers</div>
          <div className="text-[11px] text-slate-500">Modifiable behaviors that move this pillar&apos;s risk up or down.</div>
        </div>
        <button
          onClick={() => startTransition(() => addBlankDriver({ patientId, pillarId }))}
          disabled={pending}
          className={`text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1 ${
            pending ? "bg-slate-200 text-slate-500" : "bg-teal-700 text-white hover:bg-teal-800"
          }`}
        >
          <Plus size={13} /> {pending ? "Adding…" : "Add driver"}
        </button>
      </div>

      {drivers.length === 0 ? (
        <div className="text-sm text-slate-500 italic py-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
          No lifestyle drivers configured for this pillar yet.
        </div>
      ) : (
        <div className="space-y-2">
          {drivers.map((d, idx) => (
            <DriverRow
              key={d.id}
              driver={d}
              index={idx}
              total={drivers.length}
              patientId={patientId}
              pillarId={pillarId}
            />
          ))}
        </div>
      )}
    </>
  );
}

function RecsTab({
  patientId,
  pillarId,
  recs,
}: {
  patientId: string;
  pillarId: string;
  recs: Recommendation[];
}) {
  const [pending, startTransition] = useTransition();
  return (
    <>
      <div className="flex items-center justify-between gap-2 pt-2">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Recommendations</div>
          <div className="text-[11px] text-slate-500">Actionable steps shown to the patient. Reorder to prioritize.</div>
        </div>
        <button
          onClick={() => startTransition(() => addBlankRec({ patientId, pillarId }))}
          disabled={pending}
          className={`text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1 ${
            pending ? "bg-slate-200 text-slate-500" : "bg-teal-700 text-white hover:bg-teal-800"
          }`}
        >
          <Plus size={13} /> {pending ? "Adding…" : "Add recommendation"}
        </button>
      </div>

      {recs.length === 0 ? (
        <div className="text-sm text-slate-500 italic py-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
          No recommendations yet.
        </div>
      ) : (
        <div className="space-y-2">
          {recs.map((r, idx) => (
            <RecRow
              key={r.id}
              rec={r}
              index={idx}
              total={recs.length}
              patientId={patientId}
              pillarId={pillarId}
            />
          ))}
        </div>
      )}
    </>
  );
}
