"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { DayEntry, QuickFood } from "@/lib/diet";
import { setDietViewMode } from "./view-actions";
import { FoodLogger } from "./food-logger";

type Mode = "tracking" | "targets";

// Segmented toggle the patient uses to switch between full tracking and the
// calm "Targets only" view.
export function DietModeToggle({ current }: { current: Mode }) {
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState<Mode>(current);

  const choose = (mode: Mode) => {
    if (mode === optimistic || pending) return;
    setOptimistic(mode);
    startTransition(async () => {
      try {
        await setDietViewMode({ mode });
      } catch {
        setOptimistic(current); // revert on failure
      }
    });
  };

  return (
    <div className="inline-flex rounded-full bg-slate-100 p-0.5 text-[11px] font-semibold">
      <button
        type="button"
        onClick={() => choose("tracking")}
        className={`px-3 py-1 rounded-full transition ${
          optimistic === "tracking" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
        }`}
      >
        Tracking
      </button>
      <button
        type="button"
        onClick={() => choose("targets")}
        className={`px-3 py-1 rounded-full transition ${
          optimistic === "targets" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
        }`}
      >
        Targets only
      </button>
    </div>
  );
}

// In Targets-only mode the logger is hidden behind a small link so a patient
// can still log a food occasionally without the screen pushing them to.
export function CollapsibleLogger({
  logDate,
  entries,
  favorites,
  recents,
}: {
  logDate: string;
  entries: DayEntry[];
  favorites: QuickFood[];
  recents: QuickFood[];
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-1.5 text-[12px] text-teal-700 font-medium bg-white border border-slate-200 rounded-2xl px-4 py-3 hover:bg-slate-50"
      >
        <ChevronDown size={14} /> Log a food {entries.length > 0 && `(${entries.length} today)`}
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="w-full flex items-center justify-center gap-1.5 text-[12px] text-slate-500 font-medium hover:text-slate-700"
      >
        <ChevronUp size={14} /> Hide logging
      </button>
      <FoodLogger logDate={logDate} entries={entries} favorites={favorites} recents={recents} />
    </div>
  );
}
