"use client";

import { useMemo, useState, useTransition } from "react";
import { updateProgramHeader, setProgramDay } from "../actions";

type Kind = "strength" | "zone2" | "vo2max" | "mobility";
type Day = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

const DAY_KEYS: Day[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABELS: Record<Day, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

const KIND_BADGE: Record<Kind, string> = {
  strength: "bg-blue-50 text-blue-700 border-blue-200",
  zone2:    "bg-teal-50 text-teal-700 border-teal-200",
  vo2max:   "bg-rose-50 text-rose-700 border-rose-200",
  mobility: "bg-amber-50 text-amber-700 border-amber-200",
};

const KIND_LABEL: Record<Kind, string> = {
  strength: "Strength", zone2: "Zone 2", vo2max: "VO₂ max", mobility: "Mobility",
};

type Session = {
  id: string;
  kind: Kind;
  name: string;
  estMinutes: number;
  durationMin: number | null;
  rounds: number | null;
  workMin: number | null;
};

export function ProgramEditor({
  programId,
  initial,
  initialDays,
  sessions,
}: {
  programId: string;
  initial: { name: string; description: string | null };
  initialDays: Record<Day, string | null>;
  sessions: Session[];
}) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? "");
  const [days, setDays] = useState<Record<Day, string | null>>(initialDays);
  const [headerPending, startHeaderTransition] = useTransition();
  const [dayPending, startDayTransition] = useTransition();
  const [headerSaved, setHeaderSaved] = useState(false);

  const headerDirty =
    name !== initial.name || (description || null) !== (initial.description || null);

  const saveHeader = () => {
    setHeaderSaved(false);
    startHeaderTransition(async () => {
      await updateProgramHeader({
        id: programId,
        name,
        description: description || null,
      });
      setHeaderSaved(true);
    });
  };

  const updateDay = (day: Day, sessionId: string | null) => {
    // Optimistic local update + server save.
    setDays((p) => ({ ...p, [day]: sessionId }));
    startDayTransition(async () => {
      await setProgramDay({ programId, day, sessionId });
    });
  };

  // Weekly summary math
  const summary = useMemo(() => {
    let strength = 0, mobility = 0;
    let zone2Min = 0, vo2Min = 0, totalMin = 0;
    DAY_KEYS.forEach((d) => {
      const sid = days[d];
      if (!sid) return;
      const sess = sessions.find((s) => s.id === sid);
      if (!sess) return;
      totalMin += sess.estMinutes;
      if (sess.kind === "strength") strength += 1;
      else if (sess.kind === "mobility") mobility += 1;
      else if (sess.kind === "zone2") zone2Min += sess.durationMin ?? sess.estMinutes;
      else if (sess.kind === "vo2max") vo2Min += (sess.rounds ?? 0) * (sess.workMin ?? 0);
    });
    const filled = DAY_KEYS.filter((d) => days[d]).length;
    return { strength, mobility, zone2Min, vo2Min, totalMin, filled };
  }, [days, sessions]);

  // Sessions grouped by kind for the optgroups.
  const grouped: Record<Kind, Session[]> = {
    strength: sessions.filter((s) => s.kind === "strength"),
    zone2:    sessions.filter((s) => s.kind === "zone2"),
    vo2max:   sessions.filter((s) => s.kind === "vo2max"),
    mobility: sessions.filter((s) => s.kind === "mobility"),
  };

  return (
    <>
      <header>
        <div className="text-xs uppercase tracking-wide text-slate-500">Training library · Program</div>
        <div className="text-xl font-semibold text-slate-900 truncate">{name || "Untitled program"}</div>
      </header>

      {/* Header card */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
        <label className="block">
          <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">Program name</span>
          <input
            value={name}
            onChange={(e) => { setName(e.target.value); setHeaderSaved(false); }}
            className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
          />
        </label>
        <label className="block">
          <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">Description</span>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => { setDescription(e.target.value); setHeaderSaved(false); }}
            className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
          />
        </label>
        <div className="flex items-center gap-2">
          <button
            onClick={saveHeader}
            disabled={!headerDirty || headerPending}
            className={`text-sm font-semibold px-4 py-2 rounded-lg ${
              headerDirty && !headerPending
                ? "bg-teal-700 text-white hover:bg-teal-800"
                : "bg-slate-200 text-slate-400 cursor-not-allowed"
            }`}
          >
            {headerPending ? "Saving…" : "Save"}
          </button>
          {headerSaved && !headerDirty && <span className="text-xs text-emerald-700">Saved.</span>}
        </div>
      </section>

      {/* Weekly schedule */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Weekly schedule</div>
            <div className="text-[11px] text-slate-500">Pick a saved session for each day, or leave as Rest. Saves automatically.</div>
          </div>
        </div>

        {sessions.length === 0 && (
          <div className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 mb-3">
            No sessions in the library yet. Create some on the Sessions page first.
          </div>
        )}

        <div className="space-y-2">
          {DAY_KEYS.map((day) => {
            const sid = days[day];
            const sess = sid ? sessions.find((s) => s.id === sid) ?? null : null;
            const kindLabel = sess ? KIND_LABEL[sess.kind] : "Rest";
            const badgeCls = sess ? KIND_BADGE[sess.kind] : "bg-slate-50 text-slate-500 border-slate-200";
            return (
              <div key={day} className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-2">
                <span className="w-12 text-[11px] uppercase tracking-wide font-bold text-slate-700 flex-shrink-0">
                  {DAY_LABELS[day]}
                </span>
                <select
                  value={sid ?? ""}
                  onChange={(e) => updateDay(day, e.target.value || null)}
                  disabled={dayPending || sessions.length === 0}
                  className="flex-1 text-sm font-semibold text-slate-900 border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-teal-500"
                >
                  <option value="">Rest day</option>
                  <optgroup label="Strength">
                    {grouped.strength.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} (~{s.estMinutes}m)</option>
                    ))}
                  </optgroup>
                  <optgroup label="Zone 2">
                    {grouped.zone2.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} (~{s.estMinutes}m)</option>
                    ))}
                  </optgroup>
                  <optgroup label="VO₂ max">
                    {grouped.vo2max.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} (~{s.estMinutes}m)</option>
                    ))}
                  </optgroup>
                  <optgroup label="Mobility">
                    {grouped.mobility.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} (~{s.estMinutes}m)</option>
                    ))}
                  </optgroup>
                </select>
                <span className={`text-[10px] font-semibold px-2 py-1 rounded border ${badgeCls} flex-shrink-0`}>
                  {kindLabel}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Weekly summary */}
      <section className="bg-teal-50 border border-teal-200 rounded-2xl p-4">
        <div className="text-[11px] uppercase tracking-wide text-teal-800 font-semibold mb-3">Weekly summary</div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
          <SumCell label="Strength" value={`${summary.strength}`} />
          <SumCell label="Zone 2"   value={`${summary.zone2Min}m`} />
          <SumCell label="VO₂ max work" value={`${summary.vo2Min}m`} />
          <SumCell label="Mobility flows" value={`${summary.mobility}`} />
          <SumCell label="Total time" value={`${summary.totalMin}m`} />
        </div>
        <div className="text-[11px] text-slate-600 mt-3">
          {summary.filled} session{summary.filled === 1 ? "" : "s"}/wk · {7 - summary.filled} rest day{7 - summary.filled === 1 ? "" : "s"}
        </div>
      </section>
    </>
  );
}

function SumCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-base font-semibold text-slate-900 tabular-nums">{value}</div>
      <div className="text-[10px] text-slate-600">{label}</div>
    </div>
  );
}
