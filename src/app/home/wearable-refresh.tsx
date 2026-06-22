"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Fires a single background wearable sync when the app is opened. The server
// endpoint rate-limits per connection (30 min), so this is a no-op cost most of
// the time. On a successful sync it refreshes the route so freshly pulled
// metrics show without a manual reload. Renders nothing.
export function WearableRefresh() {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // once per app open (mount)
    ran.current = true;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/wearables/refresh", { method: "POST" });
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (!cancelled && data?.synced > 0) router.refresh();
      } catch {
        // Best-effort; ignore failures so app open is never blocked.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}
