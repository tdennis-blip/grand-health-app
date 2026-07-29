"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Plus, Copy, Trash2, HeartPulse, Dumbbell, CalendarRange, Check } from "lucide-react";
import {
  seedPatientZones, updatePatientZone, generatePatientZones,
  createPatientSession, cloneSessionForPatient, deletePatientSession,
  createPatientProgram, clonePatientProgram, deletePatientProgram,
} from "./actions";
import { assignProgramToPatient, endProgramAssignment } from "@/app/clinician/library/training/programs/actions";

type Kind = "strength" | "zone2" | "vo2max" | "mobility";
type Zone = { id: string; zoneKey: string; name: string; shortName: string; lowBpm: number; highBpm: number };
type PSession = { id: string; kind: Kind; name: string; focus: string | null; estMinutes: number };
type GSession = { id: string; kind: Kind; name: string };
type PProgram = { id: string; name: string; description: string | null };
type GProgram = { id: string; name: string };
type Assignment = { id: string; programId: string; programName: string; ended: boolean };

const KIND_LABEL: Record<Kind, string> = { strength: "Strength", zone2: "Zone 2", vo2max: "VO₂ max", mobility: "Movements & practices" };

export function TrainingHub({
  patientId, zones, hasGenericZones,
  patientSessions, genericSessions,
  patientPrograms, genericPrograms, assignments,
}: {
  patientId: string;
  zones: Zone[];
  hasGenericZones: boolean;
  patientSessions: PSession[];
  genericSessions: GSession[];
  patientPrograms: PProgram[];
  genericPrograms: GProgram[];
  assignments: Assignment[];
}) {
  return (
    <div className="space-y-5">
      <ZonesSection patientId={patientId} zones={zones} hasGenericZones={hasGenericZones} />
      <SessionsSection patientId={patientId} sessions={patientSessions} generics={genericSessions} />
      <ProgramsSection patientId={patientId} programs={patientPrograms} generics={genericPrograms} assignments={assignments} />
    </div>
  );
}

// ── Zones ────────────────────────────────────────────────────────────────────
function ZonesSection({ patientId, zones, hasGenericZones }: { patientId: string; zones: Zone[]; hasGenericZones: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <HeartPulse size={16} className="text-rose-500" />
        <div className="text-sm font-semibold text-slate-900">HR zones for this patient</div>
      </div>
      {zones.length === 0 ? (
        <div className="space-y-3">
          <div className="text-[13px] text-slate-500">
            Enter this patient&apos;s max HR to generate their five zones, then fine-tune each range. Or copy the clinic defaults.
          </div>
          <MaxHrGenerator patientId={patientId} label="Generate zones" />
          {hasGenericZones && (
            <button
              onClick={() => startTransition(() => seedPatientZones({ patientId }))}
              disabled={pending}
              className="text-sm font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:border-slate-300 inline-flex items-center gap-1"
            >
              <Copy size={13} /> Copy clinic zones instead
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          {zones.map((z) => <ZoneRow key={z.id} patientId={patientId} zone={z} />)}
          <div className="text-[11px] text-slate-400 pt-1">Edit each range directly (saves on blur), or regenerate from a max HR below.</div>
          <div className="pt-1"><MaxHrGenerator patientId={patientId} label="Regenerate from max HR" compact /></div>
        </div>
      )}
    </section>
  );
}

function ZoneRow({ patientId, zone }: { patientId: string; zone: Zone }) {
  const [name, setName] = useState(zone.name);
  const [shortName, setShortName] = useState(zone.shortName);
  const [lowBpm, setLowBpm] = useState(zone.lowBpm);
  const [highBpm, setHighBpm] = useState(zone.highBpm);
  const [pending, startTransition] = useTransition();
  const dirty = name !== zone.name || shortName !== zone.shortName || lowBpm !== zone.lowBpm || highBpm !== zone.highBpm;
  const save = () => dirty && startTransition(() => updatePatientZone({ patientId, id: zone.id, name, shortName, lowBpm, highBpm }));
  return (
    <div className="grid grid-cols-12 gap-2 items-center">
      <span className="col-span-1 text-[11px] font-semibold text-slate-500 uppercase">{zone.zoneKey}</span>
      <input value={name} onChange={(e) => setName(e.target.value)} onBlur={save} disabled={pending}
        className="col-span-4 text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-teal-500" />
      <input value={shortName} onChange={(e) => setShortName(e.target.value)} onBlur={save} disabled={pending}
        className="col-span-2 text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-teal-500" />
      <div className="col-span-5 flex items-center gap-1">
        <input type="number" value={lowBpm} onChange={(e) => setLowBpm(Number(e.target.value) || 0)} onBlur={save} disabled={pending}
          className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 tabular-nums text-center focus:outline-none focus:border-teal-500" />
        <span className="text-slate-400 text-xs">–</span>
        <input type="number" value={highBpm} onChange={(e) => setHighBpm(Number(e.target.value) || 0)} onBlur={save} disabled={pending}
          className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 tabular-nums text-center focus:outline-none focus:border-teal-500" />
        <span className="text-[10px] text-slate-400">bpm</span>
      </div>
    </div>
  );
}

function MaxHrGenerator({ patientId, label, compact }: { patientId: string; label: string; compact?: boolean }) {
  const [maxHr, setMaxHr] = useState("");
  const [pending, startTransition] = useTransition();
  const n = parseInt(maxHr, 10);
  const valid = n >= 100 && n <= 240;
  const run = () => {
    if (!valid) return;
    if (compact && !confirm("Regenerate the five zones from this max HR? This replaces the current zones.")) return;
    startTransition(() => generatePatientZones({ patientId, maxHr: n }));
    setMaxHr("");
  };
  return (
    <div className="flex items-end gap-2">
      <label className="block">
        <span className="text-[9.5px] uppercase tracking-wide text-slate-500 font-semibold">Max HR (bpm)</span>
        <input
          type="number" inputMode="numeric" value={maxHr}
          onChange={(e) => setMaxHr(e.target.value)}
          placeholder="e.g. 185"
          className={`mt-0.5 ${compact ? "w-24" : "w-32"} text-sm border border-slate-200 rounded-lg px-2 py-1.5 tabular-nums focus:outline-none focus:border-teal-500`}
        />
      </label>
      <button
        onClick={run}
        disabled={pending || !valid}
        className={`text-sm font-semibold px-3 py-1.5 rounded-lg inline-flex items-center gap-1 ${valid && !pending ? "bg-teal-700 text-white hover:bg-teal-800" : "bg-slate-200 text-slate-400 cursor-not-allowed"}`}
      >
        <HeartPulse size={13} /> {label}
      </button>
    </div>
  );
}

// ── Sessions ─────────────────────────────────────────────────────────────────
function SessionsSection({ patientId, sessions, generics }: { patientId: string; sessions: PSession[]; generics: GSession[] }) {
  const [pending, startTransition] = useTransition();
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<Kind>("strength");
  const [cloneFrom, setCloneFrom] = useState("");

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Dumbbell size={16} className="text-blue-600" />
        <div className="text-sm font-semibold text-slate-900">Sessions for this patient</div>
      </div>

      {sessions.length === 0 && <div className="text-[13px] text-slate-500 italic">No patient-specific sessions yet.</div>}
      <div className="space-y-1.5">
        {sessions.map((s) => (
          <div key={s.id} className="flex items-center gap-2 rounded-xl border border-slate-200 p-2.5">
            <div className="flex-1 min-w-0">
              <Link href={`/clinician/library/training/sessions/${s.id}`} className="text-sm font-semibold text-slate-900 hover:text-teal-700 truncate block">{s.name}</Link>
              <div className="text-[11px] text-slate-500">{KIND_LABEL[s.kind]} · {s.focus || `~${s.estMinutes}m`}</div>
            </div>
            <Link href={`/clinician/library/training/sessions/${s.id}`} className="text-[12px] font-semibold text-teal-700 px-2 py-1">Edit</Link>
            <button onClick={() => { if (confirm("Delete this session?")) startTransition(() => deletePatientSession({ patientId, sessionId: s.id })); }}
              disabled={pending} className="text-rose-600 hover:bg-rose-50 rounded p-1"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-100 pt-3 grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">New session</div>
          <div className="flex gap-1.5">
            <select value={newKind} onChange={(e) => setNewKind(e.target.value as Kind)}
              className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-teal-500">
              {(Object.keys(KIND_LABEL) as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name"
              className="flex-1 min-w-0 text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-teal-500" />
            <button onClick={() => newName.trim() && startTransition(() => createPatientSession({ patientId, kind: newKind, name: newName.trim() }))}
              disabled={pending || !newName.trim()}
              className={`text-sm font-semibold px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1 ${newName.trim() ? "bg-teal-700 text-white hover:bg-teal-800" : "bg-slate-200 text-slate-400"}`}>
              <Plus size={13} />
            </button>
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Clone from template</div>
          <div className="flex gap-1.5">
            <select value={cloneFrom} onChange={(e) => setCloneFrom(e.target.value)}
              className="flex-1 min-w-0 text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-teal-500">
              <option value="">Select a template…</option>
              {generics.map((g) => <option key={g.id} value={g.id}>{g.name} · {KIND_LABEL[g.kind]}</option>)}
            </select>
            <button onClick={() => cloneFrom && startTransition(() => { void cloneSessionForPatient({ patientId, sourceSessionId: cloneFrom }); })}
              disabled={pending || !cloneFrom}
              className={`text-sm font-semibold px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1 ${cloneFrom ? "bg-teal-700 text-white hover:bg-teal-800" : "bg-slate-200 text-slate-400"}`}>
              <Copy size={13} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Programs ─────────────────────────────────────────────────────────────────
function ProgramsSection({ patientId, programs, generics, assignments }: {
  patientId: string; programs: PProgram[]; generics: GProgram[]; assignments: Assignment[];
}) {
  const [pending, startTransition] = useTransition();
  const [newName, setNewName] = useState("");
  const [cloneFrom, setCloneFrom] = useState("");
  const activeAssignment = assignments.find((a) => !a.ended);

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <CalendarRange size={16} className="text-violet-600" />
        <div className="text-sm font-semibold text-slate-900">Programs for this patient</div>
      </div>

      {activeAssignment && (
        <div className="text-[12px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-1.5 inline-flex items-center gap-1">
          <Check size={13} /> Assigned: <span className="font-semibold">{activeAssignment.programName}</span>
        </div>
      )}

      {programs.length === 0 && <div className="text-[13px] text-slate-500 italic">No patient-specific programs yet.</div>}
      <div className="space-y-1.5">
        {programs.map((p) => {
          const assigned = assignments.find((a) => a.programId === p.id && !a.ended);
          return (
            <div key={p.id} className="flex items-center gap-2 rounded-xl border border-slate-200 p-2.5">
              <div className="flex-1 min-w-0">
                <Link href={`/clinician/library/training/programs/${p.id}`} className="text-sm font-semibold text-slate-900 hover:text-teal-700 truncate block">{p.name}</Link>
                {p.description && <div className="text-[11px] text-slate-500 truncate">{p.description}</div>}
              </div>
              <Link href={`/clinician/library/training/programs/${p.id}`} className="text-[12px] font-semibold text-teal-700 px-2 py-1">Edit</Link>
              {assigned ? (
                <button onClick={() => startTransition(() => endProgramAssignment({ id: assigned.id, patientId }))} disabled={pending}
                  className="text-[12px] font-semibold text-slate-500 px-2 py-1 rounded hover:bg-slate-100">Unassign</button>
              ) : (
                <button onClick={() => startTransition(() => { void assignProgramToPatient({ programId: p.id, patientId }); })} disabled={pending}
                  className="text-[12px] font-semibold text-teal-700 px-2 py-1 rounded hover:bg-teal-50">Assign</button>
              )}
              <button onClick={() => { if (confirm("Delete this program?")) startTransition(() => deletePatientProgram({ patientId, programId: p.id })); }}
                disabled={pending} className="text-rose-600 hover:bg-rose-50 rounded p-1"><Trash2 size={14} /></button>
            </div>
          );
        })}
      </div>

      <div className="border-t border-slate-100 pt-3 grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">New program</div>
          <div className="flex gap-1.5">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name"
              className="flex-1 min-w-0 text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-teal-500" />
            <button onClick={() => newName.trim() && startTransition(() => createPatientProgram({ patientId, name: newName.trim() }))}
              disabled={pending || !newName.trim()}
              className={`text-sm font-semibold px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1 ${newName.trim() ? "bg-teal-700 text-white hover:bg-teal-800" : "bg-slate-200 text-slate-400"}`}>
              <Plus size={13} />
            </button>
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Clone from template</div>
          <div className="flex gap-1.5">
            <select value={cloneFrom} onChange={(e) => setCloneFrom(e.target.value)}
              className="flex-1 min-w-0 text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-teal-500">
              <option value="">Select a template…</option>
              {generics.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <button onClick={() => cloneFrom && startTransition(() => { void clonePatientProgram({ patientId, sourceProgramId: cloneFrom }); })}
              disabled={pending || !cloneFrom}
              className={`text-sm font-semibold px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1 ${cloneFrom ? "bg-teal-700 text-white hover:bg-teal-800" : "bg-slate-200 text-slate-400"}`}>
              <Copy size={13} />
            </button>
          </div>
        </div>
      </div>
      <div className="text-[11px] text-slate-400">Cloning a template copies its sessions into this patient so you can customize them without touching the template.</div>
    </section>
  );
}
