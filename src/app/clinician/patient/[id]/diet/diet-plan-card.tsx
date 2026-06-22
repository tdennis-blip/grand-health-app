"use client";

import { useMemo, useState, useTransition } from "react";
import { Apple } from "lucide-react";
import { upsertDietPlan } from "./actions";

type DietForm = {
  rmrValue: number | null;
  rmrMethod: string | null;
  rmrMeasuredOn: string | null;
  rmrMeasuredBy: string | null;
  activityMultiplier: number;
  activityMode: "static" | "dynamic";
  baseMultiplier: number;
  activityCreditPct: number;
  deficitKcal: number;
  proteinPerKg: number;
  carbsPct: number;
  fatPct: number;
  fiberG: number;
  mealsPerDay: number;
  waterL: number;
  notes: string | null;
};

const DEFAULTS: DietForm = {
  rmrValue: null,
  rmrMethod: null,
  rmrMeasuredOn: null,
  rmrMeasuredBy: null,
  activityMultiplier: 1.55,
  activityMode: "static",
  baseMultiplier: 1.2,
  activityCreditPct: 50,
  deficitKcal: 0,
  proteinPerKg: 1.6,
  carbsPct: 45,
  fatPct: 30,
  fiberG: 35,
  mealsPerDay: 3,
  waterL: 3.0,
  notes: null,
};

const ACTIVITY_LEVELS = [
  { mult: 1.20, label: "Sedentary" },
  { mult: 1.375, label: "Lightly active" },
  { mult: 1.55, label: "Moderately active" },
  { mult: 1.725, label: "Very active" },
  { mult: 1.90, label: "Athlete" },
];

const BASE_LEVELS = [
  { mult: 1.10, label: "Resting only" },
  { mult: 1.20, label: "Sedentary base" },
  { mult: 1.30, label: "Light base" },
];

export function DietPlanCard({
  patientId,
  weightKg,
  initial,
}: {
  patientId: string;
  weightKg: number | null;
  initial: DietForm | null;
}) {
  const [form, setForm] = useState<DietForm>(initial ?? DEFAULTS);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const update = <K extends keyof DietForm>(k: K, v: DietForm[K]) => {
    setForm((p) => ({ ...p, [k]: v }));
    setSaved(false);
  };

  // Example active-calorie burn used only to preview the dynamic formula.
  const EXAMPLE_ACTIVE_KCAL = 400;

  // Derived targets
  const derived = useMemo(() => {
    const rmr = form.rmrValue || 0;
    let base: number;
    let exampleCredit = 0;
    if (form.activityMode === "dynamic") {
      base = Math.round(rmr * (form.baseMultiplier || 1.2));
      exampleCredit = Math.round(EXAMPLE_ACTIVE_KCAL * (form.activityCreditPct / 100));
    } else {
      base = Math.round(rmr * (form.activityMultiplier || 1.55));
    }
    const tdee = base + exampleCredit;
    const goalKcal = tdee + form.deficitKcal;
    const proteinG = weightKg ? Math.round(weightKg * form.proteinPerKg) : 0;
    const carbsKcal = Math.round(goalKcal * (form.carbsPct / 100));
    const fatKcal = Math.round(goalKcal * (form.fatPct / 100));
    const carbsG = Math.round(carbsKcal / 4);
    const fatG = Math.round(fatKcal / 9);
    return { tdee, goalKcal, proteinG, carbsG, fatG, base, exampleCredit };
  }, [form, weightKg]);

  const macroSum = form.carbsPct + form.fatPct; // protein is grams-based, not %
  const macroWarning = macroSum > 100 ? "Carbs + fat exceed 100% of kcal." : null;

  const initialForCompare = initial ?? DEFAULTS;
  const dirty =
    form.rmrValue !== initialForCompare.rmrValue ||
    form.rmrMethod !== initialForCompare.rmrMethod ||
    form.rmrMeasuredOn !== initialForCompare.rmrMeasuredOn ||
    form.rmrMeasuredBy !== initialForCompare.rmrMeasuredBy ||
    form.activityMultiplier !== initialForCompare.activityMultiplier ||
    form.activityMode !== initialForCompare.activityMode ||
    form.baseMultiplier !== initialForCompare.baseMultiplier ||
    form.activityCreditPct !== initialForCompare.activityCreditPct ||
    form.deficitKcal !== initialForCompare.deficitKcal ||
    form.proteinPerKg !== initialForCompare.proteinPerKg ||
    form.carbsPct !== initialForCompare.carbsPct ||
    form.fatPct !== initialForCompare.fatPct ||
    form.fiberG !== initialForCompare.fiberG ||
    form.mealsPerDay !== initialForCompare.mealsPerDay ||
    form.waterL !== initialForCompare.waterL ||
    form.notes !== initialForCompare.notes;

  const save = () => {
    setSaved(false);
    startTransition(async () => {
      await upsertDietPlan({
        patientId,
        rmrValue: form.rmrValue,
        rmrMethod: form.rmrMethod,
        rmrMeasuredOn: form.rmrMeasuredOn,
        rmrMeasuredBy: form.rmrMeasuredBy,
        activityMultiplier: form.activityMultiplier,
        activityMode: form.activityMode,
        baseMultiplier: form.baseMultiplier,
        activityCreditPct: form.activityCreditPct,
        deficitKcal: form.deficitKcal,
        proteinPerKg: form.proteinPerKg,
        carbsPct: form.carbsPct,
        fatPct: form.fatPct,
        fiberG: form.fiberG,
        mealsPerDay: form.mealsPerDay,
        waterL: form.waterL,
        notes: form.notes,
      });
      setSaved(true);
    });
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center">
            <Apple size={16} />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">Diet plan</div>
            <div className="text-[11px] text-slate-500">Targets the patient sees on their Diet screen.</div>
          </div>
        </div>
        {weightKg == null && (
          <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
            Weight missing
          </span>
        )}
      </div>

      {/* Derived targets — live preview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        <Tile
          label={form.activityMode === "dynamic" ? "Goal (example day)" : "Daily kcal goal"}
          value={derived.goalKcal.toLocaleString()}
          sub={
            form.activityMode === "dynamic"
              ? `Base ${derived.base.toLocaleString()} + ${derived.exampleCredit} active${form.deficitKcal !== 0 ? ` · ${form.deficitKcal > 0 ? "+" : ""}${form.deficitKcal}` : ""}`
              : `TDEE ${derived.tdee.toLocaleString()}${form.deficitKcal !== 0 ? ` · ${form.deficitKcal > 0 ? "+" : ""}${form.deficitKcal}` : ""}`
          }
          tone="orange"
        />
        <Tile label="Protein" value={`${derived.proteinG}g`} sub={weightKg ? `${form.proteinPerKg.toFixed(1)} g/kg × ${weightKg} kg` : "set weight first"} tone="teal" />
        <Tile label="Carbs" value={`${derived.carbsG}g`} sub={`${form.carbsPct}% of kcal`} tone="amber" />
        <Tile label="Fat"   value={`${derived.fatG}g`}   sub={`${form.fatPct}% of kcal`} tone="rose" />
      </div>
      {macroWarning && (
        <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 mb-3">
          {macroWarning}
        </div>
      )}

      {/* RMR */}
      <div className="border-t border-slate-100 pt-3 space-y-3">
        <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Resting metabolic rate</div>
        <div className="grid grid-cols-2 gap-3">
          <NumField label="RMR (kcal/day)" value={form.rmrValue ?? 0}
            onChange={(v) => update("rmrValue", v || null)} />
          <Field label="Method" value={form.rmrMethod ?? ""}
            onChange={(v) => update("rmrMethod", v || null)}
            placeholder="Indirect calorimetry" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Measured on" type="date" value={form.rmrMeasuredOn ?? ""}
            onChange={(v) => update("rmrMeasuredOn", v || null)} />
          <Field label="Measured by" value={form.rmrMeasuredBy ?? ""}
            onChange={(v) => update("rmrMeasuredBy", v || null)}
            placeholder="Dr. Priya Rao" />
        </div>
      </div>

      {/* Activity + deficit */}
      <div className="border-t border-slate-100 pt-3 mt-3 space-y-3">
        <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Energy balance</div>

        {/* Mode toggle */}
        <div>
          <Label>How to count activity</Label>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => update("activityMode", "static")}
              className={`text-xs px-3 py-1.5 rounded-lg border transition ${
                form.activityMode === "static" ? "bg-teal-700 text-white border-teal-700" : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
              }`}
            >
              Static multiplier
            </button>
            <button
              type="button"
              onClick={() => update("activityMode", "dynamic")}
              className={`text-xs px-3 py-1.5 rounded-lg border transition ${
                form.activityMode === "dynamic" ? "bg-teal-700 text-white border-teal-700" : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
              }`}
            >
              Dynamic (track exercise)
            </button>
          </div>
          <div className="text-[10.5px] text-slate-500 leading-snug mt-1.5">
            {form.activityMode === "static"
              ? "Fixed daily target: RMR × multiplier. Doesn't change with workouts."
              : "Daily target adjusts to logged activity: RMR × base + a share of that day's active calories (wearable, or estimated from scheduled sessions)."}
          </div>
        </div>

        {form.activityMode === "static" ? (
          <div>
            <Label>Activity multiplier</Label>
            <div className="flex flex-wrap gap-1.5">
              {ACTIVITY_LEVELS.map((a) => {
                const active = Math.abs(a.mult - form.activityMultiplier) < 0.01;
                return (
                  <button
                    key={a.label}
                    type="button"
                    onClick={() => update("activityMultiplier", a.mult)}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition ${
                      active ? "bg-teal-700 text-white border-teal-700" : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    {a.label} · {a.mult.toFixed(2)}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <>
            <div>
              <Label>Resting base multiplier</Label>
              <div className="flex flex-wrap gap-1.5">
                {BASE_LEVELS.map((a) => {
                  const active = Math.abs(a.mult - form.baseMultiplier) < 0.01;
                  return (
                    <button
                      key={a.label}
                      type="button"
                      onClick={() => update("baseMultiplier", a.mult)}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition ${
                        active ? "bg-teal-700 text-white border-teal-700" : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      {a.label} · {a.mult.toFixed(2)}
                    </button>
                  );
                })}
              </div>
              <div className="text-[10.5px] text-slate-500 leading-snug mt-1.5">
                Near-sedentary on purpose — exercise is added on top, so a high base would double-count.
              </div>
            </div>
            <div>
              <Label>Credit {form.activityCreditPct}% of active calories</Label>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={form.activityCreditPct}
                onChange={(e) => update("activityCreditPct", Math.round(Number(e.target.value)))}
                className="w-full accent-teal-700"
              />
              <div className="text-[10.5px] text-slate-500 leading-snug mt-1">
                e.g. a {EXAMPLE_ACTIVE_KCAL} kcal workout adds <span className="font-semibold tabular-nums">+{derived.exampleCredit}</span> kcal. 50–75% avoids over-eating back exercise.
              </div>
            </div>
          </>
        )}

        <NumField label="Deficit / surplus (kcal/day)" value={form.deficitKcal}
          onChange={(v) => update("deficitKcal", v)}
          hint="Negative = deficit, positive = surplus, 0 = maintain." />
      </div>

      {/* Macros */}
      <div className="border-t border-slate-100 pt-3 mt-3 space-y-3">
        <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Macros</div>
        <div className="grid grid-cols-3 gap-3">
          <NumField label="Protein (g/kg)" step="0.1" value={form.proteinPerKg}
            onChange={(v) => update("proteinPerKg", v)} />
          <NumField label="Carbs (% kcal)" value={form.carbsPct}
            onChange={(v) => update("carbsPct", Math.round(v))} />
          <NumField label="Fat (% kcal)" value={form.fatPct}
            onChange={(v) => update("fatPct", Math.round(v))} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <NumField label="Fiber (g)" value={form.fiberG}
            onChange={(v) => update("fiberG", Math.round(v))} />
          <NumField label="Meals / day" value={form.mealsPerDay}
            onChange={(v) => update("mealsPerDay", Math.round(v))} />
          <NumField label="Water (L)" step="0.1" value={form.waterL}
            onChange={(v) => update("waterL", v)} />
        </div>
      </div>

      <div className="border-t border-slate-100 pt-3 mt-3">
        <label className="block">
          <Label>Patient-facing note</Label>
          <textarea
            rows={2}
            value={form.notes ?? ""}
            onChange={(e) => update("notes", e.target.value || null)}
            placeholder="Mediterranean-style baseline. Saturated fat under 10% of calories."
            className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
          />
        </label>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={save}
          disabled={!dirty || pending}
          className={`text-sm font-semibold px-4 py-2 rounded-lg ${
            dirty && !pending ? "bg-teal-700 text-white hover:bg-teal-800" : "bg-slate-200 text-slate-400 cursor-not-allowed"
          }`}
        >
          {pending ? "Saving…" : initial ? "Save changes" : "Save diet plan"}
        </button>
        {saved && !dirty && <span className="text-xs text-emerald-700">Saved.</span>}
      </div>
    </section>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: "orange" | "teal" | "amber" | "rose" }) {
  const cls =
    tone === "orange" ? "bg-orange-50 border-orange-200 text-orange-900"
    : tone === "teal" ? "bg-teal-50 border-teal-200 text-teal-900"
    : tone === "amber" ? "bg-amber-50 border-amber-200 text-amber-900"
    : "bg-rose-50 border-rose-200 text-rose-900";
  return (
    <div className={`rounded-xl border p-3 ${cls}`}>
      <div className="text-[10px] uppercase tracking-wide font-semibold opacity-80">{label}</div>
      <div className="text-lg font-semibold tabular-nums leading-tight mt-0.5">{value}</div>
      {sub && <div className="text-[10px] opacity-70 leading-snug mt-0.5">{sub}</div>}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mb-1">{children}</div>;
}

function Field({ label, type, value, onChange, placeholder }: { label: string; type?: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
      />
    </label>
  );
}

function NumField({ label, value, onChange, step, hint }: { label: string; value: number; onChange: (v: number) => void; step?: string; hint?: string }) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <input
        type="number"
        step={step ?? "1"}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500 tabular-nums"
      />
      {hint && <div className="text-[10px] text-slate-500 mt-1">{hint}</div>}
    </label>
  );
}
