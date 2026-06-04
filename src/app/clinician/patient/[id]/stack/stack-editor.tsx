"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  Plus,
  Trash2,
  Save,
  X,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Package,
  History as HistoryIcon,
  Clock,
  Pill,
} from "lucide-react";
import {
  formatDaysOfWeek,
  formatTime12,
  refillStatus,
  type StackItem,
  type ScheduledDose,
} from "@/lib/medications-utils";
import type { InteractionHit, InteractionSeverity } from "@/lib/medications-interactions";
import {
  upsertMedication,
  deleteMedication,
  upsertDose,
  deleteDose,
} from "./actions";
import { recordRefill } from "./refill-actions";

const DOW_LABEL: Record<number, string> = { 0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat" };

type PillarRef = { id: string; name: string };

export function StackEditor({
  patientId,
  initialStack,
  pillars,
  interactions = [],
}: {
  patientId: string;
  initialStack: StackItem[];
  pillars: PillarRef[];
  interactions?: InteractionHit[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Group interactions per medication so we can badge the involved rows.
  const hitsByMed = useMemo(() => {
    const m: Record<string, InteractionHit[]> = {};
    for (const h of interactions) {
      (m[h.medicationIdA] ?? (m[h.medicationIdA] = [])).push(h);
      (m[h.medicationIdB] ?? (m[h.medicationIdB] = [])).push(h);
    }
    return m;
  }, [interactions]);

  return (
    <div className="space-y-3">
      <InteractionBanner hits={interactions} />
      <NutrientTotals stack={initialStack} />

      {initialStack.map((m) => (
        <MedicationRow
          key={m.id}
          patientId={patientId}
          med={m}
          pillars={pillars}
          isOpen={openId === m.id}
          onToggle={() => setOpenId(openId === m.id ? null : m.id)}
          hits={hitsByMed[m.id] ?? []}
        />
      ))}

      {adding ? (
        <NewMedForm
          patientId={patientId}
          pillars={pillars}
          onCancel={() => setAdding(false)}
          onSaved={() => setAdding(false)}
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="w-full text-sm font-semibold border border-dashed border-slate-300 hover:border-teal-400 text-teal-700 rounded-2xl py-3 inline-flex items-center justify-center gap-1"
        >
          <Plus size={14} /> Add medication or supplement
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-medication row (collapsed summary + expanded form + dose list)
// ---------------------------------------------------------------------------

function MedicationRow({
  patientId,
  med,
  pillars,
  isOpen,
  onToggle,
  hits,
}: {
  patientId: string;
  med: StackItem;
  pillars: PillarRef[];
  isOpen: boolean;
  onToggle: () => void;
  hits: InteractionHit[];
}) {
  const refill = refillStatus(med);

  // Border tone matches the worst alert on this med.
  const worstSeverity: InteractionSeverity | null = hits.reduce<InteractionSeverity | null>(
    (acc, h) =>
      acc === "severe" || h.severity === "severe"
        ? "severe"
        : acc === "warn" || h.severity === "warn"
        ? "warn"
        : acc ?? h.severity,
    null,
  );
  const ringTone =
    worstSeverity === "severe"
      ? "border-rose-300"
      : worstSeverity === "warn"
      ? "border-amber-300"
      : refill.state === "out" || refill.state === "low"
      ? "border-amber-200"
      : "border-slate-200";

  return (
    <div className={`bg-white rounded-2xl border ${ringTone}`}>
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-3 flex items-center gap-3"
      >
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-900 truncate">
            {med.name}
            {med.dose && <span className="text-slate-400 font-normal"> · {med.dose}</span>}
            {!med.active && (
              <span className="ml-2 text-[10px] uppercase tracking-wide font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-full">
                Paused
              </span>
            )}
            {hits.length > 0 && (
              <span
                className={`ml-2 text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded-full border inline-flex items-center gap-0.5 ${
                  worstSeverity === "severe"
                    ? "bg-rose-50 text-rose-700 border-rose-200"
                    : worstSeverity === "warn"
                    ? "bg-amber-50 text-amber-800 border-amber-200"
                    : "bg-sky-50 text-sky-800 border-sky-200"
                }`}
              >
                <AlertTriangle size={9} /> {hits.length}
              </span>
            )}
            {refill.state === "low" && (
              <span className="ml-2 text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 inline-flex items-center gap-0.5">
                <Package size={9} /> {refill.daysRemaining}d left
              </span>
            )}
            {refill.state === "out" && (
              <span className="ml-2 text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 inline-flex items-center gap-0.5">
                <Package size={9} /> out
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-500 truncate">
            {med.doses.length} {med.doses.length === 1 ? "dose" : "doses"}
            {med.pillarName && <span className="text-violet-700"> · {med.pillarName}</span>}
            {med.withFood === true && <span> · with food</span>}
            {med.instructions && <span> · {med.instructions}</span>}
          </div>
        </div>
        <span
          className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded-full border ${
            med.kind === "supplement"
              ? "bg-violet-50 text-violet-700 border-violet-200"
              : "bg-slate-100 text-slate-600 border-slate-200"
          }`}
        >
          {med.kind === "supplement" ? "supp" : "med"}
        </span>
        {isOpen ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
      </button>

      {isOpen && (
        <div className="border-t border-slate-200 p-4 space-y-4">
          {hits.length > 0 && (
            <div className="space-y-1.5">
              {hits.map((h) => (
                <InteractionLine key={h.ruleId + h.medicationIdA + h.medicationIdB} hit={h} />
              ))}
            </div>
          )}
          <MedicationForm patientId={patientId} med={med} pillars={pillars} />
          <DoseList patientId={patientId} medicationId={med.id} doses={med.doses} />
          <RefillPanel patientId={patientId} med={med} />
        </div>
      )}
    </div>
  );
}

function InteractionBanner({ hits }: { hits: InteractionHit[] }) {
  if (hits.length === 0) return null;
  const counts = hits.reduce(
    (acc, h) => ({ ...acc, [h.severity]: (acc[h.severity] ?? 0) + 1 }),
    {} as Record<InteractionSeverity, number>,
  );
  const tone =
    counts.severe
      ? "bg-rose-50 border-rose-300 text-rose-900"
      : counts.warn
      ? "bg-amber-50 border-amber-300 text-amber-900"
      : "bg-sky-50 border-sky-300 text-sky-900";
  return (
    <div className={`rounded-2xl border ${tone} px-4 py-3`}>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <AlertTriangle size={14} />
        {hits.length} interaction{hits.length === 1 ? "" : "s"} flagged
        <span className="text-[11px] font-normal opacity-80">
          ({counts.severe ? `${counts.severe} severe · ` : ""}
          {counts.warn ? `${counts.warn} warn · ` : ""}
          {counts.info ? `${counts.info} info` : ""})
        </span>
      </div>
      <ul className="mt-2 space-y-1.5">
        {hits.map((h) => (
          <li key={h.ruleId + h.medicationIdA + h.medicationIdB} className="text-[12px] leading-snug">
            <span className="font-semibold">{h.matchedA}</span>
            <span className="opacity-60"> + </span>
            <span className="font-semibold">{h.matchedB}</span>
            : {h.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function InteractionLine({ hit }: { hit: InteractionHit }) {
  const tone =
    hit.severity === "severe"
      ? "bg-rose-50 border-rose-200 text-rose-900"
      : hit.severity === "warn"
      ? "bg-amber-50 border-amber-200 text-amber-900"
      : "bg-sky-50 border-sky-200 text-sky-900";
  return (
    <div className={`rounded-lg border ${tone} px-3 py-2 text-[12px]`}>
      <div className="font-semibold flex items-center gap-1">
        <AlertTriangle size={11} />
        {hit.severity.toUpperCase()} · pairs with {hit.matchedA === hit.matchedB ? hit.matchedB : hit.matchedB}
      </div>
      <div className="opacity-90 mt-0.5">{hit.message}</div>
      {hit.source && <div className="opacity-70 mt-0.5 text-[11px]">Source: {hit.source}</div>}
    </div>
  );
}

function RefillPanel({ patientId, med }: { patientId: string; med: StackItem }) {
  const [qtyOnHand, setQtyOnHand] = useState<string>(
    med.quantityOnHand == null ? "" : String(med.quantityOnHand),
  );
  const [qtyPerDose, setQtyPerDose] = useState<string>(
    med.quantityPerDose == null ? "1" : String(med.quantityPerDose),
  );
  const [threshold, setThreshold] = useState<string>(
    med.refillThresholdDays == null ? "7" : String(med.refillThresholdDays),
  );
  const [addAmount, setAddAmount] = useState<string>("");
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  const refill = refillStatus(med);

  const saveSettings = () => {
    setStatus("Saving…");
    startTransition(async () => {
      try {
        await upsertMedication({
          id: med.id,
          patientId,
          kind: med.kind,
          name: med.name,
          dose: med.dose ?? null,
          form: med.form ?? null,
          instructions: med.instructions ?? null,
          notes: med.notes ?? null,
          pillarId: med.pillarId ?? null,
          active: med.active,
          withFood: med.withFood ?? null,
          quantityOnHand: qtyOnHand === "" ? null : Number(qtyOnHand),
          quantityPerDose: qtyPerDose === "" ? null : Number(qtyPerDose),
          refillThresholdDays: threshold === "" ? null : Number(threshold),
          lastRefillOn: med.lastRefillOn ?? null,
          vitaminDIu:   med.vitaminDIu   ?? null,
          vitaminB12Ug: med.vitaminB12Ug ?? null,
          ironMg:       med.ironMg       ?? null,
          magnesiumMg:  med.magnesiumMg  ?? null,
          calciumMg:    med.calciumMg    ?? null,
          potassiumMg:  med.potassiumMg  ?? null,
          sodiumMg:     med.sodiumMg     ?? null,
          dhaMg:        med.dhaMg        ?? null,
          epaMg:        med.epaMg        ?? null,
          creatineMg:   med.creatineMg   ?? null,
          coq10Mg:      med.coq10Mg      ?? null,
          fiberG:       med.fiberG       ?? null,
        });
        setStatus("Saved.");
        setTimeout(() => setStatus(null), 1500);
      } catch (e: any) {
        setStatus(e?.message ?? "Save failed");
      }
    });
  };

  const doRefill = () => {
    const n = Number(addAmount);
    if (!Number.isFinite(n) || n <= 0) {
      setStatus("Enter a refill amount.");
      return;
    }
    setStatus("Recording refill…");
    startTransition(async () => {
      try {
        const res = await recordRefill({
          medicationId: med.id,
          patientId,
          mode: "add",
          amount: n,
        });
        setQtyOnHand(String(res.newQty));
        setAddAmount("");
        setStatus("Refill recorded.");
        setTimeout(() => setStatus(null), 1500);
      } catch (e: any) {
        setStatus(e?.message ?? "Failed");
      }
    });
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold flex items-center gap-1">
          <Package size={11} /> Supply
        </div>
        <div className="text-[11px] tabular-nums">
          {refill.state === "unknown" && <span className="text-slate-400">—</span>}
          {refill.state === "ok" && (
            <span className="text-emerald-700">{refill.daysRemaining} days left</span>
          )}
          {refill.state === "low" && (
            <span className="text-amber-700 font-semibold">
              Low · {refill.daysRemaining} days
            </span>
          )}
          {refill.state === "out" && <span className="text-rose-700 font-semibold">Out</span>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Field label="On hand">
          <input
            value={qtyOnHand}
            onChange={(e) => setQtyOnHand(e.target.value)}
            inputMode="decimal"
            className={inputCls}
            placeholder="—"
          />
        </Field>
        <Field label="Per dose">
          <input
            value={qtyPerDose}
            onChange={(e) => setQtyPerDose(e.target.value)}
            inputMode="decimal"
            className={inputCls}
          />
        </Field>
        <Field label="Threshold (d)">
          <input
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            inputMode="numeric"
            className={inputCls}
          />
        </Field>
      </div>

      <div className="flex items-end gap-2">
        <Field label="Add refill">
          <input
            value={addAmount}
            onChange={(e) => setAddAmount(e.target.value)}
            inputMode="decimal"
            className={inputCls}
            placeholder="qty to add"
          />
        </Field>
        <button
          onClick={doRefill}
          disabled={pending}
          className="text-xs font-semibold bg-violet-600 text-white px-3 py-2 rounded-lg hover:bg-violet-700 disabled:opacity-60"
        >
          + Refill
        </button>
        <button
          onClick={saveSettings}
          disabled={pending}
          className="text-xs font-semibold bg-teal-700 text-white px-3 py-2 rounded-lg flex items-center gap-1 hover:bg-teal-800 disabled:opacity-60"
        >
          <Save size={11} /> Save
        </button>
      </div>
      {med.lastRefillOn && (
        <div className="text-[11px] text-slate-500">Last refill: {med.lastRefillOn}</div>
      )}
      {status && <div className="text-[11px] text-slate-500">{status}</div>}
    </div>
  );
}

function strN(v: number | null) { return v == null ? "" : String(v); }
function parseN(s: string) { const n = parseFloat(s); return Number.isFinite(n) ? n : null; }

function MedicationForm({
  patientId,
  med,
  pillars,
}: {
  patientId: string;
  med: StackItem;
  pillars: PillarRef[];
}) {
  const [kind, setKind] = useState(med.kind);
  const [name, setName] = useState(med.name);
  const [dose, setDose] = useState(med.dose ?? "");
  const [form, setForm] = useState(med.form ?? "");
  const [instructions, setInstructions] = useState(med.instructions ?? "");
  const [notes, setNotes] = useState(med.notes ?? "");
  const [pillarId, setPillarId] = useState(med.pillarId ?? "");
  const [active, setActive] = useState(med.active);
  const [withFood, setWithFood] = useState<boolean | null>(med.withFood ?? null);
  // Nutrient fields (supplements only)
  const [vitaminDIu,   setVitaminDIu]   = useState(strN(med.vitaminDIu));
  const [vitaminB12Ug, setVitaminB12Ug] = useState(strN(med.vitaminB12Ug));
  const [ironMg,       setIronMg]       = useState(strN(med.ironMg));
  const [magnesiumMg,  setMagnesiumMg]  = useState(strN(med.magnesiumMg));
  const [calciumMg,    setCalciumMg]    = useState(strN(med.calciumMg));
  const [potassiumMg,  setPotassiumMg]  = useState(strN(med.potassiumMg));
  const [sodiumMg,     setSodiumMg]     = useState(strN(med.sodiumMg));
  const [dhaMg,        setDhaMg]        = useState(strN(med.dhaMg));
  const [epaMg,        setEpaMg]        = useState(strN(med.epaMg));
  const [creatineMg,   setCreatineMg]   = useState(strN(med.creatineMg));
  const [coq10Mg,      setCoq10Mg]      = useState(strN(med.coq10Mg));
  const [fiberG,       setFiberG]       = useState(strN(med.fiberG));
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  const save = () => {
    setStatus("Saving…");
    startTransition(async () => {
      try {
        await upsertMedication({
          id: med.id,
          patientId,
          kind,
          name,
          dose,
          form,
          instructions,
          notes,
          pillarId: pillarId || null,
          active,
          withFood,
          // Preserve existing refill state — RefillPanel below owns those edits.
          quantityOnHand: med.quantityOnHand ?? null,
          quantityPerDose: med.quantityPerDose ?? null,
          refillThresholdDays: med.refillThresholdDays ?? null,
          lastRefillOn: med.lastRefillOn ?? null,
          // Nutrients — only meaningful for supplements, cleared for meds.
          vitaminDIu:   kind === "supplement" ? parseN(vitaminDIu)   : null,
          vitaminB12Ug: kind === "supplement" ? parseN(vitaminB12Ug) : null,
          ironMg:       kind === "supplement" ? parseN(ironMg)       : null,
          magnesiumMg:  kind === "supplement" ? parseN(magnesiumMg)  : null,
          calciumMg:    kind === "supplement" ? parseN(calciumMg)    : null,
          potassiumMg:  kind === "supplement" ? parseN(potassiumMg)  : null,
          sodiumMg:     kind === "supplement" ? parseN(sodiumMg)     : null,
          dhaMg:        kind === "supplement" ? parseN(dhaMg)        : null,
          epaMg:        kind === "supplement" ? parseN(epaMg)        : null,
          creatineMg:   kind === "supplement" ? parseN(creatineMg)   : null,
          coq10Mg:      kind === "supplement" ? parseN(coq10Mg)      : null,
          fiberG:       kind === "supplement" ? parseN(fiberG)       : null,
        });
        setStatus("Saved.");
        setTimeout(() => setStatus(null), 1500);
      } catch (e: any) {
        setStatus(e?.message ?? "Save failed");
      }
    });
  };

  const remove = () => {
    if (!confirm(`Remove ${med.name} and all its doses?`)) return;
    setStatus("Deleting…");
    startTransition(async () => {
      try {
        await deleteMedication({ id: med.id, patientId });
      } catch (e: any) {
        setStatus(e?.message ?? "Delete failed");
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Kind">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as "medication" | "supplement")}
            className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-teal-500"
          >
            <option value="medication">Medication</option>
            <option value="supplement">Supplement</option>
          </select>
        </Field>
        <Field label="Active">
          <select
            value={active ? "true" : "false"}
            onChange={(e) => setActive(e.target.value === "true")}
            className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-teal-500"
          >
            <option value="true">Active</option>
            <option value="false">Paused</option>
          </select>
        </Field>
      </div>
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Dose">
          <input value={dose} onChange={(e) => setDose(e.target.value)} className={inputCls} placeholder="e.g. 5 mg" />
        </Field>
        <Field label="Form">
          <input value={form} onChange={(e) => setForm(e.target.value)} className={inputCls} placeholder="e.g. tablet" />
        </Field>
      </div>
      <Field label="Instructions (patient-facing)">
        <input value={instructions} onChange={(e) => setInstructions(e.target.value)} className={inputCls} placeholder="e.g. take at bedtime" />
      </Field>
      <div>
        <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1.5">With food</div>
        <div className="flex gap-2">
          {([null, true, false] as const).map((v) => {
            const label = v === null ? "Unspecified" : v ? "Yes" : "No";
            const active = withFood === v;
            return (
              <button
                key={String(v)}
                type="button"
                onClick={() => setWithFood(v)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition ${
                  active ? "bg-teal-700 text-white border-teal-700" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <Field label="Pillar (optional)">
        <select
          value={pillarId}
          onChange={(e) => setPillarId(e.target.value)}
          className={inputCls + " bg-white"}
        >
          <option value="">— None —</option>
          {pillars.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Clinical notes (internal)">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className={inputCls}
          placeholder="Why prescribed, target, etc."
        />
      </Field>

      {/* Nutrient content per dose — supplements only */}
      {kind === "supplement" && (
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 space-y-2">
          <div className="text-[10px] uppercase tracking-wide text-violet-600 font-semibold">
            Nutrients per dose — shows on patient diet page
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NutrientField label="Vitamin D (IU)"   value={vitaminDIu}   onChange={setVitaminDIu}   />
            <NutrientField label="Vitamin B12 (µg)" value={vitaminB12Ug} onChange={setVitaminB12Ug} />
            <NutrientField label="Iron (mg)"         value={ironMg}       onChange={setIronMg}       />
            <NutrientField label="Magnesium (mg)"    value={magnesiumMg}  onChange={setMagnesiumMg}  />
            <NutrientField label="Calcium (mg)"      value={calciumMg}    onChange={setCalciumMg}    />
            <NutrientField label="Potassium (mg)"    value={potassiumMg}  onChange={setPotassiumMg}  />
            <NutrientField label="Sodium (mg)"       value={sodiumMg}     onChange={setSodiumMg}     />
            <NutrientField label="DHA (mg)"          value={dhaMg}        onChange={setDhaMg}        />
            <NutrientField label="EPA (mg)"          value={epaMg}        onChange={setEpaMg}        />
            <NutrientField label="Creatine (mg)"     value={creatineMg}   onChange={setCreatineMg}   />
            <NutrientField label="CoQ10 (mg)"        value={coq10Mg}      onChange={setCoq10Mg}      />
            <NutrientField label="Fiber (g)"         value={fiberG}       onChange={setFiberG}       />
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={pending}
          className="text-xs font-semibold bg-teal-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-teal-800 disabled:opacity-60"
        >
          <Save size={12} /> {pending ? "Saving…" : "Save"}
        </button>
        <button
          onClick={remove}
          disabled={pending}
          className="text-xs font-semibold border border-rose-200 text-rose-700 px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-rose-50"
        >
          <Trash2 size={12} /> Remove
        </button>
        <Link
          href={`/clinician/patient/${patientId}/stack/history/${med.id}`}
          className="text-xs font-semibold text-slate-600 hover:text-teal-700 inline-flex items-center gap-1 ml-auto"
        >
          <HistoryIcon size={12} /> History
        </Link>
        {status && <span className="text-[11px] text-slate-500">{status}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dose list per medication
// ---------------------------------------------------------------------------

function DoseList({
  patientId,
  medicationId,
  doses,
}: {
  patientId: string;
  medicationId: string;
  doses: ScheduledDose[];
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold flex items-center gap-1">
          <Clock size={11} /> When &amp; how often
        </div>
        {doses.length > 0 && !adding && (
          <button onClick={() => setAdding(true)} className="text-[10px] font-semibold text-teal-700 hover:text-teal-800 flex items-center gap-0.5">
            <Plus size={10} /> Add dose
          </button>
        )}
      </div>
      {doses.length === 0 && !adding && (
        <button
          onClick={() => setAdding(true)}
          className="w-full text-[12px] font-semibold text-teal-700 bg-teal-50 border border-dashed border-teal-300 hover:bg-teal-100 rounded-lg px-3 py-2.5 flex items-center justify-center gap-1.5"
        >
          <Clock size={13} /> Set when &amp; how often to take this
        </button>
      )}
      <div className="space-y-1.5">
        {doses.map((d) => (
          <DoseRow key={d.id} patientId={patientId} medicationId={medicationId} dose={d} />
        ))}
      </div>
      {adding && (
        <DoseForm
          patientId={patientId}
          medicationId={medicationId}
          dose={null}
          onSaved={() => setAdding(false)}
          onCancel={() => setAdding(false)}
        />
      )}
    </div>
  );
}

function DoseRow({
  patientId,
  medicationId,
  dose,
}: {
  patientId: string;
  medicationId: string;
  dose: ScheduledDose;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  if (editing) {
    return (
      <DoseForm
        patientId={patientId}
        medicationId={medicationId}
        dose={dose}
        onSaved={() => setEditing(false)}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex items-center gap-2">
      <button onClick={() => setEditing(true)} className="flex-1 min-w-0 text-left">
        <div className="text-sm font-medium text-slate-900 tabular-nums">
          {formatTime12(dose.timeLocal)}
          {dose.amountOverride && <span className="text-slate-400 font-normal"> · {dose.amountOverride}</span>}
        </div>
        <div className="text-[11px] text-slate-500 truncate">
          {formatDaysOfWeek(dose.daysOfWeek)}
          {dose.label && ` · ${dose.label}`}
          {dose.withFood === true && " · with food"}
        </div>
      </button>
      <button
        onClick={() => {
          if (!confirm("Remove this scheduled dose?")) return;
          startTransition(() => deleteDose({ id: dose.id, patientId }));
        }}
        disabled={pending}
        className="text-rose-600 hover:bg-rose-50 rounded p-1"
        title="Remove dose"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

const TIME_PRESETS = [
  { label: "Morning", time: "08:00" },
  { label: "Noon",    time: "12:00" },
  { label: "Night",   time: "21:00" },
] as const;

function DoseForm({
  patientId,
  medicationId,
  dose,
  onSaved,
  onCancel,
}: {
  patientId: string;
  medicationId: string;
  dose: ScheduledDose | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const isNew = dose === null;
  const [twiceDaily, setTwiceDaily] = useState(false);
  const [timeLocal, setTimeLocal] = useState(dose?.timeLocal.slice(0, 5) ?? "08:00");
  const [timeLocalEvening, setTimeLocalEvening] = useState("20:00");
  const [label, setLabel] = useState(dose?.label ?? "");
  const [days, setDays] = useState<number[]>(dose?.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6]);
  const [amountOverride, setAmountOverride] = useState(dose?.amountOverride ?? "");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const applyPreset = (time: string) => {
    setTwiceDaily(false);
    setTimeLocal(time);
  };

  const applyTwiceDaily = () => {
    setTwiceDaily(true);
    setTimeLocal("08:00");
    setTimeLocalEvening("20:00");
  };

  const toggleDay = (d: number) => {
    setDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()
    );
  };

  const save = () => {
    setErr(null);
    if (days.length === 0) { setErr("Pick at least one day."); return; }
    startTransition(async () => {
      try {
        if (twiceDaily && isNew) {
          await upsertDose({ id: null, medicationId, patientId, timeLocal, label: label || "Morning", daysOfWeek: days, amountOverride: amountOverride || null });
          await upsertDose({ id: null, medicationId, patientId, timeLocal: timeLocalEvening, label: label || "Evening", daysOfWeek: days, amountOverride: amountOverride || null });
        } else {
          await upsertDose({ id: dose?.id ?? null, medicationId, patientId, timeLocal, label: label || null, daysOfWeek: days, amountOverride: amountOverride || null });
        }
        onSaved();
      } catch (e: any) {
        setErr(e?.message ?? "Save failed");
      }
    });
  };

  // Determine which chip is "active" for the preset row
  const activePreset = twiceDaily ? "twice" : TIME_PRESETS.find((p) => p.time === timeLocal)?.label ?? null;

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2.5">
      {/* Time of day chips */}
      <div>
        <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1.5">Time of day</div>
        <div className="flex flex-wrap gap-1.5">
          {TIME_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => applyPreset(p.time)}
              className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition ${
                activePreset === p.label
                  ? "bg-teal-700 text-white border-teal-700"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
              }`}
            >
              {p.label}
            </button>
          ))}
          {isNew && (
            <button
              type="button"
              onClick={applyTwiceDaily}
              className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition ${
                twiceDaily
                  ? "bg-teal-700 text-white border-teal-700"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
              }`}
            >
              Twice daily
            </button>
          )}
        </div>
      </div>

      {/* Time inputs */}
      {twiceDaily ? (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Morning time">
            <input type="time" value={timeLocal} onChange={(e) => setTimeLocal(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Evening time">
            <input type="time" value={timeLocalEvening} onChange={(e) => setTimeLocalEvening(e.target.value)} className={inputCls} />
          </Field>
        </div>
      ) : (
        <Field label="Custom time">
          <input type="time" value={timeLocal} onChange={(e) => { setTwiceDaily(false); setTimeLocal(e.target.value); }} className={inputCls} />
        </Field>
      )}

      <Field label="Label (optional)">
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. with breakfast, PRN" className={inputCls} />
      </Field>
      <Field label="Dose override (optional)">
        <input value={amountOverride} onChange={(e) => setAmountOverride(e.target.value)} placeholder="leave blank to use the parent dose" className={inputCls} />
      </Field>
      <div>
        <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Days</div>
        <div className="flex flex-wrap gap-1">
          {[0, 1, 2, 3, 4, 5, 6].map((d) => {
            const on = days.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition ${
                  on ? "bg-teal-700 text-white border-teal-700" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                }`}
              >
                {DOW_LABEL[d]}
              </button>
            );
          })}
        </div>
        <div className="mt-1 flex gap-2 text-[10px] text-slate-500">
          <button type="button" onClick={() => setDays([0, 1, 2, 3, 4, 5, 6])} className="hover:text-teal-700">Daily</button>
          <button type="button" onClick={() => setDays([1, 2, 3, 4, 5])} className="hover:text-teal-700">Weekdays</button>
          <button type="button" onClick={() => setDays([0])} className="hover:text-teal-700">Sun only</button>
        </div>
      </div>
      {err && <div className="text-[11px] text-rose-600">{err}</div>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="text-xs font-semibold bg-teal-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-teal-800 disabled:opacity-60"
        >
          <Save size={12} /> {pending ? "Saving…" : twiceDaily ? "Save 2 doses" : "Save dose"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs font-semibold text-slate-600 hover:text-slate-800 inline-flex items-center gap-1"
        >
          <X size={12} /> Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// New medication (collapsed form)
// ---------------------------------------------------------------------------

function NewMedForm({
  patientId,
  pillars,
  onCancel,
  onSaved,
}: {
  patientId: string;
  pillars: PillarRef[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<"medication" | "supplement">("medication");
  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  const [pillarId, setPillarId] = useState("");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const save = () => {
    setErr(null);
    if (!name.trim()) {
      setErr("Name is required.");
      return;
    }
    startTransition(async () => {
      try {
        await upsertMedication({
          patientId,
          kind,
          name,
          dose,
          pillarId: pillarId || null,
          active: true,
        });
        onSaved();
      } catch (e: any) {
        setErr(e?.message ?? "Save failed");
      }
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
      <div className="text-sm font-semibold text-slate-900">New item</div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Kind">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as "medication" | "supplement")}
            className={inputCls + " bg-white"}
          >
            <option value="medication">Medication</option>
            <option value="supplement">Supplement</option>
          </select>
        </Field>
        <Field label="Dose">
          <input value={dose} onChange={(e) => setDose(e.target.value)} className={inputCls} placeholder="e.g. 5 mg" />
        </Field>
      </div>
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} autoFocus />
      </Field>
      <Field label="Pillar (optional)">
        <select value={pillarId} onChange={(e) => setPillarId(e.target.value)} className={inputCls + " bg-white"}>
          <option value="">— None —</option>
          {pillars.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
      {err && <div className="text-[11px] text-rose-600">{err}</div>}
      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={pending}
          className="text-xs font-semibold bg-teal-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-teal-800 disabled:opacity-60"
        >
          <Save size={12} /> {pending ? "Saving…" : "Add"}
        </button>
        <button onClick={onCancel} className="text-xs font-semibold text-slate-600 hover:text-slate-800">
          Cancel
        </button>
      </div>
      <div className="text-[11px] text-slate-500">
        After saving, expand the item to add scheduled doses.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Supplement nutrient totals
// ---------------------------------------------------------------------------

const NUTRIENTS: Array<{ key: keyof StackItem; label: string; unit: string }> = [
  { key: "vitaminDIu",   label: "Vitamin D",  unit: "IU"  },
  { key: "vitaminB12Ug", label: "Vitamin B12", unit: "µg" },
  { key: "ironMg",       label: "Iron",        unit: "mg" },
  { key: "magnesiumMg",  label: "Magnesium",   unit: "mg" },
  { key: "calciumMg",    label: "Calcium",     unit: "mg" },
  { key: "potassiumMg",  label: "Potassium",   unit: "mg" },
  { key: "sodiumMg",     label: "Sodium",      unit: "mg" },
  { key: "dhaMg",        label: "DHA",         unit: "mg" },
  { key: "epaMg",        label: "EPA",         unit: "mg" },
  { key: "creatineMg",   label: "Creatine",    unit: "mg" },
  { key: "coq10Mg",      label: "CoQ10",       unit: "mg" },
  { key: "fiberG",       label: "Fiber",       unit: "g"  },
];

function NutrientTotals({ stack }: { stack: StackItem[] }) {
  const supplements = stack.filter((m) => m.kind === "supplement" && m.active);
  if (supplements.length === 0) return null;

  // Sum each nutrient across active supplements, weighted by doses per day.
  const totals: Record<string, number> = {};
  for (const s of supplements) {
    const dosesPerDay = s.doses.length > 0
      ? s.doses.reduce((sum, d) => sum + (d.daysOfWeek.length / 7), 0)
      : 1;
    for (const n of NUTRIENTS) {
      const val = s[n.key] as number | null;
      if (val != null && val > 0) {
        totals[n.key] = (totals[n.key] ?? 0) + val * dosesPerDay;
      }
    }
  }

  const present = NUTRIENTS.filter((n) => totals[n.key] != null);
  if (present.length === 0) return null;

  return (
    <div className="bg-violet-50 border border-violet-200 rounded-2xl p-3.5">
      <div className="text-[10px] uppercase tracking-wide text-violet-600 font-semibold flex items-center gap-1 mb-2.5">
        <Pill size={11} /> Supplement nutrient totals · daily
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {present.map((n) => (
          <div key={n.key} className="flex items-center justify-between text-[11.5px]">
            <span className="text-slate-600">{n.label}</span>
            <span className="font-semibold tabular-nums text-violet-800">
              {Math.round(totals[n.key] * 10) / 10} {n.unit}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 text-[10px] text-violet-500">
        Weighted by dose frequency. Only counts active supplements with nutrient data entered.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// shared input styles
// ---------------------------------------------------------------------------

const inputCls =
  "mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{label}</span>
      {children}
    </label>
  );
}

function NutrientField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wide text-violet-500 font-semibold">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        className="mt-0.5 w-full text-sm border border-violet-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-violet-400 bg-white"
      />
    </label>
  );
}
