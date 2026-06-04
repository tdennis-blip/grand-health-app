"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, Trash2 } from "lucide-react";
import { updateRec, deleteRec, toggleRecHidden, moveRec } from "./actions";

export type RecStatus = "active" | "review" | "paused";

export type Recommendation = {
  id: string;
  title: string;
  why: string | null;
  cadence: string | null;
  status: RecStatus;
  link: string | null;
  hidden: boolean;
};

const STATUS_OPTIONS: { id: RecStatus; label: string; chip: string }[] = [
  { id: "active", label: "Active",  chip: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { id: "review", label: "Review",  chip: "bg-amber-50 text-amber-700 border-amber-200" },
  { id: "paused", label: "Paused",  chip: "bg-slate-100 text-slate-700 border-slate-200" },
];

export function RecRow({
  rec,
  index,
  total,
  patientId,
  pillarId,
}: {
  rec: Recommendation;
  index: number;
  total: number;
  patientId: string;
  pillarId: string;
}) {
  const [form, setForm] = useState(rec);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const update = <K extends keyof Recommendation>(key: K, value: Recommendation[K]) => {
    setForm((p) => ({ ...p, [key]: value }));
    setSaved(false);
  };

  const dirty =
    form.title !== rec.title ||
    form.why !== rec.why ||
    form.cadence !== rec.cadence ||
    form.status !== rec.status ||
    form.link !== rec.link;

  const save = () => {
    setSaved(false);
    startTransition(async () => {
      await updateRec({
        recId: form.id,
        pillarId,
        patientId,
        title: form.title,
        why: form.why,
        cadence: form.cadence,
        status: form.status,
        link: form.link,
      });
      setSaved(true);
    });
  };

  const statusOpt = STATUS_OPTIONS.find((s) => s.id === form.status) ?? STATUS_OPTIONS[0];

  return (
    <div
      className={`border rounded-xl p-3 transition ${
        form.hidden ? "bg-slate-50 border-slate-200 opacity-70" : "bg-white border-slate-200"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-[11px] font-semibold flex-shrink-0">
          {index + 1}
        </span>
        <input
          value={form.title}
          onChange={(e) => update("title", e.target.value)}
          placeholder="Recommendation title (e.g. Take Rosuvastatin 5 mg with dinner)"
          className="flex-1 text-sm font-semibold text-slate-900 border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-teal-500"
        />
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${statusOpt.chip} flex-shrink-0`}>
          {statusOpt.label}
        </span>

        <button onClick={() => startTransition(() => moveRec({ recId: form.id, pillarId, patientId, direction: "up" }))}
          disabled={index === 0 || pending}
          className={`text-xs px-1.5 py-1 rounded ${index === 0 ? "text-slate-300" : "text-slate-600 hover:bg-slate-200"}`}>↑</button>
        <button onClick={() => startTransition(() => moveRec({ recId: form.id, pillarId, patientId, direction: "down" }))}
          disabled={index === total - 1 || pending}
          className={`text-xs px-1.5 py-1 rounded ${index === total - 1 ? "text-slate-300" : "text-slate-600 hover:bg-slate-200"}`}>↓</button>
        <button onClick={() => startTransition(() => toggleRecHidden({ recId: form.id, hidden: !form.hidden, pillarId, patientId }))}
          disabled={pending}
          title={form.hidden ? "Show in patient app" : "Hide from patient app"}
          className={`text-xs px-1.5 py-1 rounded ${form.hidden ? "bg-slate-200 text-slate-700" : "text-slate-500 hover:bg-slate-100"}`}>
          {form.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
        <button onClick={() => {
            if (!confirm("Remove this recommendation?")) return;
            startTransition(() => deleteRec({ recId: form.id, pillarId, patientId }));
          }}
          disabled={pending}
          className="text-xs text-rose-600 px-1.5 py-1 rounded hover:bg-rose-50">
          <Trash2 size={13} />
        </button>
      </div>

      <div className="grid grid-cols-12 gap-2 ml-8">
        <div className="col-span-7">
          <Label>Why it matters</Label>
          <input
            value={form.why ?? ""}
            onChange={(e) => update("why", e.target.value || null)}
            placeholder="Drives ApoB toward your <60 target"
            className="w-full text-sm text-slate-800 border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-teal-500"
          />
        </div>
        <div className="col-span-3">
          <Label>Cadence</Label>
          <input
            value={form.cadence ?? ""}
            onChange={(e) => update("cadence", e.target.value || null)}
            placeholder="Daily"
            className="w-full text-sm text-slate-800 border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-teal-500"
          />
        </div>
        <div className="col-span-2">
          <Label>Status</Label>
          <select
            value={form.status}
            onChange={(e) => update("status", e.target.value as RecStatus)}
            className="w-full text-sm text-slate-800 border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-teal-500"
          >
            {STATUS_OPTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
      </div>

      <div className="ml-8 mt-2 flex items-center gap-2">
        <button
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
