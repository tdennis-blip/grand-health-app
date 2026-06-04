"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, Save, BookOpen, Layers, FilePlus, Search, Activity } from "lucide-react";
import {
  addBlankFactor,
  addFactorFromLibrary,
  applyFactorSet,
  saveCurrentFactorsAsSet,
} from "./actions";

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

export function RiskActions({
  patientId,
  pillarId,
  pillarName,
  visibleFactorCount,
  libraryFactors,
  librarySets,
  currentPillarKind,
}: {
  patientId: string;
  pillarId: string;
  pillarName: string;
  visibleFactorCount: number;
  libraryFactors: LibFactor[];
  librarySets: LibSet[];
  currentPillarKind: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const onSaveAsSet = () => {
    const name = window.prompt(`Save current ${pillarName} risks as a reusable set. Set name?`)?.trim();
    if (!name) return;
    const description = window.prompt("Optional description (leave blank to skip).")?.trim() || null;
    startTransition(async () => {
      try {
        await saveCurrentFactorsAsSet({ patientId, pillarId, name, description });
      } catch (e: any) {
        alert(e.message ?? "Failed to save set");
      }
    });
  };

  return (
    <>
      <div className="flex items-center gap-2 flex-shrink-0">
        {visibleFactorCount > 0 && (
          <button
            onClick={onSaveAsSet}
            disabled={pending}
            className="text-xs font-semibold text-teal-700 bg-white border border-teal-200 px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-teal-50"
            title="Save these risks as a reusable set"
          >
            <Save size={12} /> Save as set
          </button>
        )}
        <button
          onClick={() => setOpen(true)}
          className="text-xs font-semibold bg-teal-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-teal-800"
        >
          <Plus size={13} /> Add risk
        </button>
      </div>

      {open && (
        <AddRiskDrawer
          patientId={patientId}
          pillarId={pillarId}
          pillarName={pillarName}
          libraryFactors={libraryFactors}
          librarySets={librarySets}
          currentPillarKind={currentPillarKind}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function AddRiskDrawer({
  patientId,
  pillarId,
  pillarName,
  libraryFactors,
  librarySets,
  currentPillarKind,
  onClose,
}: {
  patientId: string;
  pillarId: string;
  pillarName: string;
  libraryFactors: LibFactor[];
  librarySets: LibSet[];
  currentPillarKind: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"library" | "sets" | "custom">("library");
  const [search, setSearch] = useState("");
  const [pending, startTransition] = useTransition();

  const filteredFactors = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return libraryFactors;
    return libraryFactors.filter((f) =>
      (f.name || "").toLowerCase().includes(q) ||
      (f.category || "").toLowerCase().includes(q) ||
      (f.unit || "").toLowerCase().includes(q)
    );
  }, [libraryFactors, search]);

  const relevantSets = librarySets.filter((s) => !s.pillarKind || s.pillarKind === currentPillarKind);
  const otherSets = librarySets.filter((s) => s.pillarKind && s.pillarKind !== currentPillarKind);

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/50 z-50" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-white shadow-2xl z-50 flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <div className="text-base font-semibold text-slate-900">Add risk to {pillarName}</div>
            <div className="text-xs text-slate-500">Pick from the clinic library, apply a saved set, or add custom.</div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700 text-sm">Close</button>
        </div>

        <div className="px-5 pt-4">
          <div className="inline-flex bg-slate-100 rounded-xl p-1 flex-wrap gap-1">
            {[
              { id: "library", label: "Pick factor",  Icon: BookOpen,  count: libraryFactors.length },
              { id: "sets",    label: "Apply a set",  Icon: Layers,    count: librarySets.length },
              { id: "custom",  label: "Custom",       Icon: FilePlus },
            ].map((t) => {
              const Icon = t.Icon;
              const active = tab === (t.id as any);
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id as any)}
                  className={`text-xs px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
                    active ? "bg-white text-slate-900 shadow-sm font-semibold" : "text-slate-600"
                  }`}
                >
                  {Icon && <Icon size={12} />}
                  {t.label}
                  {t.count != null && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      active ? "bg-teal-50 text-teal-700" : "bg-slate-200 text-slate-600"
                    }`}>{t.count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {tab === "library" && (
            <>
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <Search size={14} className="text-slate-400" />
                <input
                  className="flex-1 bg-transparent text-sm outline-none"
                  placeholder="Search factors…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {filteredFactors.length === 0 ? (
                <div className="text-sm text-slate-500 italic py-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  No factors match. Try a different search, or add a custom one.
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredFactors.map((f) => (
                    <button
                      key={f.id}
                      disabled={pending}
                      onClick={() => {
                        startTransition(async () => {
                          await addFactorFromLibrary({ patientId, pillarId, libraryFactorId: f.id });
                          onClose();
                        });
                      }}
                      className="w-full text-left bg-white border border-slate-200 rounded-xl px-3 py-2.5 flex items-center gap-3 hover:border-teal-300 transition disabled:opacity-60"
                    >
                      <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0">
                        <Activity size={15} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-900 truncate flex items-center gap-1.5">
                          {f.name}
                          {f.category && (
                            <span className="text-[10px] uppercase tracking-wide font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-full">
                              {f.category}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          Goal {f.defaultGoal || "—"} · {f.unit || "—"} · {f.source || "—"}
                        </div>
                      </div>
                      <Plus size={14} className="text-teal-700 flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === "sets" && (
            <>
              {relevantSets.length === 0 && otherSets.length === 0 ? (
                <div className="text-sm text-slate-500 italic py-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  No saved sets yet. Build a panel for a patient and click &quot;Save as set&quot; to make it reusable.
                </div>
              ) : (
                <>
                  {relevantSets.length > 0 && (
                    <>
                      <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">For {pillarName}</div>
                      <div className="space-y-2">
                        {relevantSets.map((s) => (
                          <SetRow
                            key={s.id}
                            set={s}
                            factors={libraryFactors}
                            pending={pending}
                            onApply={() => {
                              startTransition(async () => {
                                await applyFactorSet({ patientId, pillarId, setId: s.id });
                                onClose();
                              });
                            }}
                          />
                        ))}
                      </div>
                    </>
                  )}
                  {otherSets.length > 0 && (
                    <>
                      <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mt-4">Other pillars</div>
                      <div className="space-y-2">
                        {otherSets.map((s) => (
                          <SetRow
                            key={s.id}
                            set={s}
                            factors={libraryFactors}
                            pending={pending}
                            muted
                            onApply={() => {
                              startTransition(async () => {
                                await applyFactorSet({ patientId, pillarId, setId: s.id });
                                onClose();
                              });
                            }}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          )}

          {tab === "custom" && (
            <div className="space-y-3">
              <div className="text-[11px] text-slate-500 leading-snug">
                Adds a blank factor to {pillarName} that you can fill in inline. Use this for one-off markers — anything you&apos;ll reuse should go through the library instead.
              </div>
              <button
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    await addBlankFactor({ patientId, pillarId });
                    onClose();
                  });
                }}
                className="w-full text-sm font-semibold bg-teal-700 text-white px-4 py-2.5 rounded-lg hover:bg-teal-800 flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <Plus size={14} /> Add a blank custom factor
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function SetRow({
  set,
  factors,
  pending,
  muted,
  onApply,
}: {
  set: LibSet;
  factors: LibFactor[];
  pending: boolean;
  muted?: boolean;
  onApply: () => void;
}) {
  const setFactors = set.factorIds
    .map((id) => factors.find((f) => f.id === id))
    .filter(Boolean) as LibFactor[];
  const namePreview = setFactors.slice(0, 4).map((f) => f.name).join(", ");
  const more = Math.max(0, setFactors.length - 4);
  return (
    <button
      disabled={pending}
      onClick={onApply}
      className={`w-full text-left rounded-xl px-3 py-3 flex items-start gap-3 transition border hover:border-teal-300 disabled:opacity-60 ${
        muted ? "bg-slate-50 border-slate-200 opacity-90" : "bg-white border-slate-200"
      }`}
    >
      <div className="w-9 h-9 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center flex-shrink-0">
        <Layers size={15} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-900 truncate">{set.name}</div>
        {set.description && <div className="text-[11px] text-slate-500 leading-snug">{set.description}</div>}
        <div className="text-[11px] text-slate-500 mt-1">
          {setFactors.length} factor{setFactors.length === 1 ? "" : "s"}{namePreview ? ` · ${namePreview}` : ""}{more > 0 ? ` +${more} more` : ""}
        </div>
      </div>
      <Plus size={14} className="text-teal-700 mt-1 flex-shrink-0" />
    </button>
  );
}
