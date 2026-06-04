"use client";

import { useState, useTransition } from "react";
import { Target, Heart } from "lucide-react";
import { updateZone, updateTargets } from "./actions";

type Zone = {
  id: string;
  zoneKey: string;
  name: string;
  shortName: string;
  lowBpm: number;
  highBpm: number;
};

type Targets = {
  strengthPerWeek: number;
  zone2MinutesPerWeek: number;
  vo2maxMinutesPerWeek: number;
  mobilityPerWeek: number;
};

const ZONE_COLORS: Record<string, string> = {
  z1: "bg-slate-300",
  z2: "bg-teal-500",
  z3: "bg-blue-500",
  z4: "bg-amber-500",
  z5: "bg-rose-500",
};

export function ZonesTargetsClient({ zones, targets }: { zones: Zone[]; targets: Targets }) {
  return (
    <>
      <TargetsCard initial={targets} />
      <ZonesCard initial={zones} />
    </>
  );
}

function TargetsCard({ initial }: { initial: Targets }) {
  const [form, setForm] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const dirty =
    form.strengthPerWeek !== initial.strengthPerWeek ||
    form.zone2MinutesPerWeek !== initial.zone2MinutesPerWeek ||
    form.vo2maxMinutesPerWeek !== initial.vo2maxMinutesPerWeek ||
    form.mobilityPerWeek !== initial.mobilityPerWeek;

  const save = () => {
    setSaved(false);
    startTransition(async () => {
      await updateTargets(form);
      setSaved(true);
    });
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center gap-2 mb-1">
        <Target size={14} className="text-teal-700" />
        <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Weekly targets</div>
      </div>
      <div className="text-[11px] text-slate-500 mb-4">
        These drive the load bars on each patient&apos;s training plan card.
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <NumField label="Strength sessions / wk"
          value={form.strengthPerWeek}
          onChange={(v) => { setForm((p) => ({ ...p, strengthPerWeek: v })); setSaved(false); }}
          tone="slate" />
        <NumField label="Zone 2 minutes / wk"
          value={form.zone2MinutesPerWeek}
          onChange={(v) => { setForm((p) => ({ ...p, zone2MinutesPerWeek: v })); setSaved(false); }}
          tone="teal" />
        <NumField label="VO₂ max minutes / wk"
          value={form.vo2maxMinutesPerWeek}
          onChange={(v) => { setForm((p) => ({ ...p, vo2maxMinutesPerWeek: v })); setSaved(false); }}
          tone="rose"
          hint="Work-interval minutes only" />
        <NumField label="Mobility snacks / wk"
          value={form.mobilityPerWeek}
          onChange={(v) => { setForm((p) => ({ ...p, mobilityPerWeek: v })); setSaved(false); }}
          tone="amber" />
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button onClick={save} disabled={!dirty || pending}
          className={`text-sm font-semibold px-4 py-2 rounded-lg ${
            dirty && !pending ? "bg-teal-700 text-white hover:bg-teal-800" : "bg-slate-200 text-slate-400 cursor-not-allowed"
          }`}>
          {pending ? "Saving…" : "Save targets"}
        </button>
        {saved && !dirty && <span className="text-xs text-emerald-700">Saved.</span>}
      </div>
    </section>
  );
}

function NumField({ label, value, onChange, tone = "slate", hint }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  tone?: "slate" | "teal" | "rose" | "amber";
  hint?: string;
}) {
  const cls =
    tone === "teal" ? "bg-teal-50 border-teal-200 text-teal-800"
    : tone === "rose" ? "bg-rose-50 border-rose-200 text-rose-800"
    : tone === "amber" ? "bg-amber-50 border-amber-200 text-amber-800"
    : "bg-slate-50 border-slate-200 text-slate-800";
  return (
    <div className={`rounded-xl border p-3 ${cls}`}>
      <div className="text-[10px] uppercase tracking-wide font-semibold">{label}</div>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="w-full mt-1 text-base font-semibold border border-white/40 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-teal-500 tabular-nums text-slate-900"
      />
      {hint && <div className="text-[10px] opacity-80 mt-1">{hint}</div>}
    </div>
  );
}

function ZonesCard({ initial }: { initial: Zone[] }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center gap-2 mb-1">
        <Heart size={14} className="text-rose-600" />
        <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Heart rate zones</div>
      </div>
      <div className="text-[11px] text-slate-500 mb-4">
        Edit the bpm boundaries used by Zone 2 and VO₂ max sessions.
      </div>
      <div className="space-y-2">
        {initial.map((z) => <ZoneRow key={z.id} zone={z} />)}
      </div>
    </section>
  );
}

function ZoneRow({ zone }: { zone: Zone }) {
  const [form, setForm] = useState(zone);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const dirty =
    form.name !== zone.name ||
    form.shortName !== zone.shortName ||
    form.lowBpm !== zone.lowBpm ||
    form.highBpm !== zone.highBpm;

  const save = () => {
    setSaved(false);
    startTransition(async () => {
      await updateZone({
        id: form.id,
        name: form.name,
        shortName: form.shortName,
        lowBpm: form.lowBpm,
        highBpm: form.highBpm,
      });
      setSaved(true);
    });
  };

  const colorCls = ZONE_COLORS[form.zoneKey] ?? "bg-slate-300";

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-3">
      <span className={`w-9 h-9 rounded-lg ${colorCls} text-white flex items-center justify-center text-xs font-bold flex-shrink-0`}>
        {form.shortName}
      </span>
      <input
        value={form.name}
        onChange={(e) => { setForm((p) => ({ ...p, name: e.target.value })); setSaved(false); }}
        className="flex-1 text-sm font-semibold text-slate-900 border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-teal-500"
      />
      <div className="flex items-center gap-1">
        <input type="number" value={form.lowBpm}
          onChange={(e) => { setForm((p) => ({ ...p, lowBpm: Math.max(40, Math.min(220, Number(e.target.value) || 0)) })); setSaved(false); }}
          className="w-16 text-sm text-slate-900 border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-teal-500 tabular-nums text-center" />
        <span className="text-xs text-slate-400">–</span>
        <input type="number" value={form.highBpm}
          onChange={(e) => { setForm((p) => ({ ...p, highBpm: Math.max(40, Math.min(220, Number(e.target.value) || 0)) })); setSaved(false); }}
          className="w-16 text-sm text-slate-900 border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-teal-500 tabular-nums text-center" />
        <span className="text-[10px] text-slate-500 ml-1">bpm</span>
      </div>
      <button onClick={save} disabled={!dirty || pending}
        className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${
          dirty && !pending ? "bg-teal-700 text-white hover:bg-teal-800" : "bg-slate-200 text-slate-400 cursor-not-allowed"
        }`}>
        {pending ? "…" : "Save"}
      </button>
      {saved && !dirty && <span className="text-[11px] text-emerald-700">✓</span>}
    </div>
  );
}
