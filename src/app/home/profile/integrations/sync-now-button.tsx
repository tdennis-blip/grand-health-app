"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

// Forces an immediate wearable re-pull (bypassing the on-open throttle), then
// refreshes the page so newly synced data shows.
export function SyncNowButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  const sync = () => {
    setDone(false);
    startTransition(async () => {
      try {
        await fetch("/api/wearables/refresh?force=1", { method: "POST" });
      } catch {
        /* best-effort */
      }
      setDone(true);
      router.refresh();
    });
  };

  return (
    <button
      onClick={sync}
      disabled={pending}
      className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-lg px-3 py-1.5 hover:bg-teal-100 disabled:opacity-60"
    >
      <RefreshCw size={13} className={pending ? "animate-spin" : ""} />
      {pending ? "Syncing…" : done ? "Synced" : "Sync now"}
    </button>
  );
}
