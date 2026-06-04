"use client";

import { useState, useTransition } from "react";
import { createProgram } from "../actions";

export function NewProgramForm() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, startTransition] = useTransition();
  const valid = name.trim().length > 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
      <label className="block">
        <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">Program name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Push / Pull / Lower — Block 2"
          className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
        />
      </label>
      <label className="block">
        <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">Description (optional)</span>
        <textarea
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="3-day strength split with Zone 2 base + 1 VO₂ max session per week."
          className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
        />
      </label>
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={() => valid && startTransition(() => createProgram({ name, description }))}
          disabled={!valid || pending}
          className={`text-sm font-semibold px-4 py-2 rounded-lg ${
            valid && !pending ? "bg-teal-700 text-white hover:bg-teal-800" : "bg-slate-200 text-slate-400 cursor-not-allowed"
          }`}
        >
          {pending ? "Creating…" : "Create & edit schedule"}
        </button>
      </div>
    </div>
  );
}
