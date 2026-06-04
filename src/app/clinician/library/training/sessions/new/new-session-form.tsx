"use client";

import { useState, useTransition } from "react";
import { Dumbbell, Activity, Flame, Sparkles } from "lucide-react";
import { createSession } from "../actions";

type Kind = "strength" | "zone2" | "vo2max" | "mobility";

const KIND_OPTIONS = [
  { id: "strength" as const, label: "Strength", Icon: Dumbbell, blurb: "Sets × reps × weight, with attached exercises.", active: "bg-blue-50 text-blue-900 border-blue-300" },
  { id: "zone2"    as const, label: "Zone 2",   Icon: Activity, blurb: "Steady aerobic block. Modality, duration, target zone.", active: "bg-teal-50 text-teal-900 border-teal-300" },
  { id: "vo2max"   as const, label: "VO₂ max",  Icon: Flame,    blurb: "Interval protocol. Warmup, rounds × work/recovery, cooldown.", active: "bg-rose-50 text-rose-900 border-rose-300" },
  { id: "mobility" as const, label: "Mobility", Icon: Sparkles, blurb: "Flow with mobility exercises and hold times.", active: "bg-amber-50 text-amber-900 border-amber-300" },
];

export function NewSessionForm() {
  const [kind, setKind] = useState<Kind>("strength");
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const valid = name.trim().length > 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
      <div>
        <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mb-1.5">Session type</div>
        <div className="grid grid-cols-2 gap-2">
          {KIND_OPTIONS.map((opt) => {
            const Icon = opt.Icon;
            const active = kind === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setKind(opt.id)}
                className={`flex items-start gap-2 px-3 py-2.5 rounded-xl border text-left transition ${
                  active ? opt.active : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                }`}
              >
                <Icon size={16} className="mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{opt.label}</div>
                  <div className="text-[11px] opacity-80 leading-snug">{opt.blurb}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <label className="block">
        <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={
            kind === "vo2max" ? "Norwegian 4×4" :
            kind === "zone2" ? "Zone 2 Cycle" :
            kind === "mobility" ? "Morning Mobility Flow" :
            "Push Day"
          }
          className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
        />
      </label>

      <div className="flex items-center justify-end gap-2">
        <button
          onClick={() => valid && startTransition(() => createSession({ kind, name }))}
          disabled={!valid || pending}
          className={`text-sm font-semibold px-4 py-2 rounded-lg ${
            valid && !pending ? "bg-teal-700 text-white hover:bg-teal-800" : "bg-slate-200 text-slate-400 cursor-not-allowed"
          }`}
        >
          {pending ? "Creating…" : "Create & edit"}
        </button>
      </div>
    </div>
  );
}
