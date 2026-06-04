"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Plus,
  Trash2,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  Trophy,
  Footprints,
  Mountain,
  TrendingUp,
  Baby,
  ShoppingBag,
  Activity,
} from "lucide-react";
import {
  createActivity,
  updateActivity,
  deleteActivity,
  setActivityHidden,
  reorderActivities,
} from "./actions";

type Tier = "essential" | "important" | "stretch";
type Level = "low" | "moderate" | "high";

export type LibActivity = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  accent: string | null;
  tier: Tier;
  requiredVo2: number;
  requiredStrengthLb: number | null;
  requiredStrengthLevel: Level;
  requiredMobilityLevel: Level;
  sortOrder: number;
  hidden: boolean;
};

// Icon whitelist — must match the patient-side ICONS dict in
// src/app/home/grand100/page.tsx so we know it'll actually render.
const ICON_OPTIONS: { key: string; Icon: typeof Activity }[] = [
  { key: "Footprints",  Icon: Footprints },
  { key: "ShoppingBag", Icon: ShoppingBag },
  { key: "TrendingUp",  Icon: TrendingUp },
  { key: "Mountain",    Icon: Mountain },
  { key: "Baby",        Icon: Baby },
  { key: "Trophy",      Icon: Trophy },
  { key: "Activity",    Icon: Activity },
];
const ICONS: Record<string, typeof Activity> = Object.fromEntries(
  ICON_OPTIONS.map(({ key, Icon }) => [key, Icon]),
);

// Gradient palette — listed as literal strings so Tailwind's JIT compiles them.
// Stored in DB as "from-X to-Y"; patient page renders with `bg-gradient-to-br ${accent}`.
const PRESET_ACCENTS: { value: string; preview: string }[] = [
  { value: "from-emerald-500 to-teal-600",  preview: "bg-gradient-to-br from-emerald-500 to-teal-600" },
  { value: "from-amber-500 to-orange-600",  preview: "bg-gradient-to-br from-amber-500 to-orange-600" },
  { value: "from-blue-500 to-indigo-600",   preview: "bg-gradient-to-br from-blue-500 to-indigo-600" },
  { value: "from-emerald-600 to-teal-700",  preview: "bg-gradient-to-br from-emerald-600 to-teal-700" },
  { value: "from-rose-500 to-pink-600",     preview: "bg-gradient-to-br from-rose-500 to-pink-600" },
  { value: "from-violet-600 to-fuchsia-600",preview: "bg-gradient-to-br from-violet-600 to-fuchsia-600" },
  { value: "from-sky-500 to-cyan-600",      preview: "bg-gradient-to-br from-sky-500 to-cyan-600" },
  { value: "from-slate-600 to-slate-800",   preview: "bg-gradient-to-br from-slate-600 to-slate-800" },
];

const TIER_OPTIONS: { id: Tier; label: string; desc: string }[] = [
  { id: "essential", label: "Essential", desc: "Functional floor — losing this is losing independence." },
  { id: "important", label: "Important", desc: "Quality-of-life goal. Most patients should aim for this." },
  { id: "stretch",   label: "Stretch",   desc: "Aspirational. Raises the whole curve." },
];
const LEVEL_OPTIONS: { id: Level; label: string }[] = [
  { id: "low",      label: "Low" },
  { id: "moderate", label: "Moderate" },
  { id: "high",     label: "High" },
];

const TIER_CHIP: Record<Tier, string> = {
  essential: "bg-emerald-50 text-emerald-700 border-emerald-200",
  important: "bg-blue-50 text-blue-700 border-blue-200",
  stretch:   "bg-violet-50 text-violet-700 border-violet-200",
};

export function Grand100LibraryClient({
  initialActivities,
}: {
  initialActivities: LibActivity[];
}) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<LibActivity | null>(null);
  // Track local optimistic ordering so up/down feel instant.
  const [order, setOrder] = useState<LibActivity[]>(initialActivities);
  // Re-sync from server when membership changes (add / remove / hidden toggle / edit).
  useEffect(() => {
    setOrder(initialActivities.slice().sort((x, y) => x.sortOrder - y.sortOrder));
  }, [initialActivities]);

  const visible = order.filter((a) => !a.hidden);
  const hidden = order.filter((a) => a.hidden);

  const move = (id: string, dir: -1 | 1) => {
    const idx = order.findIndex((a) => a.id === id);
    if (idx < 0) return;
    const swap = idx + dir;
    if (swap < 0 || swap >= order.length) return;
    const next = order.slice();
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setOrder(next);
    startTransition(() => reorderActivities({ orderedIds: next.map((a) => a.id) }));
  };

  return (
    <>
      <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Activities</div>
            <div className="text-[11px] text-slate-500">Drag-order via the arrows. Hidden activities won&apos;t appear in any patient&apos;s Grand 100 list.</div>
          </div>
          <button
            onClick={() => setEditing({
              id: "",
              name: "",
              description: "",
              icon: "Activity",
              accent: PRESET_ACCENTS[0].value,
              tier: "important",
              requiredVo2: 18,
              requiredStrengthLb: 100,
              requiredStrengthLevel: "moderate",
              requiredMobilityLevel: "moderate",
              sortOrder: 0,
              hidden: false,
            })}
            className="text-xs font-semibold bg-teal-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-teal-800"
          >
            <Plus size={13} /> New activity
          </button>
        </div>

        {order.length === 0 ? (
          <div className="text-sm text-slate-500 italic py-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
            No activities yet. Add your first one.
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map((a, i) => (
              <ActivityRow
                key={a.id}
                activity={a}
                onEdit={() => setEditing(a)}
                onUp={i > 0 ? () => move(a.id, -1) : undefined}
                onDown={i < visible.length - 1 ? () => move(a.id, 1) : undefined}
                onHide={() => startTransition(() => setActivityHidden(a.id, true))}
                onShow={() => startTransition(() => setActivityHidden(a.id, false))}
                onDelete={() => {
                  if (!confirm(`Delete "${a.name}" from the library?`)) return;
                  startTransition(() => deleteActivity(a.id));
                }}
              />
            ))}
            {hidden.length > 0 && (
              <>
                <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold pt-3 border-t border-slate-100">
                  Hidden ({hidden.length})
                </div>
                {hidden.map((a) => (
                  <ActivityRow
                    key={a.id}
                    activity={a}
                    onEdit={() => setEditing(a)}
                    onHide={() => startTransition(() => setActivityHidden(a.id, true))}
                    onShow={() => startTransition(() => setActivityHidden(a.id, false))}
                    onDelete={() => {
                      if (!confirm(`Delete "${a.name}" from the library?`)) return;
                      startTransition(() => deleteActivity(a.id));
                    }}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </section>

      {editing && (
        <ActivityEditorDrawer
          activity={editing}
          onClose={() => setEditing(null)}
          onSave={(form) => {
            startTransition(async () => {
              if (editing.id) {
                await updateActivity({ ...form, id: editing.id });
              } else {
                await createActivity(form);
              }
              setEditing(null);
            });
          }}
          pending={pending}
        />
      )}
    </>
  );
}

function ActivityRow({
  activity,
  onEdit,
  onUp,
  onDown,
  onHide,
  onShow,
  onDelete,
}: {
  activity: LibActivity;
  onEdit: () => void;
  onUp?: () => void;
  onDown?: () => void;
  onHide: () => void;
  onShow: () => void;
  onDelete: () => void;
}) {
  const Icon = (activity.icon && ICONS[activity.icon]) || Activity;
  const accent = activity.accent || "from-teal-600 to-emerald-600";
  return (
    <div className={`bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-3 ${activity.hidden ? "opacity-60" : ""}`}>
      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${accent} text-white flex items-center justify-center flex-shrink-0`}>
        <Icon size={17} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="text-sm font-semibold text-slate-900 truncate">{activity.name}</div>
          <span className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded-full border ${TIER_CHIP[activity.tier]}`}>
            {activity.tier}
          </span>
        </div>
        <div className="text-[11px] text-slate-500 truncate">
          VO₂ {activity.requiredVo2}
          {activity.requiredStrengthLb != null ? ` · Squat ≥ ${activity.requiredStrengthLb} lb` : ` · Strength ${activity.requiredStrengthLevel}`}
          {" · "}Mobility {activity.requiredMobilityLevel}
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        {onUp && (
          <button onClick={onUp} title="Move up" className="text-slate-500 hover:text-slate-800 p-1.5 rounded-lg hover:bg-slate-100">
            <ArrowUp size={14} />
          </button>
        )}
        {onDown && (
          <button onClick={onDown} title="Move down" className="text-slate-500 hover:text-slate-800 p-1.5 rounded-lg hover:bg-slate-100">
            <ArrowDown size={14} />
          </button>
        )}
        {activity.hidden ? (
          <button onClick={onShow} title="Show" className="text-slate-500 hover:text-slate-800 p-1.5 rounded-lg hover:bg-slate-100">
            <EyeOff size={14} />
          </button>
        ) : (
          <button onClick={onHide} title="Hide" className="text-slate-500 hover:text-slate-800 p-1.5 rounded-lg hover:bg-slate-100">
            <Eye size={14} />
          </button>
        )}
        <button onClick={onEdit} className="text-[11px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-lg ml-1">Edit</button>
        <button onClick={onDelete} className="text-[11px] font-semibold text-rose-600 bg-white border border-rose-200 px-2.5 py-1 rounded-lg">
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

function ActivityEditorDrawer({
  activity,
  onClose,
  onSave,
  pending,
}: {
  activity: LibActivity;
  onClose: () => void;
  onSave: (form: {
    name: string;
    description: string | null;
    icon: string | null;
    accent: string | null;
    tier: Tier;
    requiredVo2: number;
    requiredStrengthLb: number | null;
    requiredStrengthLevel: Level;
    requiredMobilityLevel: Level;
  }) => void;
  pending: boolean;
}) {
  const [name, setName] = useState(activity.name);
  const [description, setDescription] = useState(activity.description ?? "");
  const [icon, setIcon] = useState(activity.icon ?? "Activity");
  const [accent, setAccent] = useState(activity.accent ?? PRESET_ACCENTS[0].value);
  const [tier, setTier] = useState<Tier>(activity.tier);
  const [requiredVo2, setRequiredVo2] = useState<number>(activity.requiredVo2);
  const [requiredStrengthLb, setRequiredStrengthLb] = useState<number | null>(activity.requiredStrengthLb);
  const [strengthLevel, setStrengthLevel] = useState<Level>(activity.requiredStrengthLevel);
  const [mobilityLevel, setMobilityLevel] = useState<Level>(activity.requiredMobilityLevel);

  const valid = name.trim().length > 0 && requiredVo2 >= 5 && requiredVo2 <= 80;
  const PreviewIcon = ICONS[icon] || Activity;

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/40 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">{activity.id ? "Edit activity" : "New activity"}</div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700 text-sm">Cancel</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Live preview */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${accent} text-white flex items-center justify-center flex-shrink-0`}>
              <PreviewIcon size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-slate-900 truncate">{name || "Untitled activity"}</div>
              <div className="text-[11px] text-slate-500 truncate">
                VO₂ {requiredVo2 || "—"}
                {requiredStrengthLb != null ? ` · Squat ≥ ${requiredStrengthLb} lb` : ` · Strength ${strengthLevel}`}
                {" · "}Mobility {mobilityLevel}
              </div>
            </div>
          </div>

          <Field label="Name" value={name} onChange={setName} placeholder="Climb 2 flights of stairs without stopping" />

          <FieldTextarea
            label="Description"
            value={description}
            onChange={setDescription}
            placeholder="Why this matters — what losing it would cost the patient."
          />

          <FieldSelect
            label="Tier"
            value={tier}
            onChange={(v) => setTier(v as Tier)}
            options={TIER_OPTIONS.map((t) => ({ id: t.id, label: `${t.label} — ${t.desc}` }))}
          />

          <div className="grid grid-cols-2 gap-3">
            <NumField label="Required VO₂" value={requiredVo2} onChange={(v) => setRequiredVo2(v ?? 0)} placeholder="21" hint="mL/kg/min at target age" />
            <NumField
              label="Required squat 1RM"
              value={requiredStrengthLb}
              onChange={(v) => setRequiredStrengthLb(v)}
              placeholder="115"
              hint="lb at target age — drives the strength graph"
            />
            <FieldSelect
              label="Strength chip"
              value={strengthLevel}
              onChange={(v) => setStrengthLevel(v as Level)}
              options={LEVEL_OPTIONS.map((o) => ({ id: o.id, label: o.label }))}
            />
            <FieldSelect
              label="Mobility floor"
              value={mobilityLevel}
              onChange={(v) => setMobilityLevel(v as Level)}
              options={LEVEL_OPTIONS.map((o) => ({ id: o.id, label: o.label }))}
            />
          </div>

          <div>
            <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">Icon</span>
            <div className="mt-1 grid grid-cols-7 gap-1.5">
              {ICON_OPTIONS.map(({ key, Icon }) => {
                const selected = icon === key;
                return (
                  <button
                    key={key}
                    onClick={() => setIcon(key)}
                    title={key}
                    className={`aspect-square rounded-lg border flex items-center justify-center transition ${
                      selected
                        ? "bg-teal-50 border-teal-500 text-teal-700"
                        : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                    }`}
                  >
                    <Icon size={16} />
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">Accent gradient</span>
            <div className="mt-1 grid grid-cols-4 gap-1.5">
              {PRESET_ACCENTS.map((p) => {
                const selected = accent === p.value;
                return (
                  <button
                    key={p.value}
                    onClick={() => setAccent(p.value)}
                    title={p.value}
                    className={`h-9 rounded-lg ${p.preview} border-2 transition ${
                      selected ? "border-slate-900 ring-2 ring-teal-500/40" : "border-white"
                    }`}
                  />
                );
              })}
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-sm text-slate-600 px-3 py-2 rounded-lg hover:bg-slate-50">Cancel</button>
          <button
            onClick={() =>
              valid &&
              onSave({
                name: name.trim(),
                description: description.trim() || null,
                icon,
                accent,
                tier,
                requiredVo2,
                requiredStrengthLb,
                requiredStrengthLevel: strengthLevel,
                requiredMobilityLevel: mobilityLevel,
              })
            }
            disabled={!valid || pending}
            className={`text-sm font-semibold px-4 py-2 rounded-lg ${
              valid && !pending ? "bg-teal-700 text-white hover:bg-teal-800" : "bg-slate-200 text-slate-400 cursor-not-allowed"
            }`}
          >
            {pending ? "Saving…" : "Save activity"}
          </button>
        </div>
      </div>
    </>
  );
}

// ----- Tiny field helpers -----

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

function FieldTextarea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">{label}</span>
      <textarea
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
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

function FieldSelect({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-teal-500"
      >
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </label>
  );
}
