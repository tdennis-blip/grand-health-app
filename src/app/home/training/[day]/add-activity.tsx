"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, X, Dumbbell, Activity as ActivityIcon } from "lucide-react";
import { addPatientActivity, deletePatientActivity } from "./log-actions";

type ActivitySet = { setNumber: number; reps: number | null; weight: number | null; durationSeconds: number | null };
type Activity = {
  id: string;
  logDate: string;
  kind: "zone2" | "vo2max" | "cardio" | "strength" | "mobility";
  name: string;
  minutes: number | null;
  sets: ActivitySet[];
};

const KIND_LABEL: Record<Activity["kind"], string> = {
  zone2: "Zone 2",
  vo2max: "VO₂ max",
  cardio: "Cardio",
  strength: "Strength",
  mobility: "Mobility",
};

type SetDraft = { reps: string; weight: string; seconds: string };

export function ActivityLogger({
  day,
  logDate,
  activities,
  allowDateChange = false,
  showDates = false,
  title = "Also logged today",
}: {
  day: string;
  logDate: string;
  activities: Activity[];
  allowDateChange?: boolean;
  showDates?: boolean;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"cardio" | "strength">("cardio");
  const [date, setDate] = useState(logDate);
  const [pending, startTransition] = useTransition();

  // cardio
  const [cardioKind, setCardioKind] = useState<"zone2" | "vo2max" | "cardio">("zone2");
  const [cardioName, setCardioName] = useState("");
  const [minutes, setMinutes] = useState("");

  // strength / mobility
  const [strengthKind, setStrengthKind] = useState<"strength" | "mobility">("strength");
  const [strengthName, setStrengthName] = useState("");
  const [sets, setSets] = useState<SetDraft[]>([{ reps: "", weight: "", seconds: "" }]);

  const num = (v: string) => (v.trim() === "" ? null : Math.max(0, parseInt(v, 10) || 0));

  const reset = () => {
    setCardioName(""); setMinutes(""); setCardioKind("zone2");
    setStrengthName(""); setStrengthKind("strength"); setSets([{ reps: "", weight: "", seconds: "" }]);
    setDate(logDate);
    setOpen(false);
  };

  const save = () => {
    const useDate = allowDateChange ? date : logDate;
    if (mode === "cardio") {
      if (!cardioName.trim()) return;
      startTransition(async () => {
        await addPatientActivity({
          day, logDate: useDate, kind: cardioKind, name: cardioName.trim(),
          minutes: num(minutes), sets: [],
        });
        reset();
      });
    } else {
      if (!strengthName.trim()) return;
      startTransition(async () => {
        await addPatientActivity({
          day, logDate: useDate, kind: strengthKind, name: strengthName.trim(), minutes: null,
          sets: sets.map((s) => ({ reps: num(s.reps), weight: num(s.weight), durationSeconds: num(s.seconds) })),
        });
        reset();
      });
    }
  };

  const remove = (id: string) =>
    startTransition(async () => { await deletePatientActivity({ id, day }); });

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{title}</div>

      {activities.length === 0 && !open && (
        <div className="text-[12px] text-slate-400">Nothing extra logged yet.</div>
      )}

      {activities.length > 0 && (
        <div className="space-y-1.5">
          {activities.map((a) => (
            <div key={a.id} className="flex items-start justify-between gap-2 border border-slate-100 rounded-xl px-3 py-2">
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900 truncate">
                  {a.name}
                  <span className="text-slate-400 font-normal"> · {KIND_LABEL[a.kind]}</span>
                  {showDates && (
                    <span className="text-slate-400 font-normal"> · {new Date(`${a.logDate}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500">
                  {a.minutes != null && `${a.minutes} min`}
                  {a.sets.length > 0 &&
                    a.sets
                      .map((s) =>
                        [s.reps != null ? `${s.reps}` : null, s.weight != null ? `${s.weight}lb` : null, s.durationSeconds != null ? `${s.durationSeconds}s` : null]
                          .filter(Boolean)
                          .join("×")
                      )
                      .filter(Boolean)
                      .join(", ")}
                </div>
              </div>
              <button
                onClick={() => remove(a.id)}
                disabled={pending}
                className="text-rose-500 hover:bg-rose-50 rounded p-1 flex-shrink-0"
                aria-label="Delete activity"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="w-full flex items-center justify-center gap-1.5 text-[13px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-xl py-2 hover:bg-teal-100"
        >
          <Plus size={14} /> Add what you did
        </button>
      ) : (
        <div className="border border-slate-200 rounded-xl p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex gap-1.5">
              <button
                onClick={() => setMode("cardio")}
                className={`text-[12px] font-semibold px-2.5 py-1 rounded-lg border inline-flex items-center gap-1 ${mode === "cardio" ? "bg-teal-700 text-white border-teal-700" : "bg-white text-slate-600 border-slate-200"}`}
              >
                <ActivityIcon size={12} /> Cardio
              </button>
              <button
                onClick={() => setMode("strength")}
                className={`text-[12px] font-semibold px-2.5 py-1 rounded-lg border inline-flex items-center gap-1 ${mode === "strength" ? "bg-teal-700 text-white border-teal-700" : "bg-white text-slate-600 border-slate-200"}`}
              >
                <Dumbbell size={12} /> Strength
              </button>
            </div>
            <button onClick={reset} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={16} /></button>
          </div>

          {allowDateChange && (
            <Input label="Date" value={date} onChange={setDate} type="date" />
          )}

          {mode === "cardio" ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {(["zone2", "vo2max", "cardio"] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setCardioKind(k)}
                    className={`text-[11px] px-2 py-1 rounded-lg border ${cardioKind === k ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200"}`}
                  >
                    {KIND_LABEL[k]}
                  </button>
                ))}
              </div>
              <Input label="Activity" value={cardioName} onChange={setCardioName} placeholder="Trail run, bike, swim…" />
              <Input label="Minutes" value={minutes} onChange={setMinutes} type="number" placeholder="45" />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-1.5">
                {(["strength", "mobility"] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setStrengthKind(k)}
                    className={`text-[11px] px-2 py-1 rounded-lg border ${strengthKind === k ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200"}`}
                  >
                    {KIND_LABEL[k]}
                  </button>
                ))}
              </div>
              <Input label="Exercise" value={strengthName} onChange={setStrengthName} placeholder="Goblet squat" />
              <div className="space-y-1.5">
                <div className="grid grid-cols-12 gap-1.5 text-[9.5px] uppercase tracking-wide text-slate-500 font-semibold">
                  <div className="col-span-1">#</div>
                  <div className="col-span-3">Reps</div>
                  <div className="col-span-3">Weight</div>
                  <div className="col-span-3">Time(s)</div>
                  <div className="col-span-2"></div>
                </div>
                {sets.map((s, i) => (
                  <div key={i} className="grid grid-cols-12 gap-1.5 items-center">
                    <div className="col-span-1 text-[12px] text-slate-500">{i + 1}</div>
                    <input type="number" value={s.reps} onChange={(e) => setSets((p) => p.map((x, xi) => xi === i ? { ...x, reps: e.target.value } : x))} className="col-span-3 text-sm text-center border border-slate-200 rounded-lg py-1 focus:outline-none focus:border-teal-500" />
                    <input type="number" value={s.weight} onChange={(e) => setSets((p) => p.map((x, xi) => xi === i ? { ...x, weight: e.target.value } : x))} className="col-span-3 text-sm text-center border border-slate-200 rounded-lg py-1 focus:outline-none focus:border-teal-500" />
                    <input type="number" value={s.seconds} onChange={(e) => setSets((p) => p.map((x, xi) => xi === i ? { ...x, seconds: e.target.value } : x))} className="col-span-3 text-sm text-center border border-slate-200 rounded-lg py-1 focus:outline-none focus:border-teal-500" />
                    <button onClick={() => setSets((p) => p.length > 1 ? p.filter((_, xi) => xi !== i) : p)} className="col-span-2 text-rose-400 hover:text-rose-600 text-xs"><Trash2 size={12} className="inline" /></button>
                  </div>
                ))}
                <button onClick={() => setSets((p) => [...p, { reps: "", weight: "", seconds: "" }])} className="text-[11px] font-semibold text-teal-700 inline-flex items-center gap-1">
                  <Plus size={11} /> Add set
                </button>
              </div>
            </div>
          )}

          <button
            onClick={save}
            disabled={pending}
            className="w-full bg-teal-700 text-white text-sm font-semibold py-2 rounded-lg hover:bg-teal-800 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save activity"}
          </button>
        </div>
      )}
    </section>
  );
}

function Input({
  label, value, onChange, placeholder, type,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-0.5 w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-teal-500"
      />
    </label>
  );
}
