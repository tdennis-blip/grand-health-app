"use client";

import { useState, useTransition } from "react";
import { CalendarCheck } from "lucide-react";
import { setActivityPlanning } from "./activity-intent-actions";

// Patient opt-in for intent-based diet planning. When on, the daily calorie
// goal adjusts for the workouts the patient says they'll do that day.
export function ActivityPlanningToggle({ enabled }: { enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    const next = !on;
    setOn(next);
    startTransition(() => setActivityPlanning({ enabled: next }));
  };

  return (
    <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-200 px-4 py-3">
      <div className="flex items-center gap-2 min-w-0">
        <CalendarCheck size={16} className="text-teal-600 flex-shrink-0" />
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-slate-900">Plan by today&apos;s workouts</div>
          <div className="text-[11px] text-slate-500 leading-snug">
            Adjust your calorie goal for the activity you plan to do each day.
          </div>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={toggle}
        disabled={pending}
        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${on ? "bg-teal-600" : "bg-slate-300"}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${on ? "translate-x-5" : ""}`} />
      </button>
    </div>
  );
}
