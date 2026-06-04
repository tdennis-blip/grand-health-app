"use client";

import { useTransition } from "react";
import { togglePillarHidden } from "./actions";

export function PillarVisibilityToggle({
  pillarId,
  patientId,
  hidden,
}: {
  pillarId: string;
  patientId: string;
  hidden: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const enabled = !hidden;
  return (
    <button
      type="button"
      onClick={(e) => {
        // Stop the parent <Link> from navigating when the toggle is clicked.
        e.preventDefault();
        e.stopPropagation();
        if (pending) return;
        startTransition(() => togglePillarHidden({ pillarId, patientId, hidden: !hidden }));
      }}
      disabled={pending}
      aria-pressed={enabled}
      title={enabled ? "Visible to patient — click to hide" : "Hidden from patient — click to show"}
      className={`relative w-9 h-5 rounded-full transition flex-shrink-0 ${
        enabled ? "bg-teal-600" : "bg-slate-300"
      } ${pending ? "opacity-60" : ""}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${
          enabled ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}
