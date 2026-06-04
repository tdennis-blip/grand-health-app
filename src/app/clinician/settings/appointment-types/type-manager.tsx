"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, X, Check, ToggleLeft, ToggleRight, Trash2, GripVertical } from "lucide-react";
import type { AppointmentType } from "@/lib/appointments-utils";
import {
  createAppointmentType,
  updateAppointmentType,
  toggleAppointmentTypeActive,
  deleteAppointmentType,
} from "./actions";

const COLOR_OPTIONS = [
  { label: "Teal",   value: "teal",   cls: "bg-teal-500" },
  { label: "Blue",   value: "blue",   cls: "bg-blue-500" },
  { label: "Violet", value: "violet", cls: "bg-violet-500" },
  { label: "Amber",  value: "amber",  cls: "bg-amber-500" },
  { label: "Rose",   value: "rose",   cls: "bg-rose-500" },
  { label: "Emerald",value: "emerald",cls: "bg-emerald-500" },
  { label: "Slate",  value: "slate",  cls: "bg-slate-400" },
];

function colorCls(color: string | null): string {
  const found = COLOR_OPTIONS.find((c) => c.value === color);
  return found?.cls ?? "bg-slate-300";
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

// ---------------------------------------------------------------------------
// Main manager
// ---------------------------------------------------------------------------

export function AppointmentTypeManager({ initial }: { initial: AppointmentType[] }) {
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {/* Existing types */}
      {initial.length === 0 && !showCreate && (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          No custom types yet. Click <strong>Add type</strong> to create your first one.
        </div>
      )}

      <div className="space-y-2">
        {initial.map((t) =>
          editing === t.id ? (
            <EditRow
              key={t.id}
              type={t}
              onClose={() => setEditing(null)}
            />
          ) : (
            <TypeRow
              key={t.id}
              type={t}
              onEdit={() => setEditing(t.id)}
            />
          )
        )}
      </div>

      {/* Create form */}
      {showCreate ? (
        <CreateForm onClose={() => setShowCreate(false)} nextOrder={initial.length} />
      ) : (
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 text-sm font-semibold text-teal-700 border border-teal-200 bg-teal-50 hover:bg-teal-100 px-4 py-2.5 rounded-xl transition"
        >
          <Plus size={15} /> Add type
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Read-only row
// ---------------------------------------------------------------------------

function TypeRow({
  type,
  onEdit,
}: {
  type: AppointmentType;
  onEdit: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleToggle() {
    startTransition(async () => { await toggleAppointmentTypeActive(type.id, !type.active); });
  }
  function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    startTransition(async () => { await deleteAppointmentType(type.id); });
  }

  return (
    <div
      className={`bg-white rounded-xl border p-4 flex items-center gap-3 transition ${
        type.active ? "border-slate-200" : "border-slate-200 opacity-60"
      } ${pending ? "opacity-40" : ""}`}
    >
      <GripVertical size={14} className="text-slate-300 flex-shrink-0" />

      {/* Color dot */}
      <div className={`w-3 h-3 rounded-full flex-shrink-0 ${colorCls(type.color)}`} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-slate-900">{type.name}</span>
          <span className="text-[10px] font-mono text-slate-400 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">
            {type.slug}
          </span>
          {!type.active && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-full">
              Inactive
            </span>
          )}
        </div>
        <div className="text-[11px] text-slate-500 mt-0.5">
          Default {type.defaultDurationMinutes} min · order {type.sortOrder}
        </div>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Toggle active */}
        <button
          onClick={handleToggle}
          title={type.active ? "Deactivate" : "Activate"}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition"
        >
          {type.active ? <ToggleRight size={16} className="text-teal-600" /> : <ToggleLeft size={16} />}
        </button>

        {/* Edit */}
        <button
          onClick={onEdit}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition"
          title="Edit"
        >
          <Pencil size={13} />
        </button>

        {/* Delete */}
        {confirmDelete ? (
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-rose-700 font-semibold">Sure?</span>
            <button
              onClick={handleDelete}
              className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 transition"
              title="Confirm delete"
            >
              <Check size={13} />
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition"
              title="Cancel"
            >
              <X size={13} />
            </button>
          </div>
        ) : (
          <button
            onClick={handleDelete}
            className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition"
            title="Delete"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit row
// ---------------------------------------------------------------------------

function EditRow({ type, onClose }: { type: AppointmentType; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [color, setColor] = useState<string>(type.color ?? "");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("color", color);
    startTransition(async () => {
      const res = await updateAppointmentType(type.id, fd);
      if (res.ok) onClose();
      else setError(res.error ?? "Error saving");
    });
  }

  return (
    <div className="bg-slate-50 border border-teal-200 rounded-xl p-4">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Name</label>
            <input
              type="text"
              name="name"
              defaultValue={type.name}
              required
              maxLength={100}
              className="w-full text-[12px] bg-white border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-teal-200"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Default duration (min)</label>
            <input
              type="number"
              name="defaultDurationMinutes"
              defaultValue={type.defaultDurationMinutes}
              min={5}
              max={480}
              required
              className="w-full text-[12px] bg-white border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-teal-200"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Sort order</label>
            <input
              type="number"
              name="sortOrder"
              defaultValue={type.sortOrder}
              min={0}
              className="w-full text-[12px] bg-white border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-teal-200"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Color</label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
        </div>

        {error && <div className="text-[11.5px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="text-[12px] font-semibold text-slate-600 border border-slate-200 bg-white px-3 py-1.5 rounded-lg">Cancel</button>
          <button type="submit" disabled={pending} className="text-[12px] font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-60 px-3 py-1.5 rounded-lg">
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create form
// ---------------------------------------------------------------------------

function CreateForm({ onClose, nextOrder }: { onClose: () => void; nextOrder: number }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [color, setColor] = useState("");

  function handleNameChange(v: string) {
    setName(v);
    if (!slugTouched) setSlug(slugify(v));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("color", color);
    startTransition(async () => {
      const res = await createAppointmentType(fd);
      if (res.ok) onClose();
      else setError(res.error ?? "Error creating");
    });
  }

  return (
    <div className="bg-slate-50 border border-teal-200 rounded-xl p-4">
      <div className="text-[13px] font-semibold text-slate-900 mb-3">New appointment type</div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Name</label>
            <input
              type="text"
              name="name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              required
              maxLength={100}
              placeholder="e.g. Annual physical"
              className="w-full text-[12px] bg-white border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-teal-200"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
              Slug <span className="font-normal normal-case">(auto-filled)</span>
            </label>
            <input
              type="text"
              name="slug"
              value={slug}
              onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }}
              required
              maxLength={60}
              placeholder="annual_physical"
              className="w-full text-[12px] font-mono bg-white border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-teal-200"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Default duration (min)</label>
            <input
              type="number"
              name="defaultDurationMinutes"
              defaultValue={60}
              min={5}
              max={480}
              required
              className="w-full text-[12px] bg-white border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-teal-200"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Color</label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
        </div>

        <input type="hidden" name="sortOrder" value={nextOrder} />

        {error && <div className="text-[11.5px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="text-[12px] font-semibold text-slate-600 border border-slate-200 bg-white px-3 py-1.5 rounded-lg">Cancel</button>
          <button type="submit" disabled={pending} className="text-[12px] font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-60 px-3 py-1.5 rounded-lg">
            {pending ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Color picker
// ---------------------------------------------------------------------------

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
      {COLOR_OPTIONS.map((c) => (
        <button
          key={c.value}
          type="button"
          onClick={() => onChange(value === c.value ? "" : c.value)}
          title={c.label}
          className={`w-5 h-5 rounded-full ${c.cls} transition ${
            value === c.value ? "ring-2 ring-offset-1 ring-slate-400 scale-110" : "hover:scale-110"
          }`}
        />
      ))}
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="text-[10px] text-slate-500 hover:text-slate-700"
          title="Clear color"
        >
          <X size={11} />
        </button>
      )}
    </div>
  );
}
