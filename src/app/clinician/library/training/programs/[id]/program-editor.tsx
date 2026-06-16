"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronUp, ChevronDown, X } from "lucide-react";
import {
  updateProgramHeader,
  addProgramDaySession,
  removeProgramDaySession,
  moveProgramDaySession,
} from "../actions";

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

type DayRow = { rowId: string; sessionId: string };

export function ProgramEditor({
  programId,
  initial,
  initialDays,
  sessions,
}: {
  programId: string;
  initial: { name: string; description: string | null };
  initialDays: Record<Day, DayRow[]>;
  sessions: Session[];
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? "");
  const [headerPending, startHeaderTransition] = useTransition();
  const [dayPending, startDayTransition] = useTransition();
  const [headerSaved, setHeaderSaved] = useState(false);

  const headerDirty =
    name !== initial.name || (description || null) !== (initial.description || null);

  const saveHeader = () => {
    setHeaderSaved(false);
    startHeaderTransition(async () => {
      await updateProgramHeader({ id: programId, name, description: description || null });
      setHeaderSaved(true);
    });
  };

  const sessionById = (id: string) => sessions.find((s) => s.id === id) ?? null;

  const addSession = (day: Day, sessionId: string) => {
    if (!sessionId) return;
    startDayTransition(async () => {
      await addProgramDaySession({ programId, day, sessionId });
      router.refresh();
    });
  };
  const removeRow = (rowId: string) => {
    startDayTransition(async () => {
      await removeProgramDaySession({ programId, rowId });
      router.refresh();
    });
  };
  const moveRow = (rowId: string, direction: "up" | "down") => {
    startDayTransition(async () => {
      await moveProgramDaySession({ programId, rowId, direction });
      router.refresh();
    });
  };

  // Weekly summary math — sum across every session on every day.
  const allRows = DAY_KEYS.flatMap((d) => initialDays[d]);
  let strength = 0, mobility = 0, zone2Min = 0, vo2Min = 0, totalMin = 0;
  allRows.forEach((r) => {
    const sess = sessionById(r.sessionId);
    if (!sess) return;
    totalMin += sess.estMinutes;
    if (sess.kind === "strength") strength += 1;
    else if (sess.kind === "mobility") mobility += 1;
    else if (sess.kind === "zone2") zone2Min += sess.durationMin ?? sess.estMinutes;
    else if (sess.kind === "vo2max") vo2Min += (sess.rounds ?? 0) * (sess.workMin ?? 0);
  });
  const restDays = DAY_KEYS.filter((d) => initialDays[d].length === 0).length;

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
        <div className="mb-3">
          <div className="text-sm font-semibold text-slate-900">Weekly schedule</div>
          <div className="text-[11px] text-slate-500">Add one or more sessions to each day. Days with no sessions are rest days. Saves automatically.</div>
        </div>

        {sessions.length === 0 && (
          <div className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 mb-3">
            No sessions in the library yet. Create some on the Sessions page first.
          </div>
        )}

        <div className="space-y-2">
          {DAY_KEYS.map((day) => {
            const rows = initialDays[day];
            return (
              <div key={day} className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex gap-3">
                <span className="w-12 text-[11px] uppercase tracking-wide font-bold text-slate-700 flex-shrink-0 pt-1.5">
                  {DAY_LABELS[day]}
                </span>
                <div className="flex-1 min-w-0 space-y-1.5">
                  {rows.length === 0 && (
                    <div className="text-[12px] text-slate-400 italic py-1">Rest day</div>
                  )}
                  {rows.map((r, idx) => {
                    const sess = sessionById(r.sessionId);
                    if (!sess) return null;
                    return (
                      <div key={r.rowId} className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2 py-1.5">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border flex-shrink-0 ${KIND_BADGE[sess.kind]}`}>
                          {KIND_LABEL[sess.kind]}
                        </span>
                        <span className="text-sm font-semibold text-slate-900 truncate flex-1">
                          {sess.name} <span className="text-[11px] text-slate-400 font-normal">~{sess.estMinutes}m</span>
                        </span>
                        <button type="button" onClick={() => moveRow(r.rowId, "up")} disabled={dayPending || idx === 0}
                          className="text-slate-400 hover:text-slate-700 disabled:opacity-30" aria-label="Move up">
                          <ChevronUp size={15} />
                        </button>
                        <button type="button" onClick={() => moveRow(r.rowId, "down")} disabled={dayPending || idx === rows.length - 1}
                          className="text-slate-400 hover:text-slate-700 disabled:opacity-30" aria-label="Move down">
                          <ChevronDown size={15} />
                        </button>
                        <button type="button" onClick={() => removeRow(r.rowId)} disabled={dayPending}
                          className="text-slate-400 hover:text-rose-600 disabled:opacity-30" aria-label="Remove">
                          <X size={15} />
                        </button>
                      </div>
                    );
                  })}
                  <select
                    value=""
                    onChange={(e) => { addSession(day, e.target.value); e.target.value = ""; }}
                    disabled={dayPending || sessions.length === 0}
                    className="w-full text-[13px] text-slate-600 border border-dashed border-slate-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-teal-500"
                  >
                    <option value="">+ Add session…</option>
                    <optgroup label="Strength">
                      {grouped.strength.map((s) => (<option key={s.id} value={s.id}>{s.name} (~{s.estMinutes}m)</option>))}
                    </optgroup>
                    <optgroup label="Zone 2">
                      {grouped.zone2.map((s) => (<option key={s.id} value={s.id}>{s.name} (~{s.estMinutes}m)</option>))}
                    </optgroup>
                    <optgroup label="VO₂ max">
                      {grouped.vo2max.map((s) => (<option key={s.id} value={s.id}>{s.name} (~{s.estMinutes}m)</option>))}
                    </optgroup>
                    <optgroup label="Mobility">
                      {grouped.mobility.map((s) => (<option key={s.id} value={s.id}>{s.name} (~{s.estMinutes}m)</option>))}
                    </optgroup>
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Weekly summary */}
      <section className="bg-teal-50 border border-teal-200 rounded-2xl p-4">
        <div className="text-[11px] uppercase tracking-wide text-teal-800 font-semibold mb-3">Weekly summary</div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
          <SumCell label="Strength" value={`${strength}`} />
          <SumCell label="Zone 2"   value={`${zone2Min}m`} />
          <SumCell label="VO₂ max work" value={`${vo2Min}m`} />
          <SumCell label="Mobility flows" value={`${mobility}`} />
          <SumCell label="Total time" value={`${totalMin}m`} />
        </div>
        <div className="text-[11px] text-slate-600 mt-3">
          {allRows.length} session{allRows.length === 1 ? "" : "s"}/wk · {restDays} rest day{restDays === 1 ? "" : "s"}
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
