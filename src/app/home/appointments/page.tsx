import Link from "next/link";
import { CalendarDays, ChevronLeft, Clock, MapPin, AlertTriangle } from "lucide-react";
import { requirePatient } from "@/lib/auth/server";
import {
  getUpcomingAppointments,
  getNextAppointmentWithPrep,
  apptTypeLabel,
  type Appointment,
  type AppointmentWithPrep,
} from "@/lib/appointments";

export default async function PatientAppointments() {
  const user = await requirePatient();

  const [upcoming, nextWithPrep] = await Promise.all([
    getUpcomingAppointments(user.id, user),
    getNextAppointmentWithPrep(user.id, user),
  ]);

  return (
    <main className="p-5 space-y-4">
      <Link href="/home" className="text-sm text-teal-700 inline-flex items-center gap-1">
        <ChevronLeft size={14} /> Home
      </Link>

      <header>
        <div className="text-xs uppercase tracking-wide text-slate-500">Your schedule</div>
        <div className="text-xl font-semibold text-slate-900 flex items-center gap-1.5">
          <CalendarDays size={18} className="text-teal-700" /> Appointments
        </div>
      </header>

      {/* Prep signal banner — shown when we're inside the notice window */}
      {nextWithPrep?.showPrepSignal && (
        <PrepBanner appt={nextWithPrep} />
      )}

      {upcoming.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-6 text-center">
          <CalendarDays size={24} className="mx-auto text-slate-300 mb-2" />
          <div className="text-sm font-semibold text-slate-900">No upcoming appointments</div>
          <div className="text-[12px] text-slate-500 leading-snug mt-1">
            Your care team will add appointments here when they schedule something.
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {upcoming.map((appt) => (
            <AppointmentTile key={appt.id} appt={appt} isNext={appt.id === nextWithPrep?.id} />
          ))}
        </div>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Prep signal banner
// ---------------------------------------------------------------------------

function PrepBanner({ appt }: { appt: AppointmentWithPrep }) {
  const dt = new Date(appt.scheduledAt);
  const dateStr = dt.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  const timeStr = dt.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <section className="bg-amber-50 border border-amber-300 rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
          <AlertTriangle size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-semibold text-amber-900">
            Heads up — you have an appointment soon
          </div>
          <div className="text-[11px] text-amber-800 mt-0.5">
            {appt.title || apptTypeLabel(appt.type)} · {dateStr} at {timeStr}
          </div>
          <div className="mt-2 text-[12.5px] text-amber-900 leading-snug whitespace-pre-wrap">
            {appt.preAppointmentInstructions}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Appointment tile
// ---------------------------------------------------------------------------

function AppointmentTile({
  appt,
  isNext,
}: {
  appt: Appointment;
  isNext: boolean;
}) {
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

  // Days until
  const diffMs = dt.getTime() - Date.now();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const daysLabel =
    diffDays === 0
      ? "Today"
      : diffDays === 1
      ? "Tomorrow"
      : `In ${diffDays} days`;

  return (
    <div
      className={`bg-white rounded-2xl border p-4 ${
        isNext ? "border-teal-300 shadow-sm" : "border-slate-200"
      }`}
    >
      {isNext && (
        <div className="text-[10px] uppercase tracking-wide font-semibold text-teal-700 mb-2">
          Next appointment
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-slate-900">
            {appt.title || apptTypeLabel(appt.type)}
          </div>
          {appt.title && (
            <div className="text-[11px] text-slate-500">{apptTypeLabel(appt.type)}</div>
          )}
        </div>
        <div className="text-[10px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full flex-shrink-0">
          {daysLabel}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-3">
        <span className="text-[11.5px] text-slate-600 flex items-center gap-1">
          <Clock size={11} className="text-slate-400" />
          {dateStr} · {timeStr} · {appt.durationMinutes} min
        </span>
        {appt.location && (
          <span className="text-[11.5px] text-slate-600 flex items-center gap-1">
            <MapPin size={11} className="text-slate-400" />
            {appt.location}
          </span>
        )}
      </div>

      {appt.clinicianName && (
        <div className="mt-1.5 text-[11px] text-slate-500">
          With {appt.clinicianName}
        </div>
      )}

      {/* Only show prep instructions if NOT already in the banner (isNext + showPrepSignal handled above) */}
      {appt.preAppointmentInstructions && (
        <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-wide text-amber-700 font-semibold mb-1">
            Before your visit
          </div>
          <div className="text-[12px] text-amber-900 leading-snug whitespace-pre-wrap">
            {appt.preAppointmentInstructions}
          </div>
        </div>
      )}
    </div>
  );
}
