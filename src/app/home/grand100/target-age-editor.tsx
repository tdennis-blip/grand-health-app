"use client";

import { useState, useTransition } from "react";
import { Check, Pencil } from "lucide-react";
import { setTargetAge } from "./target-actions";

export function TargetAgeEditor({
  activityId,
  initialAge,
}: {
  activityId: string;
  initialAge: number;
}) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [age, setAge] = useState<number>(initialAge);
  const [saved, setSaved] = useState(false);

  const commit = (next: number) => {
    const clamped = Math.max(40, Math.min(120, Math.round(next)));
    setAge(clamped);
    setSaved(false);
    startTransition(async () => {
      await setTargetAge({ activityId, targetAge: clamped });
      setSaved(true);
      setEditing(false);
    });
  };

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 flex items-center gap-1 hover:border-slate-300"
        title="Edit the age you want to be doing this"
      >
        <span className="tabular-nums font-semibold text-slate-800">@ {age}</span>
        {saved && <Check size={11} className="text-emerald-600" />}
        {!saved && <Pencil size={10} className="text-slate-400" />}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        autoFocus
        min={40}
        max={120}
        value={age}
        disabled={pending}
        onChange={(e) => setAge(Math.max(40, Math.min(120, Number(e.target.value) || 0)))}
        onBlur={() => commit(age)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(age);
          if (e.key === "Escape") {
            setAge(initialAge);
            setEditing(false);
          }
        }}
        className="w-14 text-[11px] font-semibold tabular-nums border border-teal-300 rounded-lg px-2 py-1 focus:outline-none focus:border-teal-500"
      />
      <span className="text-[10px] text-slate-500">yrs</span>
    </div>
  );
}
