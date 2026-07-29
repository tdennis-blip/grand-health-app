"use client";

import { useState, useTransition } from "react";
import { Dumbbell, Activity, Flame, Sparkles, Plus, X, Check } from "lucide-react";
import { setPrescribedIntent, addCustomIntent, removeCustomIntent } from "./activity-intent-actions";

type Kind = "strength" | "zone2" | "vo2max" | "mobility";
type Status = "planned" | "declined" | "done";

type Prescribed = { sessionId: string; name: string; kind: Kind; estMinutes: number; estKcal: number };
type Custom = { id: string; label: string; expectedKcal: number | null; minutes: number | null };

const KIND_ICON: Record<Kind, typeof Dumbbell> = {
  strength: Dumbbell, zone2: Activity, vo2max: Flame, mobility: Sparkles,
};

export function ActivityCheckin({
  logDate,
  weightKg,
  prescribed,
  initialStatuses,
  customs,
  plannedTotal,
}: {
  logDate: string;
  weightKg: number | null;
  prescribed: Prescribed[];
  initialStatuses: Record<string, Status>;
  customs: Custom[];
  plannedTotal: number;
}) {
  const [statuses, setStatuses] = useState<Record<string, Status>>(initialStatuses);
  const [pending, startTransition] = useTransition();

  const setStatus = (s: Prescribed, status: Status) => {
    setStatuses((p) => ({ ...p, [s.sessionId]: status }));
    startTransition(() =>
      setPrescribedIntent({ logDate, sessionId: s.sessionId, kind: s.kind, status, expectedKcal: s.estKcal })
    );
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Flame size={15} className="text-rose-500" />
          <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Today&apos;s activity plan</div>
        </div>
        <span className="text-[11px] text-slate-500">
          +<span className="font-semibold text-emerald-700 tabular-nums">{plannedTotal.toLocaleString()}</span> kcal added
        </span>
      </div>

      <div className="text-[12px] text-slate-500 leading-snug">
        Tell us what you plan to do — your goal adjusts for the workouts you&apos;ll actually do.
      </div>

      {prescribed.length === 0 && customs.length === 0 && (
        <div className="text-[12px] text-slate-500 italic bg-slate-50 rounded-lg p-2.5 text-center">
          Nothing prescribed today. Add anything you&apos;re planning below.
        </div>
      )}

      {prescribed.map((s) => {
        const Icon = KIND_ICON[s.kind];
        const st = statuses[s.sessionId] ?? "planned";
        return (
          <div key={s.sessionId} className="rounded-xl border border-slate-200 p-2.5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center flex-shrink-0">
                <Icon size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-900 truncate">{s.name}</div>
                <div className="text-[11px] text-slate-500">~{s.estMinutes}m · est. {s.estKcal.toLocaleString()} kcal</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-1.5 mt-2">
              <Pill active={st === "planned"} tone="teal" onClick={() => setStatus(s, "planned")} disabled={pending}>Will do</Pill>
              <Pill active={st === "done"} tone="emerald" onClick={() => setStatus(s, "done")} disabled={pending}>Already did</Pill>
              <Pill active={st === "declined"} tone="slate" onClick={() => setStatus(s, "declined")} disabled={pending}>Skipping</Pill>
            </div>
          </div>
        );
      })}

      {customs.map((c) => (
        <div key={c.id} className="rounded-xl border border-slate-200 p-2.5 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
            <Activity size={14} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-slate-900 truncate">{c.label}</div>
            <div className="text-[11px] text-slate-500">
              {c.minutes ? `${c.minutes}m · ` : ""}est. {(c.expectedKcal ?? 0).toLocaleString()} kcal
            </div>
          </div>
          <button
            onClick={() => startTransition(() => removeCustomIntent({ id: c.id }))}
            disabled={pending}
            className="text-slate-400 hover:text-rose-600 p-1"
            aria-label="Remove activity"
          >
            <X size={15} />
          </button>
        </div>
      ))}

      <AddCustom logDate={logDate} weightKg={weightKg} pending={pending} startTransition={startTransition} />
    </section>
  );
}

function AddCustom({
  logDate,
  weightKg,
  pending,
  startTransition,
}: {
  logDate: string;
  weightKg: number | null;
  pending: boolean;
  startTransition: (cb: () => void) => void;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [minutes, setMinutes] = useState("");
  const [manualKcal, setManualKcal] = useState("");

  const submit = () => {
    if (!label.trim()) return;
    const m = minutes.trim() === "" ? null : Math.max(0, parseInt(minutes, 10) || 0);
    const k = manualKcal.trim() === "" ? null : Math.max(0, parseInt(manualKcal, 10) || 0);
    startTransition(() => addCustomIntent({ logDate, label: label.trim(), minutes: m, manualKcal: k, weightKg }));
    setLabel(""); setMinutes(""); setManualKcal(""); setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-[12px] font-semibold text-teal-700 inline-flex items-center gap-1"
      >
        <Plus size={13} /> Add a different activity
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-2.5 space-y-2">
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="e.g. Tennis, long walk, hike"
        className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-teal-500"
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[9.5px] uppercase tracking-wide text-slate-500 font-semibold">Minutes</span>
          <input
            type="number" inputMode="numeric" value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            placeholder="est. from time"
            className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-teal-500 tabular-nums"
          />
        </label>
        <label className="block">
          <span className="text-[9.5px] uppercase tracking-wide text-slate-500 font-semibold">or kcal</span>
          <input
            type="number" inputMode="numeric" value={manualKcal}
            onChange={(e) => setManualKcal(e.target.value)}
            placeholder="if you know it"
            className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-teal-500 tabular-nums"
          />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={submit}
          disabled={pending || !label.trim()}
          className={`text-[12px] font-semibold px-3 py-1.5 rounded-lg inline-flex items-center gap-1 ${
            label.trim() && !pending ? "bg-teal-700 text-white hover:bg-teal-800" : "bg-slate-200 text-slate-400 cursor-not-allowed"
          }`}
        >
          <Check size={13} /> Add
        </button>
        <button onClick={() => setOpen(false)} className="text-[12px] text-slate-500 px-2 py-1.5">Cancel</button>
      </div>
    </div>
  );
}

function Pill({
  active, tone, onClick, disabled, children,
}: {
  active: boolean;
  tone: "teal" | "emerald" | "slate";
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const activeCls =
    tone === "teal" ? "bg-teal-600 text-white border-teal-600"
    : tone === "emerald" ? "bg-emerald-600 text-white border-emerald-600"
    : "bg-slate-500 text-white border-slate-500";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`text-[12px] font-semibold py-1.5 rounded-lg border transition-colors ${
        active ? activeCls : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
      }`}
    >
      {children}
    </button>
  );
}
