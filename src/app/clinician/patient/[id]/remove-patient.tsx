"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, UserX, UserCheck } from "lucide-react";
import { deletePatientAccount, setPatientActive } from "@/app/clinician/dashboard/actions";

// Patient offboarding. Deactivate (reversible, record retained) is the
// primary path; permanent delete is admin-only and kept as a last resort
// (test accounts, verified patient erasure requests). Both actions are
// enforced server-side — the isAdmin prop only controls what's rendered.
export function RemovePatientButton({
  patientId,
  patientName,
  isAdmin,
  isActive,
}: {
  patientId: string;
  patientName: string;
  isAdmin: boolean;
  isActive: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<null | "deactivate" | "delete">(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!isAdmin) return null;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, afterOk?: () => void) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        afterOk?.();
        router.refresh();
        setConfirming(null);
      } else {
        setError(res.error ?? "Something went wrong.");
        setConfirming(null);
      }
    });
  };

  return (
    <section className="bg-white rounded-2xl border border-rose-200 p-5">
      <div className="text-sm font-semibold text-rose-700">Danger zone</div>
      <div className="text-[12px] text-slate-500 mt-1 leading-snug">
        Deactivating blocks the patient&apos;s login but keeps their full record
        (required for record retention). Permanent deletion erases everything and
        cannot be undone — use it only for test accounts or a verified deletion request.
      </div>

      {error && (
        <div className="text-[12px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2 mt-3">{error}</div>
      )}

      {confirming === null && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {isActive ? (
            <button
              onClick={() => setConfirming("deactivate")}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-3.5 py-2 rounded-lg hover:bg-amber-100"
            >
              <UserX size={14} /> Deactivate patient
            </button>
          ) : (
            <button
              onClick={() => run(() => setPatientActive({ patientId, active: true }))}
              disabled={pending}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3.5 py-2 rounded-lg hover:bg-emerald-100 disabled:opacity-60"
            >
              <UserCheck size={14} /> {pending ? "Reactivating…" : "Reactivate patient"}
            </button>
          )}
          <button
            onClick={() => setConfirming("delete")}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-3.5 py-2 rounded-lg hover:bg-rose-100"
          >
            <Trash2 size={14} /> Delete permanently
          </button>
        </div>
      )}

      {confirming === "deactivate" && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[12px] text-slate-700">Block {patientName}&apos;s login? Their record is kept and this is reversible.</span>
          <button
            onClick={() => run(() => setPatientActive({ patientId, active: false }))}
            disabled={pending}
            className="text-sm font-semibold text-white bg-amber-600 px-3.5 py-2 rounded-lg hover:bg-amber-700 disabled:opacity-60"
          >
            {pending ? "Deactivating…" : "Yes, deactivate"}
          </button>
          <button onClick={() => setConfirming(null)} disabled={pending} className="text-sm text-slate-600 px-3 py-2 rounded-lg hover:bg-slate-50">
            Cancel
          </button>
        </div>
      )}

      {confirming === "delete" && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[12px] text-slate-700">Permanently erase {patientName} and ALL their data?</span>
          <button
            onClick={() =>
              run(
                () => deletePatientAccount({ patientId }),
                () => router.push("/clinician/dashboard")
              )
            }
            disabled={pending}
            className="text-sm font-semibold text-white bg-rose-600 px-3.5 py-2 rounded-lg hover:bg-rose-700 disabled:opacity-60"
          >
            {pending ? "Deleting…" : "Yes, delete permanently"}
          </button>
          <button onClick={() => setConfirming(null)} disabled={pending} className="text-sm text-slate-600 px-3 py-2 rounded-lg hover:bg-slate-50">
            Cancel
          </button>
        </div>
      )}
    </section>
  );
}
