import Link from "next/link";
import { Settings, ChevronLeft } from "lucide-react";
import { getAllClinicAppointmentTypes } from "@/lib/appointments";
import { AppointmentTypeManager } from "./type-manager";
import { APPT_TYPES } from "@/lib/appointments-utils";

export default async function AppointmentTypesPage() {
  const types = await getAllClinicAppointmentTypes();

  return (
    <main className="max-w-2xl mx-auto px-6 py-6 space-y-5">
      <Link href="/clinician/dashboard" className="text-sm text-teal-700">
        &larr; Back to panel
      </Link>

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center">
          <Settings size={20} />
        </div>
        <div>
          <div className="text-xl font-semibold text-slate-900">Appointment types</div>
          <div className="text-xs text-slate-500">
            Custom visit types for your clinic. These appear in the appointment form when scheduling.
          </div>
        </div>
      </div>

      {/* Built-in defaults callout */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
        <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-2">
          Built-in defaults (always available)
        </div>
        <div className="flex flex-wrap gap-1.5">
          {APPT_TYPES.map((t) => (
            <span
              key={t.value}
              className="text-[11px] text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-full"
            >
              {t.label}
            </span>
          ))}
        </div>
        <div className="text-[11px] text-slate-500 mt-2 leading-snug">
          Built-ins are always shown in the dropdown. Your custom types appear above them when active.
        </div>
      </div>

      {/* Custom types manager */}
      <div>
        <div className="text-sm font-semibold text-slate-900 mb-3">Your custom types</div>
        <AppointmentTypeManager initial={types} />
      </div>
    </main>
  );
}
