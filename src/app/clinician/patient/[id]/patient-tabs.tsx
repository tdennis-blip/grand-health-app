"use client";

import { useState, type ReactNode } from "react";

export type PatientTab = { id: string; label: string; content: ReactNode };

// Simple client-side tab switcher. Tab contents are server-rendered and passed
// in as ReactNode, so all data fetching still happens on the server.
export function PatientTabs({ tabs }: { tabs: PatientTab[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div className="space-y-5">
      <div className="flex gap-1 overflow-x-auto -mx-1 px-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={`whitespace-nowrap text-sm font-semibold px-3 py-2 border-b-2 -mb-px transition-colors ${
              t.id === current?.id
                ? "border-teal-600 text-teal-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="space-y-5">{current?.content}</div>
    </div>
  );
}
