"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { Check, Pencil, X } from "lucide-react";
import { updateMyProfile } from "./actions";

type Sex = "male" | "female" | "other" | "prefer-not-to-say";

export type ProfileInitial = {
  firstName: string;
  lastName: string;
  email: string;
  dob: string | null;          // YYYY-MM-DD
  sex: Sex | null;
  heightCm: number | null;
  weightKg: number | null;
  dietaryPreferences: string | null;
};

const SEX_OPTIONS: { id: Sex; label: string }[] = [
  { id: "male",                label: "Male" },
  { id: "female",              label: "Female" },
  { id: "other",               label: "Other" },
  { id: "prefer-not-to-say",   label: "Prefer not to say" },
];

const CM_PER_IN = 2.54;
const KG_PER_LB = 0.45359237;

function cmToFtIn(cm: number | null): { ft: number | null; inch: number | null } {
  if (cm == null) return { ft: null, inch: null };
  const totalIn = Math.round(cm / CM_PER_IN);
  return { ft: Math.floor(totalIn / 12), inch: totalIn % 12 };
}

function ftInToCm(ft: number | null, inch: number | null): number | null {
  if (ft == null && inch == null) return null;
  const totalIn = (ft ?? 0) * 12 + (inch ?? 0);
  if (totalIn <= 0) return null;
  return Math.round(totalIn * CM_PER_IN);
}

function kgToLb(kg: number | null): number | null {
  if (kg == null) return null;
  return Math.round(kg / KG_PER_LB);
}

function lbToKg(lb: number | null): number | null {
  if (lb == null) return null;
  return Math.round(lb * KG_PER_LB);
}

export function ProfileEditor({ initial }: { initial: ProfileInitial }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [units, setUnits] = useState<"metric" | "imperial">("imperial");

  const [firstName, setFirstName] = useState(initial.firstName);
  const [lastName, setLastName] = useState(initial.lastName);
  const [dob, setDob] = useState<string>(initial.dob ?? "");
  const [sex, setSex] = useState<Sex | "">(initial.sex ?? "");
  const [heightCm, setHeightCm] = useState<number | null>(initial.heightCm);
  const [weightKg, setWeightKg] = useState<number | null>(initial.weightKg);
  const [dietaryPreferences, setDietaryPreferences] = useState(initial.dietaryPreferences ?? "");

  const ft = cmToFtIn(heightCm).ft;
  const inch = cmToFtIn(heightCm).inch;
  const weightLb = kgToLb(weightKg);

  const cancel = () => {
    setFirstName(initial.firstName);
    setLastName(initial.lastName);
    setDob(initial.dob ?? "");
    setSex(initial.sex ?? "");
    setHeightCm(initial.heightCm);
    setWeightKg(initial.weightKg);
    setDietaryPreferences(initial.dietaryPreferences ?? "");
    setEditing(false);
    setSaved(false);
  };

  const dirty =
    firstName !== initial.firstName ||
    lastName !== initial.lastName ||
    (dob || null) !== initial.dob ||
    (sex || null) !== initial.sex ||
    heightCm !== initial.heightCm ||
    weightKg !== initial.weightKg ||
    dietaryPreferences !== (initial.dietaryPreferences ?? "");

  const valid = firstName.trim().length > 0 && lastName.trim().length > 0;

  const save = () => {
    if (!valid) return;
    setSaved(false);
    startTransition(async () => {
      await updateMyProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        dob: dob || undefined,
        sex: (sex || undefined) as Sex | undefined,
        heightCm: heightCm ?? undefined,
        weightKg: weightKg ?? undefined,
        dietaryPreferences: dietaryPreferences || undefined,
      });
      setSaved(true);
      setEditing(false);
    });
  };

  // ---------- Display mode ----------
  if (!editing) {
    const heightDisplay =
      heightCm == null
        ? "—"
        : units === "metric"
        ? `${heightCm} cm`
        : ft != null
        ? `${ft}′${(inch ?? 0).toString().padStart(2, "0")}″`
        : "—";
    const weightDisplay =
      weightKg == null
        ? "—"
        : units === "metric"
        ? `${weightKg} kg`
        : weightLb != null
        ? `${weightLb} lb`
        : "—";

    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Profile</div>
          <button
            onClick={() => setEditing(true)}
            className="text-[11px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-lg flex items-center gap-1"
          >
            <Pencil size={11} /> Edit
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Kv k="Name" v={`${firstName} ${lastName}`.trim() || "—"} />
          <Kv k="Email" v={initial.email} />
          <Kv k="DOB" v={dob || "—"} />
          <Kv k="Sex" v={SEX_OPTIONS.find((s) => s.id === sex)?.label ?? "—"} />
          <Kv k="Height" v={heightDisplay} />
          <Kv k="Weight" v={weightDisplay} />
        </div>
        {dietaryPreferences && (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Diet preferences &amp; restrictions</div>
            <div className="text-sm text-slate-700 mt-0.5 leading-snug">{dietaryPreferences}</div>
          </div>
        )}
        {saved && (
          <div className="text-[11px] text-emerald-700 flex items-center gap-1">
            <Check size={12} /> Saved.
          </div>
        )}
        <div className="text-[10px] text-slate-400 leading-snug">
          Your weight feeds your daily protein target. Your date of birth drives your Grand 100 trajectory.
        </div>
      </div>
    );
  }

  // ---------- Edit mode ----------
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Edit profile</div>
        <div className="inline-flex bg-slate-100 rounded-lg p-0.5 text-[10px]">
          {(["imperial", "metric"] as const).map((u) => (
            <button
              key={u}
              onClick={() => setUnits(u)}
              className={`px-2.5 py-1 rounded-md uppercase tracking-wide font-semibold transition ${
                units === u ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
              }`}
            >
              {u === "imperial" ? "ft / lb" : "cm / kg"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" value={firstName} onChange={setFirstName} placeholder="Casey" />
        <Field label="Last name" value={lastName} onChange={setLastName} placeholder="Morgan" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">DOB</span>
          <input
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
          />
        </label>
        <label className="block">
          <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">Sex</span>
          <select
            value={sex}
            onChange={(e) => setSex(e.target.value as Sex | "")}
            className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-teal-500"
          >
            <option value="">—</option>
            {SEX_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
      </div>

      {/* Height */}
      <div>
        <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">Height</span>
        {units === "metric" ? (
          <div className="mt-1">
            <NumInput
              value={heightCm}
              onChange={(v) => setHeightCm(v)}
              suffix="cm"
              placeholder="178"
            />
          </div>
        ) : (
          <div className="mt-1 grid grid-cols-2 gap-3">
            <NumInput
              value={ft}
              onChange={(v) => setHeightCm(ftInToCm(v, inch ?? 0))}
              suffix="ft"
              placeholder="5"
              max={8}
            />
            <NumInput
              value={inch}
              onChange={(v) => setHeightCm(ftInToCm(ft ?? 0, v))}
              suffix="in"
              placeholder="10"
              max={11}
            />
          </div>
        )}
      </div>

      {/* Weight */}
      <div>
        <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">Weight</span>
        <div className="mt-1">
          <WeightInput weightKg={weightKg} units={units} onChangeKg={setWeightKg} />
        </div>
      </div>

      {/* Dietary preferences */}
      <label className="block">
        <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">
          Diet preferences &amp; restrictions
        </span>
        <textarea
          value={dietaryPreferences}
          onChange={(e) => setDietaryPreferences(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="e.g. Vegetarian, lactose intolerant, no shellfish, prefer Mediterranean…"
          className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-teal-500"
        />
        <div className="text-right text-[9.5px] text-slate-400 -mt-0.5">{dietaryPreferences.length}/1000 · used by AI diet planner</div>
      </label>

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          onClick={cancel}
          className="text-sm text-slate-600 px-3 py-2 rounded-lg hover:bg-slate-50 flex items-center gap-1"
        >
          <X size={14} /> Cancel
        </button>
        <button
          onClick={save}
          disabled={!valid || !dirty || pending}
          className={`text-sm font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5 ${
            valid && dirty && !pending
              ? "bg-teal-700 text-white hover:bg-teal-800"
              : "bg-slate-200 text-slate-400 cursor-not-allowed"
          }`}
        >
          {pending ? "Saving…" : (<><Check size={14} /> Save changes</>)}
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
      />
    </label>
  );
}

function NumInput({
  value,
  onChange,
  suffix,
  placeholder,
  max,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  suffix: string;
  placeholder?: string;
  max?: number;
}) {
  return (
    <div className="relative">
      <input
        type="number"
        value={value ?? ""}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") return onChange(null);
          let n = Math.max(0, Math.floor(Number(raw) || 0));
          if (max != null) n = Math.min(n, max);
          onChange(n);
        }}
        placeholder={placeholder}
        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 pr-10 focus:outline-none focus:border-teal-500 tabular-nums"
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] uppercase tracking-wide text-slate-400 pointer-events-none">
        {suffix}
      </span>
    </div>
  );
}

// Weight needs its own input because the canonical value is kg but the user
// may type in lb. Deriving the displayed lb from kg on every keystroke caused
// a lossy lb→kg→lb round-trip that rewrote what was typed (you couldn't reach
// 3-digit numbers). Here we keep the typed text verbatim and only resync the
// display from the canonical value on non-typing changes (load, cancel, unit
// toggle).
function WeightInput({
  weightKg,
  units,
  onChangeKg,
}: {
  weightKg: number | null;
  units: "metric" | "imperial";
  onChangeKg: (kg: number | null) => void;
}) {
  const toDisplay = (kg: number | null) =>
    kg == null ? "" : String(units === "imperial" ? kgToLb(kg) : kg);

  const [text, setText] = useState<string>(() => toDisplay(weightKg));
  const typingRef = useRef(false);

  // Resync from the canonical value unless the change came from our own typing.
  useEffect(() => {
    if (!typingRef.current) setText(toDisplay(weightKg));
    typingRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weightKg, units]);

  return (
    <div className="relative">
      <input
        type="number"
        value={text}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          typingRef.current = true;
          if (raw === "") return onChangeKg(null);
          const n = Math.max(0, Math.floor(Number(raw) || 0));
          onChangeKg(units === "imperial" ? lbToKg(n) : n);
        }}
        placeholder={units === "imperial" ? "165" : "75"}
        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 pr-10 focus:outline-none focus:border-teal-500 tabular-nums"
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] uppercase tracking-wide text-slate-400 pointer-events-none">
        {units === "imperial" ? "lb" : "kg"}
      </span>
    </div>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{k}</div>
      <div className="text-sm font-semibold text-slate-900 mt-0.5">{v}</div>
    </div>
  );
}
