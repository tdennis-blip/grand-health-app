"use client";

import { useState, useTransition } from "react";
import {
  CalendarDays, Plus, Pencil, X, Check, ChevronDown, ChevronUp, Clock, MapPin, FileText,
} from "lucide-react";
import type { Appointment, AppointmentType } from "@/lib/appointments-utils";
import { APPT_TYPES, apptTypeLabel } from "@/lib/appointments-utils";
import {
  createAppointment,
  updateAppointment,
  cancelAppointment,
  completeAppointment,
} from "./actions";

// ---------------------------------------------------------------------------
// Public entry point — rendered by the server page
// ---------------------------------------------------------------------------

export function AppointmentsCard({
  patientId,
  initial,
  customTypes = [],
}: {
  patientId: string;
  initial: Appointment[];
  customTypes?: AppointmentType[];
}) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);

  // Split past vs upcoming for display
  const now = new Date().toISOString();
  const upcoming = initial.filter(
    (a) => a.status === "scheduled" && a.scheduledAt >= now
  );
  const past = initial.filter(
    (a) => a.status !== "scheduled" || a.scheduledAt < now
  );

  function openCreate() {
    setEditing(null);
    setShowForm(true);
  }
  function openEdit(a: Appointment) {
    setEditing(a);
    setShowForm(true);
  }
  function closeForm() {
    setShowForm(false);
    setEditing(null);
  }

  return (
    <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center">
            <CalendarDays size={16} />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">Appointments</div>
            <div className="text-[11px] text-slate-500">
              {upcoming.length} upcoming · {past.length} past
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/clinician/settings/appointment-types"
            className="text-[11px] text-slate-500 hover:text-teal-700 underline underline-offset-2"
          >
            Manage types
          </a>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 text-[12px] font-semibold text-teal-700 border border-teal-200 bg-teal-50 hover:bg-teal-100 px-3 py-1.5 rounded-lg transition"
          >
            <Plus size={13} /> New
          </button>
        </div>
      </div>

      {/* Create / edit form */}
      {showForm && (
        <AppointmentForm
          patientId={patientId}
          editing={editing}
          onClose={closeForm}
          customTypes={customTypes}
        />
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div className="divide-y divide-slate-100">
          {upcoming.map((a) => (
            <ApptRow key={a.id} appt={a} patientId={patientId} onEdit={openEdit} />
          ))}
        </div>
      )}

      {/* Past (collapsed list) */}
      {past.length > 0 && (
        <CollapsiblePast past={past} patientId={patientId} onEdit={openEdit} />
      )}

      {initial.length === 0 && !showForm && (
        <div className="px-5 py-5 text-center text-[12px] text-slate-500">
          No appointments yet — click <strong>New</strong> to schedule one.
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Single appointment row
// ---------------------------------------------------------------------------

function ApptRow({
  appt,
  patientId,
  onEdit,
}: {
  appt: Appointment;
  patientId: string;
  onEdit: (a: Appointment) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);

  const dt = new Date(appt.scheduledAt);
  const dateStr = dt.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeStr = dt.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  const statusCls =
    appt.status === "completed"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : appt.status === "cancelled"
      ? "bg-rose-50 text-rose-700 border-rose-200"
      : "bg-teal-50 text-teal-700 border-teal-200";

  function handleComplete() {
    startTransition(async () => { await completeAppointment(appt.id, patientId); });
  }
  function handleCancel() {
    if (!confirm("Cancel this appointment?")) return;
    startTransition(async () => { await cancelAppointment(appt.id, patientId); });
  }

  return (
    <div className={`px-5 py-3.5 ${pending ? "opacity-50" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12.5px] font-semibold text-slate-900">
              {appt.title || apptTypeLabel(appt.type)}
            </span>
            <span
              className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${statusCls}`}
            >
              {appt.status}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-[11px] text-slate-500 flex items-center gap-1">
              <Clock size={10} /> {dateStr} · {timeStr} · {appt.durationMinutes} min
            </span>
            {appt.location && (
              <span className="text-[11px] text-slate-500 flex items-center gap-1">
                <MapPin size={10} /> {appt.location}
              </span>
            )}
          </div>
          {appt.title && (
            <div className="text-[11px] text-slate-500 mt-0.5">{apptTypeLabel(appt.type)}</div>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {appt.status === "scheduled" && (
            <>
              <button
                onClick={() => onEdit(appt)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition"
                title="Edit"
              >
                <Pencil size={13} />
              </button>
              <button
                onClick={handleComplete}
                className="p-1.5 rounded-lg hover:bg-emerald-50 text-slate-500 hover:text-emerald-700 transition"
                title="Mark completed"
              >
                <Check size={13} />
              </button>
              <button
                onClick={handleCancel}
                className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-500 hover:text-rose-600 transition"
                title="Cancel"
              >
                <X size={13} />
              </button>
            </>
          )}
          {(appt.preAppointmentInstructions || appt.notes) && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition"
              title={expanded ? "Collapse" : "Expand"}
            >
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-2.5 space-y-2 pl-1">
          {appt.preAppointmentInstructions && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-amber-700 font-semibold mb-1 flex items-center gap-1">
                <FileText size={10} /> Pre-appointment instructions
                <span className="font-normal normal-case text-amber-600">
                  · signal sent {appt.prepNoticeHours}h before
                </span>
              </div>
              <div className="text-[12px] text-amber-900 leading-snug whitespace-pre-wrap">
                {appt.preAppointmentInstructions}
              </div>
            </div>
          )}
          {appt.notes && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
                Internal notes
              </div>
              <div className="text-[12px] text-slate-700 leading-snug whitespace-pre-wrap">
                {appt.notes}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Past appointments — collapsed by default
// ---------------------------------------------------------------------------

function CollapsiblePast({
  past,
  patientId,
  onEdit,
}: {
  past: Appointment[];
  patientId: string;
  onEdit: (a: Appointment) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-slate-100">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-3 text-left"
      >
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Past &amp; cancelled ({past.length})
        </div>
        {open ? <ChevronUp size={13} className="text-slate-400" /> : <ChevronDown size={13} className="text-slate-400" />}
      </button>
      {open && (
        <div className="divide-y divide-slate-100">
          {past.map((a) => (
            <ApptRow key={a.id} appt={a} patientId={patientId} onEdit={onEdit} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create / edit form
// ---------------------------------------------------------------------------

function AppointmentForm({
  patientId,
  editing,
  onClose,
  customTypes = [],
}: {
  patientId: string;
  editing: Appointment | null;
  onClose: () => void;
  customTypes?: AppointmentType[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Default datetime: next whole hour, minimum 15 min from now
  function defaultDatetime(): string {
    const d = new Date(Date.now() + 15 * 60_000);
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    // Format: YYYY-MM-DDTHH:mm (local time for datetime-local input)
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // Convert stored ISO UTC back to local datetime-local string for the input
  function isoToLocal(iso: string): string {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  const initial = editing
    ? {
        scheduledAt: isoToLocal(editing.scheduledAt),
        durationMinutes: editing.durationMinutes,
        type: editing.type,
        title: editing.title ?? "",
        location: editing.location ?? "",
        preAppointmentInstructions: editing.preAppointmentInstructions ?? "",
        prepNoticeHours: editing.prepNoticeHours,
        notes: editing.notes ?? "",
      }
    : {
        scheduledAt: defaultDatetime(),
        durationMinutes: 60,
        type: "follow_up",
        title: "",
        location: "",
        preAppointmentInstructions: "",
        prepNoticeHours: 24,
        notes: "",
      };

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("patientId", patientId);
    startTransition(async () => {
      const result = editing
        ? await updateAppointment(editing.id, patientId, fd)
        : await createAppointment(fd);
      if (result.ok) {
        onClose();
      } else {
        setError(result.error ?? "Something went wrong");
      }
    });
  }

  return (
    <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[13px] font-semibold text-slate-900">
          {editing ? "Edit appointment" : "New appointment"}
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
          <X size={16} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Date / time + duration */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
              Date &amp; time
            </label>
            <input
              type="datetime-local"
              name="scheduledAt"
              defaultValue={initial.scheduledAt}
              required
              className="w-full text-[12px] bg-white border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-300"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
              Duration (min)
            </label>
            <input
              type="number"
              name="durationMinutes"
              defaultValue={initial.durationMinutes}
              min={5}
              max={480}
              required
              className="w-full text-[12px] bg-white border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-300"
            />
          </div>
        </div>

        {/* Type */}
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
            Type
          </label>
          <select
            name="type"
            defaultValue={initial.type}
            className="w-full text-[12px] bg-white border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-300"
          >
            {customTypes.length > 0 && (
              <optgroup label="Custom types">
                {customTypes.map((t) => (
                  <option key={t.slug} value={t.slug}>{t.name}</option>
                ))}
              </optgroup>
            )}
            <optgroup label={customTypes.length > 0 ? "Built-in defaults" : undefined}>
              {APPT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </optgroup>
          </select>
        </div>

        {/* Title + Location */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
              Custom title <span className="font-normal normal-case">(optional)</span>
            </label>
            <input
              type="text"
              name="title"
              defaultValue={initial.title}
              maxLength={200}
              placeholder="e.g. Quarterly check-in"
              className="w-full text-[12px] bg-white border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-300"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
              Location <span className="font-normal normal-case">(optional)</span>
            </label>
            <input
              type="text"
              name="location"
              defaultValue={initial.location}
              maxLength={300}
              placeholder="Virtual / In-office / address"
              className="w-full text-[12px] bg-white border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-300"
            />
          </div>
        </div>

        {/* Pre-appointment instructions */}
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
            Pre-appointment instructions{" "}
            <span className="font-normal normal-case">(shown to patient before their visit)</span>
          </label>
          <textarea
            name="preAppointmentInstructions"
            defaultValue={initial.preAppointmentInstructions}
            rows={3}
            maxLength={2000}
            placeholder="e.g. Fast for 12 hours beforehand. Wear comfortable clothing. Bring recent labs."
            className="w-full text-[12px] bg-white border border-slate-200 rounded-lg px-2.5 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-300"
          />
        </div>

        {/* Prep notice hours */}
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
            Show prep signal to patient how many hours before?
          </label>
          <select
            name="prepNoticeHours"
            defaultValue={initial.prepNoticeHours}
            className="w-full text-[12px] bg-white border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-300"
          >
            <option value={6}>6 hours before</option>
            <option value={12}>12 hours before</option>
            <option value={24}>24 hours before (day-before alert)</option>
            <option value={48}>48 hours before (2 days)</option>
            <option value={72}>72 hours before (3 days)</option>
          </select>
        </div>

        {/* Internal notes */}
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
            Internal notes <span className="font-normal normal-case">(not visible to patient)</span>
          </label>
          <textarea
            name="notes"
            defaultValue={initial.notes}
            rows={2}
            maxLength={5000}
            placeholder="Clinical notes for the team…"
            className="w-full text-[12px] bg-white border border-slate-200 rounded-lg px-2.5 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-300"
          />
        </div>

        {error && (
          <div className="text-[11.5px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="text-[12px] font-semibold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 px-4 py-2 rounded-lg transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="text-[12px] font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-60 px-4 py-2 rounded-lg transition"
          >
            {pending ? "Saving…" : editing ? "Save changes" : "Create appointment"}
          </button>
        </div>
      </form>
    </div>
  );
}
