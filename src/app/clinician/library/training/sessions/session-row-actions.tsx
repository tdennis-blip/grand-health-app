"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteSession } from "./actions";

export function SessionRowActions({ sessionId, sessionName }: { sessionId: string; sessionName: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      <Link
        href={`/clinician/library/training/sessions/${sessionId}`}
        className="text-[11px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-lg"
      >
        Edit
      </Link>
      <button
        onClick={() => {
          if (!confirm(`Delete "${sessionName}"?`)) return;
          startTransition(() => deleteSession(sessionId));
        }}
        disabled={pending}
        className="text-[11px] font-semibold text-rose-600 bg-white border border-rose-200 px-2.5 py-1 rounded-lg"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}
