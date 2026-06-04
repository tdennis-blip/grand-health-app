"use client";

import { useTransition } from "react";
import { disconnectWearable } from "./actions";
import type { WearableProvider } from "@/lib/wearables/types";

export function DisconnectButton({
  provider,
  label,
}: {
  provider: WearableProvider;
  label: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      onClick={() => {
        if (!confirm(`Disconnect ${label}? Future syncs will stop.`)) return;
        startTransition(() => {
          void disconnectWearable({ provider });
        });
      }}
      disabled={pending}
      className="text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-lg disabled:opacity-50"
    >
      {pending ? "Disconnecting…" : "Disconnect"}
    </button>
  );
}
