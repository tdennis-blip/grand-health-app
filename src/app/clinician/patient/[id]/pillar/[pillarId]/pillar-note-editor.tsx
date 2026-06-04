"use client";

import { useState, useTransition } from "react";
import { updatePillarNote } from "./actions";

export function PillarNoteEditor({
  patientId,
  pillarId,
  description,
  clinicianNote,
}: {
  patientId: string;
  pillarId: string;
  description: string | null;
  clinicianNote: string | null;
}) {
  const [desc, setDesc] = useState(description ?? "");
  const [note, setNote] = useState(clinicianNote ?? "");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const dirty = (desc ?? "") !== (description ?? "") || (note ?? "") !== (clinicianNote ?? "");

  const save = () => {
    setSaved(false);
    startTransition(async () => {
      await updatePillarNote({
        patientId,
        pillarId,
        description: desc,
        clinicianNote: note,
      });
      setSaved(true);
    });
  };

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">
          Description
        </span>
        <textarea
          rows={2}
          value={desc}
          onChange={(e) => { setDesc(e.target.value); setSaved(false); }}
          placeholder="Short summary the patient sees at the top of this pillar."
          className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
        />
      </label>
      <label className="block">
        <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">
          Clinician note
        </span>
        <textarea
          rows={3}
          value={note}
          onChange={(e) => { setNote(e.target.value); setSaved(false); }}
          placeholder="Personal note shown to the patient — interpret labs, set expectations, frame priorities."
          className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
        />
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || pending}
          className={`text-sm font-semibold px-4 py-2 rounded-lg ${
            dirty && !pending
              ? "bg-teal-700 text-white hover:bg-teal-800"
              : "bg-slate-200 text-slate-400 cursor-not-allowed"
          }`}
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {saved && !dirty && (
          <span className="text-xs text-emerald-700">Saved.</span>
        )}
      </div>
    </div>
  );
}
