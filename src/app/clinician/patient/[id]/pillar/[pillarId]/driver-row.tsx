"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, Trash2 } from "lucide-react";
import { updateDriver, deleteDriver, toggleDriverHidden, moveDriver } from "./actions";

export type Driver = {
  id: string;
  name: string;
  note: string | null;
  hidden: boolean;
};

export function DriverRow({
  driver,
  index,
  total,
  patientId,
  pillarId,
}: {
  driver: Driver;
  index: number;
  total: number;
  patientId: string;
  pillarId: string;
}) {
  const [form, setForm] = useState(driver);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const dirty =
    form.name !== driver.name ||
    form.note !== driver.note;

  const save = () => {
    setSaved(false);
    startTransition(async () => {
      await updateDriver({
        driverId: form.id,
        pillarId,
        patientId,
        name: form.name,
        note: form.note,
      });
      setSaved(true);
    });
  };

  return (
    <div
      className={`border rounded-xl p-3 transition ${
        form.hidden ? "bg-slate-50 border-slate-200 opacity-70" : "bg-white border-slate-200"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-[11px] font-semibold flex-shrink-0">
          {index + 1}
        </span>
        <input
          value={form.name}
          onChange={(e) => { setForm((p) => ({ ...p, name: e.target.value })); setSaved(false); }}
          placeholder="Driver name (e.g. Physical inactivity)"
          className="flex-1 text-sm font-semibold text-slate-900 border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-teal-500"
        />

        <button onClick={() => startTransition(() => moveDriver({ driverId: form.id, pillarId, patientId, direction: "up" }))}
          disabled={index === 0 || pending}
          className={`text-xs px-1.5 py-1 rounded ${index === 0 ? "text-slate-300" : "text-slate-600 hover:bg-slate-200"}`}>↑</button>
        <button onClick={() => startTransition(() => moveDriver({ driverId: form.id, pillarId, patientId, direction: "down" }))}
          disabled={index === total - 1 || pending}
          className={`text-xs px-1.5 py-1 rounded ${index === total - 1 ? "text-slate-300" : "text-slate-600 hover:bg-slate-200"}`}>↓</button>
        <button onClick={() => startTransition(() => toggleDriverHidden({ driverId: form.id, hidden: !form.hidden, pillarId, patientId }))}
          disabled={pending}
          title={form.hidden ? "Show in patient app" : "Hide from patient app"}
          className={`text-xs px-1.5 py-1 rounded ${form.hidden ? "bg-slate-200 text-slate-700" : "text-slate-500 hover:bg-slate-100"}`}>
          {form.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
        <button onClick={() => {
            if (!confirm("Remove this lifestyle driver?")) return;
            startTransition(() => deleteDriver({ driverId: form.id, pillarId, patientId }));
          }}
          disabled={pending}
          className="text-xs text-rose-600 px-1.5 py-1 rounded hover:bg-rose-50">
          <Trash2 size={13} />
        </button>
      </div>

      <div className="ml-8">
        <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-0.5">
          Patient-facing explanation
        </div>
        <textarea
          rows={2}
          value={form.note ?? ""}
          onChange={(e) => { setForm((p) => ({ ...p, note: e.target.value || null })); setSaved(false); }}
          placeholder="Why this behavior matters and how to lean on it."
          className="w-full text-sm text-slate-800 border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-teal-500"
        />
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
