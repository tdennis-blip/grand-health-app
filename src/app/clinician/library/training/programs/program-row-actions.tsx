"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteProgram } from "./actions";

export function ProgramRowActions({ programId, programName }: { programId: string; programName: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
      <Link
        href={`/clinician/library/training/programs/${programId}`}
        className="text-[11px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-lg"
      >
        Edit
      </Link>
      <button
        onClick={() => {
          if (!confirm(`Delete "${programName}"?`)) return;
          startTransition(() => deleteProgram(programId));
        }}
        disabled={pending}
        className="text-[11px] font-semibold text-rose-600 bg-white border border-rose-200 px-2.5 py-1 rounded-lg"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}
