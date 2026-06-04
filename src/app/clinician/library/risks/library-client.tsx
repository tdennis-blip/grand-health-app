"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, Trash2, Layers, Activity } from "lucide-react";
import { createFactor, updateFactor, deleteFactor, createSet, updateSet, deleteSet } from "./actions";

type Status = "on-target" | "borderline" | "off-target";
type Weight = "low" | "medium" | "high";
type PillarKind = "cv" | "metabolic" | "neuro" | "cancer" | "physical" | "endocrine";

export type LibFactor = {
  id: string;
  name: string;
  unit: string | null;
  defaultGoal: string | null;
  weight: Weight;
  defaultStatus: Status;
  source: string | null;
  note: string | null;
  category: string | null;
};

export type LibSet = {
  id: string;
  name: string;
  description: string | null;
  pillarKind: PillarKind | null;
  factorIds: string[];
};

const STATUS_OPTIONS: { id: Status; label: string }[] = [
  { id: "off-target",  label: "Off target" },
  { id: "borderline",  label: "Borderline" },
  { id: "on-target",   label: "On target" },
];
const WEIGHT_OPTIONS: { id: Weight; label: string }[] = [
  { id: "high",   label: "High priority" },
  { id: "medium", label: "Medium priority" },
  { id: "low",    label: "Low priority" },
];
const PILLAR_OPTIONS: { id: PillarKind | ""; label: string }[] = [
  { id: "",         label: "Any pillar" },
  { id: "cv",       label: "Cardiovascular" },
  { id: "metabolic",label: "Metabolic" },
  { id: "neuro",    label: "Neurodegenerative" },
  { id: "cancer",   label: "Cancer" },
  { id: "physical", label: "Physical" },
  { id: "endocrine",label: "Endocrine" },
];

export function LibraryClient({
  initialFactors,
  initialSets,
}: {
  initialFactors: LibFactor[];
  initialSets: LibSet[];
}) {
  const [tab, setTab] = useState<"factors" | "sets">("factors");
  const [pending, startTransition] = useTransition();
  const [editingFactor, setEditingFactor] = useState<LibFactor | null>(null);
  const [editingSet, setEditingSet] = useState<LibSet | null>(null);

  // Group factors by category for the sets editor checklist.
  const grouped = useMemo(() => {
    const out: Record<string, LibFactor[]> = {};
    initialFactors.forEach((f) => {
      const cat = f.category || "Uncategorized";
      if (!out[cat]) out[cat] = [];
      out[cat].push(f);
    });
    return out;
  }, [initialFactors]);

  return (
    <>
      <div className="inline-flex bg-slate-100 rounded-xl p-1">
        {[
          { id: "factors", label: "Factors", count: initialFactors.length },
          { id: "sets",    label: "Sets",    count: initialSets.length },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as "factors" | "sets")}
            className={`text-xs px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
              tab === t.id ? "bg-white text-slate-900 shadow-sm font-semibold" : "text-slate-600"
            }`}
          >
            {t.label}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
              tab === t.id ? "bg-teal-50 text-teal-700" : "bg-slate-200 text-slate-600"
            }`}>{t.count}</span>
          </button>
        ))}
      </div>

      {tab === "factors" && (
        <section className="bg-white rounded-2xl border border-slate-200 p-5 mt-3 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Saved factors</div>
              <div className="text-[11px] text-slate-500">Definitions reused across patients.</div>
            </div>
            <button
              onClick={() => setEditingFactor({
                id: "",
                name: "",
                unit: "",
                defaultGoal: "",
                weight: "medium",
                defaultStatus: "borderline",
                source: "",
                note: "",
                category: "",
              })}
              className="text-xs font-semibold bg-teal-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-teal-800"
            >
              <Plus size={13} /> New factor
            </button>
          </div>

          {initialFactors.length === 0 ? (
            <div className="text-sm text-slate-500 italic py-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
              No factors yet. Add your first one.
            </div>
          ) : (
            <div className="space-y-2">
              {initialFactors.map((f) => (
                <div key={f.id} className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-3">
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
                  <button onClick={() => setEditingFactor(f)} className="text-[11px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-lg">Edit</button>
                  <button
                    onClick={() => {
                      if (!confirm(`Delete "${f.name}" from the library?`)) return;
                      startTransition(() => deleteFactor(f.id));
                    }}
                    className="text-[11px] font-semibold text-rose-600 bg-white border border-rose-200 px-2.5 py-1 rounded-lg"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === "sets" && (
        <section className="bg-white rounded-2xl border border-slate-200 p-5 mt-3 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Saved sets</div>
              <div className="text-[11px] text-slate-500">Pre-built panels you can apply to a patient&apos;s pillar in one click.</div>
            </div>
            <button
              onClick={() => setEditingSet({ id: "", name: "", description: "", pillarKind: null, factorIds: [] })}
              className="text-xs font-semibold bg-teal-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-teal-800"
            >
              <Plus size={13} /> New set
            </button>
          </div>

          {initialSets.length === 0 ? (
            <div className="text-sm text-slate-500 italic py-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
              No saved sets yet.
            </div>
          ) : (
            <div className="space-y-2">
              {initialSets.map((s) => {
                const setFactors = s.factorIds
                  .map((id) => initialFactors.find((f) => f.id === id))
                  .filter(Boolean) as LibFactor[];
                return (
                  <div key={s.id} className="bg-white border border-slate-200 rounded-xl p-3 flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center flex-shrink-0">
                      <Layers size={15} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">{s.name}</div>
                      {s.description && <div className="text-[11px] text-slate-500 leading-snug">{s.description}</div>}
                      <div className="text-[11px] text-slate-500 mt-1">
                        {setFactors.length} factor{setFactors.length === 1 ? "" : "s"}
                        {s.pillarKind ? ` · ${PILLAR_OPTIONS.find((p) => p.id === s.pillarKind)?.label}` : ""}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      <button onClick={() => setEditingSet(s)} className="text-[11px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-lg">Edit</button>
                      <button
                        onClick={() => {
                          if (!confirm(`Delete the "${s.name}" set?`)) return;
                          startTransition(() => deleteSet(s.id));
                        }}
                        className="text-[11px] font-semibold text-rose-600 bg-white border border-rose-200 px-2.5 py-1 rounded-lg"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {editingFactor && (
        <FactorEditorDrawer
          factor={editingFactor}
          onClose={() => setEditingFactor(null)}
          onSave={(form) => {
            startTransition(async () => {
              if (editingFactor.id) {
                await updateFactor({ ...form, id: editingFactor.id });
              } else {
                await createFactor(form);
              }
              setEditingFactor(null);
            });
          }}
          pending={pending}
        />
      )}

      {editingSet && (
        <SetEditorDrawer
          set={editingSet}
          grouped={grouped}
          onClose={() => setEditingSet(null)}
          onSave={(form) => {
            startTransition(async () => {
              if (editingSet.id) {
                await updateSet({ ...form, id: editingSet.id });
              } else {
                await createSet(form);
              }
              setEditingSet(null);
            });
          }}
          pending={pending}
        />
      )}
    </>
  );
}

// ----- Drawers -----

function FactorEditorDrawer({
  factor,
  onClose,
  onSave,
  pending,
}: {
  factor: LibFactor;
  onClose: () => void;
  onSave: (form: Omit<LibFactor, "id">) => void;
  pending: boolean;
}) {
  const [form, setForm] = useState<Omit<LibFactor, "id">>({
    name: factor.name,
    unit: factor.unit ?? "",
    defaultGoal: factor.defaultGoal ?? "",
    weight: factor.weight,
    defaultStatus: factor.defaultStatus,
    source: factor.source ?? "",
    note: factor.note ?? "",
    category: factor.category ?? "",
  });
  const valid = form.name.trim().length > 0;
  return (
    <>
      <div className="fixed inset-0 bg-slate-900/40 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">{factor.id ? "Edit factor" : "New factor"}</div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700 text-sm">Cancel</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <Field label="Name"
            value={form.name}
            onChange={(v) => setForm((p) => ({ ...p, name: v }))}
            placeholder="ApoB" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Unit"
              value={form.unit ?? ""}
              onChange={(v) => setForm((p) => ({ ...p, unit: v }))}
              placeholder="mg/dL" />
            <Field label="Default goal"
              value={form.defaultGoal ?? ""}
              onChange={(v) => setForm((p) => ({ ...p, defaultGoal: v }))}
              placeholder="< 60" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldSelect label="Default status" value={form.defaultStatus}
              onChange={(v) => setForm((p) => ({ ...p, defaultStatus: v as Status }))}
              options={STATUS_OPTIONS} />
            <FieldSelect label="Priority" value={form.weight}
              onChange={(v) => setForm((p) => ({ ...p, weight: v as Weight }))}
              options={WEIGHT_OPTIONS} />
          </div>
          <Field label="Default source"
            value={form.source ?? ""}
            onChange={(v) => setForm((p) => ({ ...p, source: v }))}
            placeholder="Boston Heart" />
          <Field label="Category"
            value={form.category ?? ""}
            onChange={(v) => setForm((p) => ({ ...p, category: v }))}
            placeholder="Cardiovascular" />
          <FieldTextarea label="Default note"
            value={form.note ?? ""}
            onChange={(v) => setForm((p) => ({ ...p, note: v }))}
            placeholder="Why this matters and how we manage it." />
        </div>
        <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-sm text-slate-600 px-3 py-2 rounded-lg hover:bg-slate-50">Cancel</button>
          <button
            onClick={() => valid && onSave({ ...form, name: form.name.trim() })}
            disabled={!valid || pending}
            className={`text-sm font-semibold px-4 py-2 rounded-lg ${
              valid && !pending ? "bg-teal-700 text-white hover:bg-teal-800" : "bg-slate-200 text-slate-400 cursor-not-allowed"
            }`}
          >
            {pending ? "Saving…" : "Save factor"}
          </button>
        </div>
      </div>
    </>
  );
}

function SetEditorDrawer({
  set,
  grouped,
  onClose,
  onSave,
  pending,
}: {
  set: LibSet;
  grouped: Record<string, LibFactor[]>;
  onClose: () => void;
  onSave: (form: Omit<LibSet, "id">) => void;
  pending: boolean;
}) {
  const [form, setForm] = useState<Omit<LibSet, "id">>({
    name: set.name,
    description: set.description ?? "",
    pillarKind: set.pillarKind,
    factorIds: [...set.factorIds],
  });
  const toggleFactor = (id: string) => {
    setForm((p) => ({
      ...p,
      factorIds: p.factorIds.includes(id)
        ? p.factorIds.filter((x) => x !== id)
        : [...p.factorIds, id],
    }));
  };
  const valid = form.name.trim().length > 0 && form.factorIds.length > 0;
  return (
    <>
      <div className="fixed inset-0 bg-slate-900/40 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full max-w-xl bg-white shadow-2xl z-50 flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">{set.id ? "Edit set" : "New set"}</div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700 text-sm">Cancel</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <Field label="Set name"
            value={form.name}
            onChange={(v) => setForm((p) => ({ ...p, name: v }))}
            placeholder="Standard cardiovascular panel" />
          <FieldTextarea label="Description"
            value={form.description ?? ""}
            onChange={(v) => setForm((p) => ({ ...p, description: v }))}
            placeholder="Core CV risk markers we run on every patient." />
          <FieldSelect
            label="Target pillar"
            value={form.pillarKind ?? ""}
            onChange={(v) => setForm((p) => ({ ...p, pillarKind: (v || null) as PillarKind | null }))}
            options={PILLAR_OPTIONS.map((o) => ({ id: o.id, label: o.label }))}
          />

          <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mt-2">
            Factors in this set ({form.factorIds.length})
          </div>

          {Object.keys(grouped).length === 0 ? (
            <div className="text-sm text-slate-500 italic py-6 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
              No factors in the library yet. Add some on the Factors tab first.
            </div>
          ) : (
            Object.keys(grouped).sort().map((cat) => (
              <div key={cat} className="space-y-1.5">
                <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{cat}</div>
                {grouped[cat].map((f) => {
                  const checked = form.factorIds.includes(f.id);
                  return (
                    <label
                      key={f.id}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition ${
                        checked ? "bg-teal-50 border-teal-300" : "bg-white border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <input type="checkbox" checked={checked} onChange={() => toggleFactor(f.id)} className="accent-teal-600" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-900 truncate">{f.name}</div>
                        <div className="text-[11px] text-slate-500 truncate">Goal {f.defaultGoal || "—"} · {f.unit || "—"}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-sm text-slate-600 px-3 py-2 rounded-lg hover:bg-slate-50">Cancel</button>
          <button
            onClick={() => valid && onSave({ ...form, name: form.name.trim() })}
            disabled={!valid || pending}
            className={`text-sm font-semibold px-4 py-2 rounded-lg ${
              valid && !pending ? "bg-teal-700 text-white hover:bg-teal-800" : "bg-slate-200 text-slate-400 cursor-not-allowed"
            }`}
          >
            {pending ? "Saving…" : "Save set"}
          </button>
        </div>
      </div>
    </>
  );
}

// ----- Tiny field helpers -----

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
      />
    </label>
  );
}

function FieldTextarea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">{label}</span>
      <textarea
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
      />
    </label>
  );
}

function FieldSelect({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-teal-500"
      >
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </label>
  );
}
