"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Play, Pause, RotateCcw } from "lucide-react";
import { logSet } from "./log-actions";

type SetRow = { id: string; setNumber: number; reps: number; weight: number; durationSeconds: number | null };
type SetLog = {
  setId: string;
  side: string;
  actualReps: number | null;
  actualWeight: number | null;
  actualSeconds: number | null;
  done: boolean;
};

type Side = "na" | "left" | "right";
type RowState = { reps: string; weight: string; seconds: string; done: boolean; saved?: boolean };

export function SetLogger({
  kind,
  perSide,
  sessionId,
  day,
  logDate,
  sets,
  logs,
}: {
  kind: "strength" | "mobility";
  perSide: boolean;
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

  const sides: Side[] = perSide ? ["left", "right"] : ["na"];
  const keyOf = (setId: string, side: Side) => `${setId}:${side}`;

  // Seed each (set × side) row from the logged actual, else the prescribed value.
  const [rows, setRows] = useState<Record<string, RowState>>(() => {
    const init: Record<string, RowState> = {};
    sets.forEach((s) => {
      sides.forEach((side) => {
        const log = logs[keyOf(s.id, side)];
        init[keyOf(s.id, side)] = {
          reps: String(log?.actualReps ?? s.reps),
          weight: String(log?.actualWeight ?? s.weight),
          seconds: String(log?.actualSeconds ?? s.durationSeconds ?? ""),
          done: log?.done ?? false,
        };
      });
    });
    return init;
  });
  const [pending, startTransition] = useTransition();

  const persist = (setId: string, side: Side, next: RowState) => {
    const toNum = (v: string) => (v.trim() === "" ? null : Math.max(0, parseInt(v, 10) || 0));
    startTransition(async () => {
      await logSet({
        sessionId,
        setId,
        day,
        logDate,
        side,
        actualReps: toNum(next.reps),
        actualWeight: toNum(next.weight),
        actualSeconds: toNum(next.seconds),
        done: next.done,
      });
      setRows((p) => ({ ...p, [keyOf(setId, side)]: { ...p[keyOf(setId, side)], saved: true } }));
    });
  };

  const update = (setId: string, side: Side, patch: Partial<RowState>, save: boolean) => {
    setRows((p) => {
      const next = { ...p[keyOf(setId, side)], ...patch, saved: false };
      const merged = { ...p, [keyOf(setId, side)]: next };
      if (save) persist(setId, side, next);
      return merged;
    });
  };

  return (
    <div className="space-y-2">
      {sets.map((s) =>
        sides.map((side) => {
          const k = keyOf(s.id, side);
          const r = rows[k];
          const timed = s.durationSeconds != null && s.durationSeconds > 0;
          return (
            <div key={k} className="rounded-xl border border-slate-200 p-2.5">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[12px] font-semibold text-slate-700 flex items-center gap-2">
                  Set #{s.setNumber}
                  {side !== "na" && (
                    <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {side === "left" ? "Left" : "Right"}
                    </span>
                  )}
                  <span className="text-[11px] font-normal text-slate-400">
                    target {s.reps}×{s.weight}{timed ? ` · ${s.durationSeconds}s` : ""}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => update(s.id, side, { done: !r.done }, true)}
                  disabled={pending}
                  aria-label="Mark set done"
                  className={`w-6 h-6 rounded-md border flex items-center justify-center ${
                    r.done ? "bg-teal-600 border-teal-600 text-white" : "bg-white border-slate-300 text-transparent"
                  }`}
                >
                  <Check size={14} />
                </button>
              </div>

              {timed && (
                <Timer
                  totalSeconds={s.durationSeconds as number}
                  onComplete={() =>
                    update(s.id, side, { done: true, seconds: String(s.durationSeconds) }, true)
                  }
                />
              )}

              <div className="grid grid-cols-3 gap-2 mt-2">
                <Field
                  label={labels.reps}
                  value={r.reps}
                  onChange={(v) => update(s.id, side, { reps: v }, false)}
                  onCommit={() => persist(s.id, side, rows[k])}
                />
                <Field
                  label={labels.weight}
                  value={r.weight}
                  onChange={(v) => update(s.id, side, { weight: v }, false)}
                  onCommit={() => persist(s.id, side, rows[k])}
                />
                {timed && (
                  <Field
                    label="Actual (s)"
                    value={r.seconds}
                    onChange={(v) => update(s.id, side, { seconds: v }, false)}
                    onCommit={() => persist(s.id, side, rows[k])}
                  />
                )}
              </div>
            </div>
          );
        })
      )}
      <div className="text-[10px] text-slate-400 pt-0.5">
        Edit to what you actually did — saves automatically.
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  onCommit,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
}) {
  return (
    <label className="block">
      <span className="text-[9.5px] uppercase tracking-wide text-slate-500 font-semibold">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        className="mt-0.5 w-full text-sm text-center tabular-nums border border-slate-200 rounded-lg px-1 py-1 focus:outline-none focus:border-teal-500"
      />
    </label>
  );
}

// Countdown timer for a timed set. Counts down from totalSeconds; fires
// onComplete once when it hits zero (which marks the set done + prefills time).
function Timer({ totalSeconds, onComplete }: { totalSeconds: number; onComplete: () => void }) {
  const [remaining, setRemaining] = useState(totalSeconds);
  const [running, setRunning] = useState(false);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!running) return;
    if (remaining <= 0) return;
    const t = setTimeout(() => setRemaining((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [running, remaining]);

  useEffect(() => {
    if (remaining <= 0 && running && !firedRef.current) {
      firedRef.current = true;
      setRunning(false);
      onComplete();
    }
  }, [remaining, running, onComplete]);

  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;
  const reset = () => {
    firedRef.current = false;
    setRunning(false);
    setRemaining(totalSeconds);
  };

  return (
    <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-2.5 py-1.5">
      <div className="text-xl font-semibold tabular-nums text-slate-800 w-16">
        {mm}:{String(ss).padStart(2, "0")}
      </div>
      <button
        type="button"
        onClick={() => setRunning((v) => !v)}
        className="flex items-center gap-1 text-[12px] font-semibold bg-teal-600 text-white px-2.5 py-1 rounded-lg hover:bg-teal-700"
      >
        {running ? <Pause size={13} /> : <Play size={13} />}
        {running ? "Pause" : remaining === totalSeconds ? "Start" : "Resume"}
      </button>
      <button
        type="button"
        onClick={reset}
        className="flex items-center gap-1 text-[12px] text-slate-500 px-2 py-1 rounded-lg hover:bg-slate-100"
      >
        <RotateCcw size={13} /> Reset
      </button>
    </div>
  );
}
