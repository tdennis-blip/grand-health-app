"use client";

import { useState, useTransition } from "react";
import { Trophy, TrendingDown } from "lucide-react";
import { upsertGrand100Baseline } from "./actions";

type Baseline = {
  vo2Now: number | null;
  gripKg: number | null;
  squat1rmLb: number | null;
  strengthPercentile: number | null;
  mobilityPercentile: number | null;
  measuredOn: string | null;
};

type BackcastActivity = {
  id: string;
  name: string;
  requiredVo2: number;
  requiredStrengthLb: number | null;
  targetAge: number;
};

const EMPTY: Baseline = {
  vo2Now: null,
  gripKg: null,
  squat1rmLb: null,
  strengthPercentile: null,
  mobilityPercentile: null,
  measuredOn: null,
};

// Mirror of GRAND100_DECLINE in src/lib/grand100.ts — kept here so this
// client component doesn't pull a server-only module. Trained path only;
// the back-cast we show clinicians is "what they need today assuming they
// train", which matches the patient-side row in the card.
const DECLINE = {
  vo2max:   { trained: 5 },  // %/decade
  strength: { trained: 8 },
} as const;

function projectDecline(current: number, currentAge: number, targetAge: number, pctPerDecade: number): number {
  const decades = (targetAge - currentAge) / 10;
  return current * Math.pow(1 - pctPerDecade / 100, decades);
}

function requiredToday(target: number, currentAge: number, targetAge: number, pctPerDecade: number): number {
  const decades = (targetAge - currentAge) / 10;
  const factor = Math.pow(1 - pctPerDecade / 100, decades);
  if (factor <= 0) return target;
  return target / factor;
}

export function Grand100BaselineCard({
  patientId,
  initial,
  ageNow,
  activities,
}: {
  patientId: string;
  initial: Baseline | null;
  ageNow?: number | null;
  activities?: BackcastActivity[];
}) {
  const baseline = initial ?? EMPTY;
  const [form, setForm] = useState<Baseline>(baseline);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const update = <K extends keyof Baseline>(k: K, v: Baseline[K]) => {
    setForm((p) => ({ ...p, [k]: v }));
    setSaved(false);
  };

  const dirty =
    form.vo2Now !== baseline.vo2Now ||
    form.gripKg !== baseline.gripKg ||
    form.squat1rmLb !== baseline.squat1rmLb ||
    form.strengthPercentile !== baseline.strengthPercentile ||
    form.mobilityPercentile !== baseline.mobilityPercentile ||
    form.measuredOn !== baseline.measuredOn;

  const save = () => {
    setSaved(false);
    startTransition(async () => {
      await upsertGrand100Baseline({
        patientId,
        vo2Now: form.vo2Now ?? undefined,
        gripKg: form.gripKg ?? undefined,
        squat1rmLb: form.squat1rmLb ?? undefined,
        strengthPercentile: form.strengthPercentile ?? undefined,
        mobilityPercentile: form.mobilityPercentile ?? undefined,
        measuredOn: form.measuredOn ?? undefined,
      });
      setSaved(true);
    });
  };

  // Back-cast readouts — only render when we have enough to compute them.
  const canProject = ageNow != null && (form.vo2Now != null || form.squat1rmLb != null);
  const activitiesToShow = activities ?? [];

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
          <Trophy size={16} />
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-900">Grand 100 baseline</div>
          <div className="text-[11px] text-slate-500">Drives the patient&apos;s VO₂ + strength trajectories and back-cast targets.</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <NumField label="VO₂ max (mL/kg/min)" value={form.vo2Now}
          onChange={(v) => update("vo2Now", v)} placeholder="48" />
        <Field label="Measured on" type="date" value={form.measuredOn ?? ""}
          onChange={(v) => update("measuredOn", v || null)} />
        <NumField label="Grip strength (kg)" value={form.gripKg}
          onChange={(v) => update("gripKg", v)} placeholder="52" />
        <NumField label="Squat 1RM (lb)" value={form.squat1rmLb}
          onChange={(v) => update("squat1rmLb", v)} placeholder="215" />
        <NumField label="Strength percentile" value={form.strengthPercentile}
          onChange={(v) => update("strengthPercentile", v)} placeholder="80" hint="0–100" />
        <NumField label="Mobility percentile" value={form.mobilityPercentile}
          onChange={(v) => update("mobilityPercentile", v)} placeholder="65" hint="0–100" />
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={save}
          disabled={!dirty || pending}
          className={`text-sm font-semibold px-4 py-2 rounded-lg ${
            dirty && !pending ? "bg-teal-700 text-white hover:bg-teal-800" : "bg-slate-200 text-slate-400 cursor-not-allowed"
          }`}
        >
          {pending ? "Saving…" : initial ? "Save changes" : "Save baseline"}
        </button>
        {saved && !dirty && <span className="text-xs text-emerald-700">Saved.</span>}
      </div>

      {/* Back-cast — per-activity floors right now */}
      {canProject && ageNow != null && activitiesToShow.length > 0 && (
        <div className="mt-5 pt-4 border-t border-slate-100">
          <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold flex items-center gap-1.5 mb-2">
            <TrendingDown size={12} /> Back-cast at each activity&apos;s target age
          </div>
          <div className="text-[11px] text-slate-500 mb-2">
            With maintained training (VO₂ {DECLINE.vo2max.trained}%/dec, strength {DECLINE.strength.trained}%/dec).
            Green = patient currently above floor, amber = below.
          </div>
          <div className="overflow-x-auto -mx-1">
            <table className="min-w-full text-[12px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-1.5 font-semibold">Activity</th>
                  <th className="px-2 py-1.5 font-semibold tabular-nums text-right">@</th>
                  <th className="px-2 py-1.5 font-semibold tabular-nums text-right">VO₂ needed</th>
                  <th className="px-2 py-1.5 font-semibold tabular-nums text-right">Squat needed</th>
                </tr>
              </thead>
              <tbody>
                {activitiesToShow.map((a) => {
                  const reqVo2 = requiredToday(a.requiredVo2, ageNow, a.targetAge, DECLINE.vo2max.trained);
                  const meetsVo2 = form.vo2Now != null ? form.vo2Now >= reqVo2 : null;
                  const reqStrength = a.requiredStrengthLb != null
                    ? requiredToday(a.requiredStrengthLb, ageNow, a.targetAge, DECLINE.strength.trained)
                    : null;
                  const meetsStrength = reqStrength != null && form.squat1rmLb != null
                    ? form.squat1rmLb >= reqStrength
                    : null;
                  return (
                    <tr key={a.id} className="border-t border-slate-100">
                      <td className="px-2 py-1.5 text-slate-900 truncate max-w-[200px]">{a.name}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{a.targetAge}</td>
                      <td className={`px-2 py-1.5 text-right tabular-nums font-semibold ${meetsVo2 == null ? "text-slate-500" : meetsVo2 ? "text-emerald-700" : "text-amber-700"}`}>
                        ≥ {Math.round(reqVo2)}
                      </td>
                      <td className={`px-2 py-1.5 text-right tabular-nums font-semibold ${meetsStrength == null ? "text-slate-400" : meetsStrength ? "text-emerald-700" : "text-amber-700"}`}>
                        {reqStrength != null ? <>≥ {Math.round(reqStrength)} lb</> : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {form.vo2Now != null && (
            <div className="mt-2 text-[11px] text-slate-500">
              Current: VO₂ {form.vo2Now} mL/kg/min · projected at 100 (trained): <span className="tabular-nums font-semibold text-slate-700">{Math.round(projectDecline(form.vo2Now, ageNow, 100, DECLINE.vo2max.trained))}</span>
              {form.squat1rmLb != null && <>
                {" · "}Squat {form.squat1rmLb} lb · projected at 100: <span className="tabular-nums font-semibold text-slate-700">{Math.round(projectDecline(form.squat1rmLb, ageNow, 100, DECLINE.strength.trained))} lb</span>
              </>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Field({ label, type, value, onChange }: { label: string; type?: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
      />
    </label>
  );
}

function NumField({ label, value, onChange, placeholder, hint }: { label: string; value: number | null; onChange: (v: number | null) => void; placeholder?: string; hint?: string }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">{label}</span>
      <input
        type="number"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0))}
        placeholder={placeholder}
        className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500 tabular-nums"
      />
      {hint && <div className="text-[10px] text-slate-500 mt-1">{hint}</div>}
    </label>
  );
}
