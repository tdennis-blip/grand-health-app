"use client";

import { useState, useTransition } from "react";
import { Plus, Save, Trash2, X, AlertTriangle } from "lucide-react";
import type { InteractionRule, InteractionSeverity } from "@/lib/medications-interactions";
import { upsertInteractionRule, deleteInteractionRule } from "./actions";

const SEVERITY_TONE: Record<InteractionSeverity, string> = {
  info: "bg-sky-50 text-sky-800 border-sky-200",
  warn: "bg-amber-50 text-amber-800 border-amber-200",
  severe: "bg-rose-50 text-rose-800 border-rose-200",
};

export function InteractionLibraryEditor({ initial }: { initial: InteractionRule[] }) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-3">
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-[12px] text-amber-900 flex items-start gap-2">
        <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
        <div>
          Rules use case-insensitive substring matching against the medication
          name. "warfarin" matches "Warfarin 5 mg". Keep the pattern short and
          generic. Patient-stack hits surface in the clinician stack editor and
          on the patient&apos;s today view.
        </div>
      </div>

      {initial.map((r) => (
        <RuleRow key={r.id} rule={r} />
      ))}

      {adding ? (
        <RuleForm
          rule={null}
          onSaved={() => setAdding(false)}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="w-full text-sm font-semibold border border-dashed border-slate-300 hover:border-teal-400 text-teal-700 rounded-2xl py-3 inline-flex items-center justify-center gap-1"
        >
          <Plus size={14} /> Add interaction rule
        </button>
      )}

      {initial.length === 0 && !adding && (
        <div className="text-[12px] text-slate-500 italic text-center py-4">
          No rules yet. Add common pairs your clinic monitors.
        </div>
      )}
    </div>
  );
}

function RuleRow({ rule }: { rule: InteractionRule }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const tone = SEVERITY_TONE[rule.severity];

  if (editing) {
    return (
      <RuleForm
        rule={rule}
        onSaved={() => setEditing(false)}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className={`rounded-2xl border ${tone}`}>
      <button
        onClick={() => setEditing(true)}
        className="w-full text-left px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wide font-bold">{rule.severity}</span>
          {!rule.active && (
            <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded-full bg-white/60 border border-current/20">
              inactive
            </span>
          )}
          <span className="text-sm font-semibold">
            {rule.namePatternA} <span className="opacity-60">+</span> {rule.namePatternB}
          </span>
        </div>
        <div className="text-[12px] leading-snug mt-1 opacity-90">{rule.message}</div>
        {rule.source && <div className="text-[11px] opacity-70 mt-0.5">Source: {rule.source}</div>}
      </button>
      <div className="border-t border-current/15 px-4 py-2 flex items-center justify-end">
        <button
          onClick={() => {
            if (!confirm(`Delete this interaction rule?`)) return;
            startTransition(() => deleteInteractionRule(rule.id));
          }}
          disabled={pending}
          className="text-[11px] font-semibold inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-white/40"
        >
          <Trash2 size={11} /> Delete
        </button>
      </div>
    </div>
  );
}

function RuleForm({
  rule,
  onSaved,
  onCancel,
}: {
  rule: InteractionRule | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [a, setA] = useState(rule?.namePatternA ?? "");
  const [b, setB] = useState(rule?.namePatternB ?? "");
  const [severity, setSeverity] = useState<InteractionSeverity>(rule?.severity ?? "warn");
  const [message, setMessage] = useState(rule?.message ?? "");
  const [source, setSource] = useState(rule?.source ?? "");
  const [active, setActive] = useState(rule?.active ?? true);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const save = () => {
    setErr(null);
    if (!a.trim() || !b.trim()) return setErr("Both name patterns are required.");
    if (!message.trim()) return setErr("Message is required.");
    startTransition(async () => {
      try {
        await upsertInteractionRule({
          id: rule?.id ?? null,
          namePatternA: a,
          namePatternB: b,
          severity,
          message,
          source: source || null,
          active,
        });
        onSaved();
      } catch (e: any) {
        setErr(e?.message ?? "Save failed");
      }
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
      <div className="text-sm font-semibold text-slate-900">
        {rule ? "Edit rule" : "New rule"}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name pattern A">
          <input value={a} onChange={(e) => setA(e.target.value)} placeholder="e.g. warfarin" className={inputCls} />
        </Field>
        <Field label="Name pattern B">
          <input value={b} onChange={(e) => setB(e.target.value)} placeholder="e.g. aspirin" className={inputCls} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Severity">
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as InteractionSeverity)}
            className={inputCls + " bg-white"}
          >
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="severe">Severe</option>
          </select>
        </Field>
        <Field label="Active">
          <select
            value={active ? "true" : "false"}
            onChange={(e) => setActive(e.target.value === "true")}
            className={inputCls + " bg-white"}
          >
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </Field>
      </div>
      <Field label="Message">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
          className={inputCls}
          placeholder="e.g. Combined use increases bleeding risk. Avoid unless explicitly co-prescribed."
        />
      </Field>
      <Field label="Source (optional)">
        <input
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="e.g. UpToDate, FDA label"
          className={inputCls}
        />
      </Field>
      {err && <div className="text-[11px] text-rose-600">{err}</div>}
      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={pending}
          className="text-xs font-semibold bg-teal-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-teal-800 disabled:opacity-60"
        >
          <Save size={12} /> {pending ? "Saving…" : "Save"}
        </button>
        <button
          onClick={onCancel}
          className="text-xs font-semibold text-slate-600 hover:text-slate-800 inline-flex items-center gap-1"
        >
          <X size={12} /> Cancel
        </button>
      </div>
    </div>
  );
}

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
