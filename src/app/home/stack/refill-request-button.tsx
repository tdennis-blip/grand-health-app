"use client";

import { useState, useTransition } from "react";
import { MessageSquare, Check } from "lucide-react";
import { requestRefill } from "./refill-request-actions";

export function RefillRequestButton({
  medicationId,
  medicationName,
  variant,
}: {
  medicationId: string;
  medicationName: string;
  variant: "low" | "out";
}) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (done) {
    return (
      <span className="text-[11px] font-semibold text-emerald-700 inline-flex items-center gap-1">
        <Check size={11} /> Requested
      </span>
    );
  }

  const tone =
    variant === "out"
      ? "bg-rose-600 hover:bg-rose-700"
      : "bg-amber-500 hover:bg-amber-600";

  return (
    <button
      onClick={() => {
        if (pending) return;
        if (!confirm(`Ask your care team to refill ${medicationName}?`)) return;
        setErr(null);
        startTransition(async () => {
          try {
            await requestRefill({ medicationId });
            setDone(true);
          } catch (e: any) {
            setErr(e?.message ?? "Failed");
          }
        });
      }}
      className={`text-[11px] font-semibold text-white ${tone} px-2 py-1 rounded-md inline-flex items-center gap-1 disabled:opacity-60`}
      disabled={pending}
      title={err ?? `Request a refill for ${medicationName}`}
    >
      <MessageSquare size={11} /> {pending ? "Sending…" : "Request refill"}
    </button>
  );
}
