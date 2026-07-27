"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, Trash2 } from "lucide-react";
import { updateScreening, deleteScreening, toggleScreeningHidden } from "./actions";
import {
  SCREENING_PRESETS,
  dueStatus,
  DUE_STATUS_CHIP,
  DUE_STATUS_LABEL,
} from "@/lib/screening";

export type Screening = {
  id: string;
  test: string;
  lastPerformed: string | null; // YYYY-MM-DD
  results: string | null;
  nextDue: string | null;       // YYYY-MM-DD
  hidden: boolean;
};

export function ScreeningRow({
  screening,
  patientId,
  pillarId,
}: {
  screening: Screening;
  patientId: string;
  pillarId: string;
}) {
  const [form, setForm] = useState(screening);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const update = <K extends keyof Screening>(key: K, value: Screening[K]) => {
    setForm((p) => ({ ...p, [key]: value }));
    setSaved(false);
  };

  const dirty =
    form.test !== screening.test ||
    form.lastPerformed !== screening.lastPerformed ||
    form.results !== screening.results ||
    form.nextDue !== screening.nextDue;

  const save = () => {
    if (!form.test.trim()) return;
    setSaved(false);
    startTransition(async () => {
      await updateScreening({
        screeningId: form.id,
        pillarId,
        patientId,
        test: form.test.trim(),
        lastPerformed: form.lastPerformed || null,
        results: form.results,
        nextDue: form.nextDue || null,
      });
      setSaved(true);
    });
  };

  const status = dueStatus(form.nextDue);

  return (
    <div
      className={`border rounded-xl p-3 transition ${
        form.hidden ? "bg-slate-50 border-slate-200 opacity-70" : "bg-white border-slate-200"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <input
          list="screening-presets"
          value={form.test}
          onChange={(e) => update("test", e.target.value)}
          placeholder="Test (e.g. Colonoscopy)"
          className="flex-1 text-sm font-semibold text-slate-900 border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-teal-500"
        />
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${DUE_STATUS_CHIP[status]} flex-shrink-0`}>
          {DUE_STATUS_LABEL[status]}
        </span>
        <button
          onClick={() => startTransition(() => toggleScreeningHidden({ screeningId: form.id, hidden: !form.hidden, pillarId, patientId }))}
          disabled={pending}
          title={form.hidden ? "Show in patient app" : "Hide from patient app"}
          className={`text-xs px-1.5 py-1 rounded ${form.hidden ? "bg-slate-200 text-slate-700" : "text-slate-500 hover:bg-slate-100"}`}
        >
          {form.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
        <button
          onClick={() => {
            if (!confirm("Remove this screening?")) return;
            startTransition(() => deleteScreening({ screeningId: form.id, pillarId, patientId }));
          }}
          disabled={pending}
          className="text-xs text-rose-600 px-1.5 py-1 rounded hover:bg-rose-50"
        >
          <Trash2 size={13} />
        </button>
      </div>

      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-3">
          <Label>Last performed</Label>
          <input
            type="date"
            value={form.lastPerformed ?? ""}
            onChange={(e) => update("lastPerformed", e.target.value || null)}
            className="w-full text-sm text-slate-800 border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-teal-500"
          />
        </div>
        <div className="col-span-6">
          <Label>Results</Label>
          <input
            value={form.results ?? ""}
            onChange={(e) => update("results", e.target.value || null)}
            placeholder="Normal · no polyps · repeat in 10y"
            className="w-full text-sm text-slate-800 border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-teal-500"
          />
        </div>
        <div className="col-span-3">
          <Label>Next due</Label>
          <input
            type="date"
            value={form.nextDue ?? ""}
            onChange={(e) => update("nextDue", e.target.value || null)}
            className="w-full text-sm text-slate-800 border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-teal-500"
          />
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={save}
          disabled={!dirty || pending || !form.test.trim()}
          className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${
            dirty && !pending && form.test.trim()
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

// Rendered once per page so every test <input list="screening-presets"> shares it.
export function ScreeningPresetsDatalist() {
  return (
    <datalist id="screening-presets">
      {SCREENING_PRESETS.map((p) => (
        <option key={p} value={p} />
      ))}
    </datalist>
  );
}
