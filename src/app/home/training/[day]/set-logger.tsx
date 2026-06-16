"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { logSet } from "./log-actions";

type SetRow = { id: string; setNumber: number; reps: number; weight: number };
type SetLog = { actualReps: number | null; actualWeight: number | null; done: boolean };

type RowState = { reps: string; weight: string; done: boolean; saved?: boolean };

export function SetLogger({
  kind,
  sessionId,
  day,
  logDate,
  sets,
  logs,
}: {
  kind: "strength" | "mobility";
  sessionId: string;
  day: string;
  logDate: string;
  sets: SetRow[];
  logs: Record<string, SetLog>;
}) {
  const labels =
    kind === "mobility"
      ? { reps: "Hold (s)", weight: "Reps/side" }
      : { reps: "Reps", weight: "Weight" };

  // Seed each row: logged actual if present, else the prescribed value as a
  // starting point the patient can adjust to what they actually did.
  const [rows, setRows] = useState<Record<string, RowState>>(() => {
    const init: Record<string, RowState> = {};
    sets.forEach((s) => {
      const log = logs[s.id];
      init[s.id] = {
        reps: String(log?.actualReps ?? s.reps),
        weight: String(log?.actualWeight ?? s.weight),
        done: log?.done ?? false,
      };
    });
    return init;
  });
  const [pending, startTransition] = useTransition();

  const save = (setId: string, next: RowState) => {
    const reps = next.reps.trim() === "" ? null : Math.max(0, parseInt(next.reps, 10) || 0);
    const weight = next.weight.trim() === "" ? null : Math.max(0, parseInt(next.weight, 10) || 0);
    startTransition(async () => {
      await logSet({ sessionId, setId, day, logDate, actualReps: reps, actualWeight: weight, done: next.done });
      setRows((p) => ({ ...p, [setId]: { ...p[setId], saved: true } }));
    });
  };

  const update = (setId: string, patch: Partial<RowState>, persist: boolean) => {
    setRows((p) => {
      const next = { ...p[setId], ...patch, saved: false };
      const merged = { ...p, [setId]: next };
      if (persist) save(setId, next);
      return merged;
    });
  };

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wide text-slate-500 font-semibold items-center">
        <div className="col-span-2">Set</div>
        <div className="col-span-3 text-center">Target</div>
        <div className="col-span-3 text-center">{labels.reps}</div>
        <div className="col-span-3 text-center">{labels.weight}</div>
        <div className="col-span-1 text-center">Done</div>
      </div>
      {sets.map((s) => {
        const r = rows[s.id];
        return (
          <div key={s.id} className="grid grid-cols-12 gap-2 items-center py-1 border-t border-slate-100">
            <div className="col-span-2 text-sm font-medium text-slate-700">#{s.setNumber}</div>
            <div className="col-span-3 text-center text-[12px] text-slate-400 tabular-nums">
              {s.reps}×{s.weight}
            </div>
            <div className="col-span-3">
              <input
                type="number"
                inputMode="numeric"
                value={r.reps}
                onChange={(e) => update(s.id, { reps: e.target.value }, false)}
                onBlur={() => save(s.id, rows[s.id])}
                className="w-full text-sm text-center tabular-nums border border-slate-200 rounded-lg px-1 py-1 focus:outline-none focus:border-teal-500"
              />
            </div>
            <div className="col-span-3">
              <input
                type="number"
                inputMode="numeric"
                value={r.weight}
                onChange={(e) => update(s.id, { weight: e.target.value }, false)}
                onBlur={() => save(s.id, rows[s.id])}
                className="w-full text-sm text-center tabular-nums border border-slate-200 rounded-lg px-1 py-1 focus:outline-none focus:border-teal-500"
              />
            </div>
            <div className="col-span-1 flex justify-center">
              <button
                type="button"
                onClick={() => update(s.id, { done: !r.done }, true)}
                disabled={pending}
                aria-label="Mark set done"
                className={`w-6 h-6 rounded-md border flex items-center justify-center ${
                  r.done ? "bg-teal-600 border-teal-600 text-white" : "bg-white border-slate-300 text-transparent"
                }`}
              >
                <Check size={14} />
              </button>
            </div>
          </div>
        );
      })}
      <div className="text-[10px] text-slate-400 pt-1">
        Edit reps/weight to what you actually did — saves automatically.
      </div>
    </div>
  );
}
