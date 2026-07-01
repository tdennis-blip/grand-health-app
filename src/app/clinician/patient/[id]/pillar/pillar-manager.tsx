"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Plus, ChevronUp, ChevronDown, Pencil, Trash2, Check, X } from "lucide-react";
import { PillarVisibilityToggle } from "./pillar-visibility-toggle";
import { createPillar, renamePillar, movePillar, deletePillar, addDefaultPillars } from "./actions";

type Pillar = { id: string; name: string; description: string | null; hidden: boolean };

export function PillarManager({ patientId, pillars }: { patientId: string; pillars: Pillar[] }) {
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const run = (fn: () => Promise<unknown>) => {
    setErr(null);
    start(async () => {
      try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong."); }
    });
  };

  const submitNew = () => {
    if (!newName.trim()) return;
    run(async () => { await createPillar({ patientId, name: newName.trim() }); setNewName(""); setAdding(false); });
  };
  const submitRename = (pillarId: string) => {
    if (!editName.trim()) return;
    run(async () => { await renamePillar({ pillarId, patientId, name: editName.trim() }); setEditingId(null); });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold text-slate-900">Pillars</div>
        <button
          onClick={() => { setAdding(true); setNewName(""); }}
          className="text-xs font-semibold text-teal-700 inline-flex items-center gap-1 hover:text-teal-800"
        >
          <Plus size={13} /> Add pillar
        </button>
      </div>
      <div className="text-[11px] text-slate-500 mb-2">
        Click a pillar to edit its factors. Rename, reorder, hide, or remove pillars here.
      </div>

      {adding && (
        <div className="flex items-center gap-2 mb-2 bg-teal-50 border border-teal-200 rounded-xl p-2">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitNew(); if (e.key === "Escape") setAdding(false); }}
            placeholder="Pillar name (e.g. Longevity, Gut health)"
            className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-teal-500"
          />
          <button onClick={submitNew} disabled={pending} className="text-xs font-semibold bg-teal-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50">Add</button>
          <button onClick={() => setAdding(false)} className="text-slate-400 hover:text-slate-600 p-1"><X size={16} /></button>
        </div>
      )}

      <div className="space-y-2">
        {pillars.map((p, i) => (
          <div
            key={p.id}
            className={`rounded-xl border p-3 transition ${p.hidden ? "bg-slate-50 border-slate-200 opacity-70" : "bg-white border-slate-200"}`}
          >
            <div className="flex items-center justify-between gap-3">
              {editingId === p.id ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") submitRename(p.id); if (e.key === "Escape") setEditingId(null); }}
                    className="flex-1 text-sm border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-teal-500"
                  />
                  <button onClick={() => submitRename(p.id)} disabled={pending} className="text-emerald-600 hover:bg-emerald-50 rounded p-1"><Check size={16} /></button>
                  <button onClick={() => setEditingId(null)} className="text-slate-400 hover:bg-slate-100 rounded p-1"><X size={16} /></button>
                </div>
              ) : (
                <Link href={`/clinician/patient/${patientId}/pillar/${p.id}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold text-slate-900 truncate">{p.name}</div>
                    {p.hidden && (
                      <span className="text-[10px] uppercase tracking-wide font-semibold text-slate-500 bg-slate-200 border border-slate-300 px-1.5 py-0.5 rounded-full">Hidden</span>
                    )}
                  </div>
                  {p.description && <div className="text-[11px] text-slate-500 line-clamp-2">{p.description}</div>}
                </Link>
              )}

              {editingId !== p.id && (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => run(() => movePillar({ pillarId: p.id, patientId, direction: "up" }))} disabled={pending || i === 0} className="text-slate-400 hover:text-slate-700 disabled:opacity-30 p-0.5"><ChevronUp size={16} /></button>
                  <button onClick={() => run(() => movePillar({ pillarId: p.id, patientId, direction: "down" }))} disabled={pending || i === pillars.length - 1} className="text-slate-400 hover:text-slate-700 disabled:opacity-30 p-0.5"><ChevronDown size={16} /></button>
                  <button onClick={() => { setEditingId(p.id); setEditName(p.name); }} title="Rename" className="text-slate-400 hover:text-slate-700 p-0.5"><Pencil size={14} /></button>
                  <PillarVisibilityToggle pillarId={p.id} patientId={patientId} hidden={p.hidden} />
                  <button
                    onClick={() => { if (confirm(`Delete “${p.name}” and its factors? This can't be undone.`)) run(() => deletePillar({ pillarId: p.id, patientId })); }}
                    disabled={pending}
                    title="Delete pillar"
                    className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded p-0.5"
                  >
                    <Trash2 size={14} />
                  </button>
                  <Link href={`/clinician/patient/${patientId}/pillar/${p.id}`} className="text-teal-700 text-xs ml-1">Edit →</Link>
                </div>
              )}
            </div>
          </div>
        ))}

        {pillars.length === 0 && (
          <div className="bg-white rounded-xl border border-dashed border-slate-200 p-4 text-center">
            <div className="text-sm text-slate-600">No pillars yet for this patient.</div>
            <button
              onClick={() => run(() => addDefaultPillars({ patientId }))}
              disabled={pending}
              className="mt-2 text-xs font-semibold bg-teal-700 text-white px-3 py-1.5 rounded-lg hover:bg-teal-800 disabled:opacity-50"
            >
              Add default pillars
            </button>
          </div>
        )}
      </div>

      {err && <div className="mt-2 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2">{err}</div>}
    </div>
  );
}
