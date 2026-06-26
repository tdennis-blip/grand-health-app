"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deletePatientAccount } from "@/app/clinician/dashboard/actions";

// Permanently removes a patient (login + all their data). Two-step confirm.
export function RemovePatientButton({ patientId, patientName }: { patientId: string; patientName: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const remove = () => {
    setError(null);
    startTransition(async () => {
      const res = await deletePatientAccount({ patientId });
      if (res.ok) {
        router.push("/clinician/dashboard");
        router.refresh();
      } else {
        setError(res.error ?? "Couldn't remove patient.");
        setConfirming(false);
      }
    });
  };

  return (
    <section className="bg-white rounded-2xl border border-rose-200 p-5">
      <div className="text-sm font-semibold text-rose-700">Danger zone</div>
      <div className="text-[12px] text-slate-500 mt-1 leading-snug">
        Permanently delete this patient&apos;s login and all of their data (training, diet, sleep,
        stack, messages, logs). This cannot be undone.
      </div>

      {error && (
        <div className="text-[12px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2 mt-3">{error}</div>
      )}

      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-3.5 py-2 rounded-lg hover:bg-rose-100"
        >
          <Trash2 size={14} /> Remove patient
        </button>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[12px] text-slate-700">Permanently remove {patientName}?</span>
          <button
            onClick={remove}
            disabled={pending}
            className="text-sm font-semibold text-white bg-rose-600 px-3.5 py-2 rounded-lg hover:bg-rose-700 disabled:opacity-60"
          >
            {pending ? "Removing…" : "Yes, remove"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={pending}
            className="text-sm text-slate-600 px-3 py-2 rounded-lg hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      )}
    </section>
  );
}
