"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { logCardioSession } from "./log-actions";

// Lets the patient mark a cardio session (zone2 / vo2max) done and record the
// actual minutes they did. Autosaves on toggle / blur. Seeds minutes from the
// prescribed duration as a starting point.
export function CardioLogger({
  sessionId,
  day,
  logDate,
  prescribedMinutes,
  initial,
}: {
  sessionId: string;
  day: string;
  logDate: string;
  prescribedMinutes: number;
  initial: { actualMinutes: number | null; done: boolean } | null;
}) {
  const [done, setDone] = useState<boolean>(initial?.done ?? false);
  const [minutes, setMinutes] = useState<string>(
    String(initial?.actualMinutes ?? prescribedMinutes)
  );
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const persist = (nextDone: boolean, nextMinutes: string) => {
    const mins = nextMinutes.trim() === "" ? null : Math.max(0, parseInt(nextMinutes, 10) || 0);
    startTransition(async () => {
      await logCardioSession({ sessionId, day, logDate, actualMinutes: mins, done: nextDone });
      setSaved(true);
    });
  };

  const toggleDone = () => {
    const next = !done;
    setDone(next);
    setSaved(false);
    persist(next, minutes);
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Log this session</div>
        {saved && !pending && <span className="text-[11px] text-emerald-600">Saved</span>}
        {pending && <span className="text-[11px] text-slate-400">Saving…</span>}
      </div>

      <button
        type="button"
        onClick={toggleDone}
        className={`w-full flex items-center gap-2 rounded-xl border px-3 py-2.5 transition ${
          done
            ? "bg-teal-600 border-teal-600 text-white"
            : "bg-white border-slate-200 text-slate-700 hover:border-teal-300"
        }`}
      >
        <span
          className={`w-5 h-5 rounded-md flex items-center justify-center border ${
            done ? "bg-white/20 border-white/40" : "border-slate-300"
          }`}
        >
          {done && <Check size={14} />}
        </span>
        <span className="text-sm font-semibold">{done ? "Completed" : "Mark complete"}</span>
      </button>

      <label className="block">
        <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">Actual minutes</span>
        <div className="mt-1 flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            value={minutes}
            onChange={(e) => {
              setMinutes(e.target.value);
              setSaved(false);
            }}
            onBlur={() => persist(done, minutes)}
            className="w-28 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500 tabular-nums"
          />
          <span className="text-[12px] text-slate-500">min · prescribed {prescribedMinutes}m</span>
        </div>
      </label>
    </section>
  );
}
