"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, Trash2 } from "lucide-react";
import {
  updateFactor,
  deleteFactor,
  toggleFactorHidden,
  moveFactor,
} from "./actions";

type Status = "on-target" | "borderline" | "off-target";
type Weight = "low" | "medium" | "high";

export type Factor = {
  id: string;
  name: string;
  currentValue: string | null;
  unit: string | null;
  goal: string | null;
  status: Status;
  weight: Weight;
  source: string | null;
  note: string | null;
  hidden: boolean;
};

const STATUS_OPTIONS: { id: Status; label: string; cls: string }[] = [
  { id: "off-target",  label: "Off target", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  { id: "borderline",  label: "Borderline", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  { id: "on-target",   label: "On target",  cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
];

const WEIGHT_OPTIONS: { id: Weight; label: string }[] = [
  { id: "high",   label: "High priority" },
  { id: "medium", label: "Medium priority" },
  { id: "low",    label: "Low priority" },
];

export function FactorRow({
  factor,
  index,
  total,
  patientId,
  pillarId,
}: {
  factor: Factor;
  index: number;
  total: number;
  patientId: string;
  pillarId: string;
}) {
  const [form, setForm] = useState(factor);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const update = <K extends keyof Factor>(key: K, value: Factor[K]) => {
    setForm((p) => ({ ...p, [key]: value }));
    setSaved(false);
  };

  const dirty =
    form.name !== factor.name ||
    form.currentValue !== factor.currentValue ||
    form.unit !== factor.unit ||
    form.goal !== factor.goal ||
    form.status !== factor.status ||
    form.weight !== factor.weight ||
    form.source !== factor.source ||
    form.note !== factor.note;

  const save = () => {
    setSaved(false);
    startTransition(async () => {
      await updateFactor({
        factorId: form.id,
        pillarId,
        patientId,
        name: form.name,
        currentValue: form.currentValue,
        unit: form.unit,
        goal: form.goal,
        status: form.status,
        weight: form.weight,
        source: form.source,
        note: form.note,
      });
      setSaved(true);
    });
  };

  const onMove = (direction: "up" | "down") => {
    startTransition(() => moveFactor({ factorId: form.id, pillarId, patientId, direction }));
  };
  const onToggleHide = () => {
    startTransition(() => toggleFactorHidden({ factorId: form.id, hidden: !form.hidden, pillarId, patientId }));
  };
  const onDelete = () => {
    if (!confirm("Remove this risk factor from the patient's pillar?")) return;
    startTransition(() => deleteFactor({ factorId: form.id, pillarId, patientId }));
  };

  const statusOpt = STATUS_OPTIONS.find((s) => s.id === form.status) ?? STATUS_OPTIONS[1];

  return (
    <div
      className={`border rounded-xl p-3 transition ${
        form.hidden ? "bg-slate-50 border-slate-200 opacity-70" : "bg-white border-slate-200"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-[11px] font-semibold flex-shrink-0">
          {index + 1}
        </span>
        <input
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
          placeholder="Risk / marker name (e.g. ApoB)"
          className="flex-1 text-sm font-semibold text-slate-900 border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-teal-500"
        />
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${statusOpt.cls} flex-shrink-0`}>
          {statusOpt.label}
        </span>

        {/* Reorder + hide + delete */}
        <button onClick={() => onMove("up")} disabled={index === 0 || pending}
          className={`text-xs px-1.5 py-1 rounded ${index === 0 ? "text-slate-300" : "text-slate-600 hover:bg-slate-200"}`}>↑</button>
        <button onClick={() => onMove("down")} disabled={index === total - 1 || pending}
          className={`text-xs px-1.5 py-1 rounded ${index === total - 1 ? "text-slate-300" : "text-slate-600 hover:bg-slate-200"}`}>↓</button>
        <button onClick={onToggleHide} disabled={pending}
          title={form.hidden ? "Show in patient app" : "Hide from patient app"}
          className={`text-xs px-1.5 py-1 rounded ${form.hidden ? "bg-slate-200 text-slate-700" : "text-slate-500 hover:bg-slate-100"}`}>
          {form.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
        <button onClick={onDelete} disabled={pending}
          className="text-xs text-rose-600 px-1.5 py-1 rounded hover:bg-rose-50">
          <Trash2 size={13} />
        </button>
      </div>

      <div className="grid grid-cols-12 gap-2 ml-8">
        <div className="col-span-3">
          <Label>Current</Label>
          <input
            value={form.currentValue ?? ""}
            onChange={(e) => update("currentValue", e.target.value || null)}
            placeholder="74"
            className="w-full text-sm text-slate-800 border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-teal-500"
          />
        </div>
        <div className="col-span-2">
          <Label>Unit</Label>
          <input
            value={form.unit ?? ""}
            onChange={(e) => update("unit", e.target.value || null)}
            placeholder="mg/dL"
            className="w-full text-sm text-slate-800 border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-teal-500"
          />
        </div>
        <div className="col-span-3">
          <Label>Goal</Label>
          <input
            value={form.goal ?? ""}
            onChange={(e) => update("goal", e.target.value || null)}
            placeholder="< 60"
            className="w-full text-sm text-slate-800 border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-teal-500"
          />
        </div>
        <div className="col-span-2">
          <Label>Status</Label>
          <select
            value={form.status}
            onChange={(e) => update("status", e.target.value as Status)}
            className="w-full text-sm text-slate-800 border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-teal-500"
          >
            {STATUS_OPTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <Label>Weight</Label>
          <select
            value={form.weight}
            onChange={(e) => update("weight", e.target.value as Weight)}
            className="w-full text-sm text-slate-800 border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-teal-500"
          >
            {WEIGHT_OPTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div className="col-span-12">
          <Label>Source</Label>
          <input
            value={form.source ?? ""}
            onChange={(e) => update("source", e.target.value || null)}
            placeholder="Boston Heart · Apr 18"
            className="w-full text-sm text-slate-800 border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-teal-500"
          />
        </div>
        <div className="col-span-12">
          <Label>Patient-facing note</Label>
          <textarea
            rows={2}
            value={form.note ?? ""}
            onChange={(e) => update("note", e.target.value || null)}
            placeholder="Why this matters and what we're doing about it."
            className="w-full text-sm text-slate-800 border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-teal-500"
          />
        </div>
      </div>

      <div className="ml-8 mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || pending}
          className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${
            dirty && !pending
              ? "bg-teal-700 text-white hover:bg-teal-800"
              : "bg-slate-200 text-slate-400 cursor-not-allowed"
          }`}
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {saved && !dirty && <span className="text-[11px] text-emerald-700">Saved.</span>}
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-0.5">
      {children}
    </div>
  );
}

