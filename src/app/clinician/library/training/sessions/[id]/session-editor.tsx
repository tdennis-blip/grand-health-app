"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, Trash2, Dumbbell, Activity, Flame, Sparkles, Video } from "lucide-react";
import {
  updateSessionHeader,
  addSessionExercise,
  removeSessionExercise,
  moveSessionExercise,
  changeSessionExercise,
  addSet,
  removeSet,
  updateSet,
} from "../actions";

type Kind = "strength" | "zone2" | "vo2max" | "mobility";

type Zone = {
  id: string;
  zoneKey: string;
  name: string;
  shortName: string;
  lowBpm: number;
  highBpm: number;
};

type AttachedSet = { id: string; setNumber: number; reps: number; weight: number; durationSeconds: number | null };
type Attached = {
  id: string;
  sortOrder: number;
  exerciseId: string;
  exerciseName: string;
  primaryArea: string | null;
  videoTitle: string | null;
  sets: AttachedSet[];
};

type LibExercise = { id: string; name: string; primaryArea: string | null };

type Header = {
  kind: Kind;
  name: string;
  focus: string | null;
  estMinutes: number;
  accent: string | null;
  coachNote: string | null;
  modality: string | null;
  durationMin: number | null;
  targetZoneId: string | null;
  warmupMin: number | null;
  rounds: number | null;
  workMin: number | null;
  workZoneId: string | null;
  recoverMin: number | null;
  recoverZoneId: string | null;
  cooldownMin: number | null;
};

const SESSION_ACCENTS = [
  "from-blue-600 to-cyan-600",
  "from-teal-500 to-cyan-600",
  "from-violet-600 to-fuchsia-600",
  "from-emerald-600 to-teal-600",
  "from-rose-500 to-red-600",
  "from-amber-500 to-orange-500",
];

const KIND_ICON: Record<Kind, typeof Dumbbell> = {
  strength: Dumbbell, zone2: Activity, vo2max: Flame, mobility: Sparkles,
};

export function SessionEditor({
  sessionId,
  initial,
  zones,
  attached,
  exerciseLibrary,
}: {
  sessionId: string;
  initial: Header;
  zones: Zone[];
  attached: Attached[];
  exerciseLibrary: LibExercise[];
}) {
  const [form, setForm] = useState<Header>(initial);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const Icon = KIND_ICON[form.kind];

  // Auto-calc est minutes for cardio kinds.
  const computedEst = useMemo(() => {
    if (form.kind === "zone2") return Math.max(5, form.durationMin ?? 30);
    if (form.kind === "vo2max") {
      // Use the same fallback defaults the input fields display, so the auto
      // total matches what the clinician sees before they edit each field.
      const w = form.warmupMin ?? 10;
      const r = form.rounds ?? 4;
      const wm = form.workMin ?? 4;
      const rm = form.recoverMin ?? 3;
      const cd = form.cooldownMin ?? 5;
      // Total session time: warm-up + every round's work AND recovery + cool-down.
      return Math.max(5, w + r * wm + r * rm + cd);
    }
    return form.estMinutes;
  }, [form.kind, form.durationMin, form.warmupMin, form.rounds, form.workMin, form.recoverMin, form.cooldownMin, form.estMinutes]);

  // VO₂ max working minutes only (the high-intensity work intervals) — drives
  // the weekly VO₂ max minutes view, separate from total session time above.
  const vo2WorkMin = useMemo(
    () => Math.max(0, (form.rounds ?? 4) * (form.workMin ?? 4)),
    [form.rounds, form.workMin]
  );

  const dirty =
    form.name !== initial.name ||
    form.focus !== initial.focus ||
    form.estMinutes !== initial.estMinutes ||
    form.accent !== initial.accent ||
    form.coachNote !== initial.coachNote ||
    form.modality !== initial.modality ||
    form.durationMin !== initial.durationMin ||
    form.targetZoneId !== initial.targetZoneId ||
    form.warmupMin !== initial.warmupMin ||
    form.rounds !== initial.rounds ||
    form.workMin !== initial.workMin ||
    form.workZoneId !== initial.workZoneId ||
    form.recoverMin !== initial.recoverMin ||
    form.recoverZoneId !== initial.recoverZoneId ||
    form.cooldownMin !== initial.cooldownMin;

  const saveHeader = () => {
    setSaved(false);
    startTransition(async () => {
      await updateSessionHeader({
        id: sessionId,
        kind: form.kind,
        name: form.name,
        focus: form.focus,
        estMinutes: form.kind === "zone2" || form.kind === "vo2max" ? computedEst : form.estMinutes,
        accent: form.accent,
        coachNote: form.coachNote,
        modality: form.modality,
        durationMin: form.durationMin,
        targetZoneId: form.targetZoneId,
        warmupMin: form.warmupMin,
        rounds: form.rounds,
        workMin: form.workMin,
        workZoneId: form.workZoneId,
        recoverMin: form.recoverMin,
        recoverZoneId: form.recoverZoneId,
        cooldownMin: form.cooldownMin,
      });
      setSaved(true);
    });
  };

  return (
    <>
      <header className="flex items-center gap-3">
        <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${form.accent || "from-slate-500 to-slate-700"} text-white flex items-center justify-center flex-shrink-0`}>
          <Icon size={18} />
        </div>
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-slate-500">Training library · Session</div>
          <div className="text-xl font-semibold text-slate-900 truncate">{form.name || "Untitled session"}</div>
        </div>
      </header>

      {/* ---- Header card ---- */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Session name" value={form.name}
            onChange={(v) => { setForm((p) => ({ ...p, name: v })); setSaved(false); }}
            placeholder="Push Day" />
          <Field label="Focus" value={form.focus ?? ""}
            onChange={(v) => { setForm((p) => ({ ...p, focus: v || null })); setSaved(false); }}
            placeholder="Chest · Shoulders · Triceps" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(form.kind === "strength" || form.kind === "mobility") ? (
            <NumField label="Est. minutes" value={form.estMinutes}
              onChange={(v) => { setForm((p) => ({ ...p, estMinutes: v })); setSaved(false); }} />
          ) : (
            <ReadOnly label="Est. minutes (auto)" value={`${computedEst}m`} />
          )}
          <div>
            <Label>Accent</Label>
            <div className="flex gap-1.5 flex-wrap">
              {SESSION_ACCENTS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => { setForm((p) => ({ ...p, accent: a })); setSaved(false); }}
                  className={`w-7 h-7 rounded-lg bg-gradient-to-br ${a} ${form.accent === a ? "ring-2 ring-offset-1 ring-teal-500" : ""}`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ---- Kind-specific body ---- */}

        {form.kind === "zone2" && (
          <div className="border-t border-slate-100 pt-3 space-y-3">
            <div className="text-sm font-semibold text-slate-900">Steady-state aerobic block</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Modality" value={form.modality ?? ""}
                onChange={(v) => { setForm((p) => ({ ...p, modality: v || null })); setSaved(false); }}
                placeholder="Cycling, Treadmill walk, Row…" />
              <NumField label="Duration (min)" value={form.durationMin ?? 30}
                onChange={(v) => { setForm((p) => ({ ...p, durationMin: v })); setSaved(false); }} />
            </div>
            <ZonePicker label="Target HR zone" value={form.targetZoneId} zones={zones}
              onChange={(id) => { setForm((p) => ({ ...p, targetZoneId: id })); setSaved(false); }} />
            <FieldTextarea label="Coach note" value={form.coachNote ?? ""}
              onChange={(v) => { setForm((p) => ({ ...p, coachNote: v || null })); setSaved(false); }}
              placeholder="Conversational pace — should hold a sentence." />
          </div>
        )}

        {form.kind === "vo2max" && (
          <div className="border-t border-slate-100 pt-3 space-y-3">
            <div className="text-sm font-semibold text-slate-900">Interval protocol</div>
            <Field label="Modality" value={form.modality ?? ""}
              onChange={(v) => { setForm((p) => ({ ...p, modality: v || null })); setSaved(false); }}
              placeholder="Cycling, rowing, treadmill incline…" />

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
              <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Warm-up</div>
              <NumField label="Warm-up (min)" value={form.warmupMin ?? 10}
                onChange={(v) => { setForm((p) => ({ ...p, warmupMin: v })); setSaved(false); }} />
            </div>

            <div className="bg-rose-50/60 border border-rose-200 rounded-xl p-3 space-y-3">
              <div className="text-[11px] uppercase tracking-wide text-rose-700 font-semibold">Work intervals</div>
              <div className="grid grid-cols-3 gap-3">
                <NumField label="Rounds" value={form.rounds ?? 4}
                  onChange={(v) => { setForm((p) => ({ ...p, rounds: v })); setSaved(false); }} />
                <NumField label="Work (min)" value={form.workMin ?? 4}
                  onChange={(v) => { setForm((p) => ({ ...p, workMin: v })); setSaved(false); }} />
                <NumField label="Recovery (min)" value={form.recoverMin ?? 3}
                  onChange={(v) => { setForm((p) => ({ ...p, recoverMin: v })); setSaved(false); }} />
              </div>
              <ZonePicker label="Work zone" value={form.workZoneId} zones={zones}
                onChange={(id) => { setForm((p) => ({ ...p, workZoneId: id })); setSaved(false); }} />
              <ZonePicker label="Recovery zone" value={form.recoverZoneId} zones={zones}
                onChange={(id) => { setForm((p) => ({ ...p, recoverZoneId: id })); setSaved(false); }} />
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
              <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Cool-down</div>
              <NumField label="Cool-down (min)" value={form.cooldownMin ?? 5}
                onChange={(v) => { setForm((p) => ({ ...p, cooldownMin: v })); setSaved(false); }} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <ReadOnly label="VO₂ max minutes (work only)" value={`${vo2WorkMin}m`} />
              <ReadOnly label="Total session time (auto)" value={`${computedEst}m`} />
            </div>

            <FieldTextarea label="Coach note" value={form.coachNote ?? ""}
              onChange={(v) => { setForm((p) => ({ ...p, coachNote: v || null })); setSaved(false); }}
              placeholder="Hard but sustainable for the full work block." />
          </div>
        )}

        {(form.kind === "strength" || form.kind === "mobility") && (
          <div className="border-t border-slate-100 pt-3">
            <FieldTextarea label="Coach note (optional)" value={form.coachNote ?? ""}
              onChange={(v) => { setForm((p) => ({ ...p, coachNote: v || null })); setSaved(false); }}
              placeholder="Move slowly. Breathe deeply." />
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={saveHeader}
            disabled={!dirty || pending}
            className={`text-sm font-semibold px-4 py-2 rounded-lg ${
              dirty && !pending ? "bg-teal-700 text-white hover:bg-teal-800" : "bg-slate-200 text-slate-400 cursor-not-allowed"
            }`}
          >
            {pending ? "Saving…" : "Save"}
          </button>
          {saved && !dirty && <span className="text-xs text-emerald-700">Saved.</span>}
        </div>
      </section>

      {/* ---- Exercises (strength + mobility only) ---- */}
      {(form.kind === "strength" || form.kind === "mobility") && (
        <ExercisesSection
          sessionId={sessionId}
          kind={form.kind}
          attached={attached}
          exerciseLibrary={exerciseLibrary}
        />
      )}
    </>
  );
}

// ----- Exercises section -----

function ExercisesSection({
  sessionId,
  kind,
  attached,
  exerciseLibrary,
}: {
  sessionId: string;
  kind: "strength" | "mobility";
  attached: Attached[];
  exerciseLibrary: LibExercise[];
}) {
  const [pending, startTransition] = useTransition();
  const labels = kind === "mobility"
    ? { round: "Round", reps: "Hold (sec)", weight: "Reps / sides", add: "Add move", title: "Mobility moves in this flow" }
    : { round: "Set",   reps: "Reps",       weight: "Weight (lb)", add: "Add exercise", title: "Exercises in this session" };

  const noneInLibrary = exerciseLibrary.length === 0;

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">{labels.title}</div>
          <div className="text-[11px] text-slate-500">
            Picks from your {kind} exercise library. Add → reorder → edit sets.
          </div>
        </div>
        <button
          onClick={() => {
            if (noneInLibrary) return;
            startTransition(() => {
              void addSessionExercise({ sessionId, exerciseId: exerciseLibrary[0].id });
            });
          }}
          disabled={noneInLibrary || pending}
          className={`text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1 ${
            !noneInLibrary && !pending
              ? (kind === "mobility" ? "bg-amber-600 text-white hover:bg-amber-700" : "bg-teal-700 text-white hover:bg-teal-800")
              : "bg-slate-200 text-slate-400 cursor-not-allowed"
          }`}
        >
          <Plus size={12} /> {labels.add}
        </button>
      </div>

      {noneInLibrary && (
        <div className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
          No {kind} exercises in your library yet. Add some on the Exercises page first.
        </div>
      )}

      {attached.length === 0 && !noneInLibrary && (
        <div className="text-sm text-slate-500 italic py-6 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
          No {kind === "mobility" ? "moves" : "exercises"} yet.
        </div>
      )}

      <div className="space-y-3">
        {attached.map((a, idx) => (
          <AttachedExerciseRow
            key={a.id}
            sessionId={sessionId}
            kind={kind}
            attached={a}
            index={idx}
            total={attached.length}
            exerciseLibrary={exerciseLibrary}
            labels={labels}
          />
        ))}
      </div>
    </section>
  );
}

function AttachedExerciseRow({
  sessionId,
  kind,
  attached,
  index,
  total,
  exerciseLibrary,
  labels,
}: {
  sessionId: string;
  kind: "strength" | "mobility";
  attached: Attached;
  index: number;
  total: number;
  exerciseLibrary: LibExercise[];
  labels: { round: string; reps: string; weight: string; add: string; title: string };
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div className={`border rounded-xl p-3 ${kind === "mobility" ? "bg-amber-50/50 border-amber-200" : "bg-slate-50 border-slate-200"}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0 ${
          kind === "mobility" ? "bg-amber-200 text-amber-800" : "bg-slate-200 text-slate-700"
        }`}>
          {index + 1}
        </span>
        <select
          value={attached.exerciseId}
          onChange={(e) => startTransition(() => changeSessionExercise({ id: attached.id, sessionId, exerciseId: e.target.value }))}
          disabled={pending}
          className="flex-1 text-sm font-semibold text-slate-900 border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-teal-500"
        >
          {exerciseLibrary.map((ex) => (
            <option key={ex.id} value={ex.id}>{ex.name}</option>
          ))}
          {!exerciseLibrary.find((e) => e.id === attached.exerciseId) && (
            <option value={attached.exerciseId}>(unavailable)</option>
          )}
        </select>
        <button onClick={() => startTransition(() => moveSessionExercise({ id: attached.id, sessionId, direction: "up" }))}
          disabled={index === 0 || pending}
          className={`text-xs px-1.5 py-1 rounded ${index === 0 ? "text-slate-300" : "text-slate-600 hover:bg-slate-200"}`}>↑</button>
        <button onClick={() => startTransition(() => moveSessionExercise({ id: attached.id, sessionId, direction: "down" }))}
          disabled={index === total - 1 || pending}
          className={`text-xs px-1.5 py-1 rounded ${index === total - 1 ? "text-slate-300" : "text-slate-600 hover:bg-slate-200"}`}>↓</button>
        <button onClick={() => {
            if (!confirm("Remove from this session?")) return;
            startTransition(() => removeSessionExercise({ id: attached.id, sessionId }));
          }}
          disabled={pending}
          className="text-xs text-rose-600 px-1.5 py-1 rounded hover:bg-rose-50">×</button>
      </div>

      {(attached.primaryArea || attached.videoTitle) && (
        <div className="text-[11px] text-slate-500 ml-8 mb-2 flex items-center gap-2">
          {attached.primaryArea && <span>{attached.primaryArea}</span>}
          {attached.videoTitle && (
            <span className="flex items-center gap-1 text-violet-700">
              <Video size={11} /> {attached.videoTitle}
            </span>
          )}
        </div>
      )}

      <div className="ml-8 space-y-1.5">
        <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
          <div className="col-span-2">{labels.round}</div>
          <div className="col-span-3">{labels.reps}</div>
          <div className="col-span-3">{labels.weight}</div>
          <div className="col-span-2">Time (s)</div>
          <div className="col-span-2"></div>
        </div>
        {attached.sets.map((s) => (
          <SetRow key={s.id} set={s} sessionId={sessionId} canRemove={attached.sets.length > 1} />
        ))}
        <button
          onClick={() => startTransition(() => addSet({ sessionExerciseId: attached.id, sessionId }))}
          disabled={pending}
          className="text-[11px] font-semibold text-teal-700 bg-white border border-teal-200 px-2 py-1 rounded-lg flex items-center gap-1"
        >
          <Plus size={11} /> Add set
        </button>
      </div>
    </div>
  );
}

function SetRow({
  set,
  sessionId,
  canRemove,
}: {
  set: AttachedSet;
  sessionId: string;
  canRemove: boolean;
}) {
  const [reps, setReps] = useState(set.reps);
  const [weight, setWeight] = useState(set.weight);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(set.durationSeconds);
  const [pending, startTransition] = useTransition();

  const dirty = reps !== set.reps || weight !== set.weight || durationSeconds !== set.durationSeconds;
  const save = () => dirty && startTransition(() => updateSet({ id: set.id, sessionId, reps, weight, durationSeconds }));

  return (
    <div className="grid grid-cols-12 gap-2 items-center">
      <div className="col-span-2 text-sm text-slate-700 font-medium">#{set.setNumber}</div>
      <input
        type="number"
        value={reps}
        onChange={(e) => setReps(Number(e.target.value) || 0)}
        onBlur={save}
        className="col-span-3 text-sm text-slate-800 border border-slate-200 rounded-lg p-1.5 focus:outline-none focus:border-teal-500 bg-white tabular-nums"
      />
      <input
        type="number"
        value={weight}
        onChange={(e) => setWeight(Number(e.target.value) || 0)}
        onBlur={save}
        className="col-span-3 text-sm text-slate-800 border border-slate-200 rounded-lg p-1.5 focus:outline-none focus:border-teal-500 bg-white tabular-nums"
      />
      <input
        type="number"
        value={durationSeconds ?? ""}
        placeholder="—"
        onChange={(e) => setDurationSeconds(e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0))}
        onBlur={save}
        className="col-span-2 text-sm text-slate-800 border border-slate-200 rounded-lg p-1.5 focus:outline-none focus:border-teal-500 bg-white tabular-nums"
      />
      <button
        onClick={() => startTransition(() => removeSet({ id: set.id, sessionId }))}
        disabled={!canRemove || pending}
        className={`col-span-2 text-xs px-1 py-1 rounded ${
          canRemove ? "text-rose-600 hover:bg-rose-50" : "text-slate-300 cursor-not-allowed"
        }`}
      >
        <Trash2 size={12} className="inline" />
      </button>
    </div>
  );
}

// ----- Small field helpers -----

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mb-1">{children}</div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
      />
    </label>
  );
}

function FieldTextarea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <textarea
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
      />
    </label>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500 tabular-nums"
      />
    </label>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="text-sm font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 tabular-nums">
        {value}
      </div>
    </div>
  );
}

function ZonePicker({
  label, value, zones, onChange,
}: {
  label: string;
  value: string | null;
  zones: Zone[];
  onChange: (id: string | null) => void;
}) {
  const z = zones.find((zone) => zone.id === value) ?? null;
  return (
    <div>
      <Label>{label}</Label>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full text-sm font-semibold text-slate-900 border border-slate-200 rounded-lg px-2 py-2 bg-white focus:outline-none focus:border-teal-500"
      >
        <option value="">(no zone selected)</option>
        {zones.map((zone) => (
          <option key={zone.id} value={zone.id}>
            {zone.name} · {zone.lowBpm}–{zone.highBpm} bpm
          </option>
        ))}
      </select>
      {z && (
        <div className="text-[10px] text-slate-500 mt-1">{z.shortName} · {z.lowBpm}–{z.highBpm} bpm</div>
      )}
    </div>
  );
}
