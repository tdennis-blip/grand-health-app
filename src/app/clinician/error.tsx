"use client";

// Route-level error boundary for clinician pages. Catches uncaught server/
// client errors so users see a friendly recovery screen instead of the
// Next.js default crash page. Never render error internals (may leak
// query/PHI details) — log digest to console for debugging instead.
import { useEffect } from "react";

export default function ClinicianError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("Clinician page error", error.digest ?? error.message);
  }, [error]);

  return (
    <main className="max-w-3xl mx-auto px-6 py-16 text-center">
      <h1 className="text-lg font-semibold text-slate-800">Something went wrong</h1>
      <p className="mt-2 text-sm text-slate-600">
        The page hit an unexpected error. Your data is safe — try again, or head back to the dashboard.
      </p>
      {error.digest ? (
        <p className="mt-1 text-xs text-slate-400">Reference: {error.digest}</p>
      ) : null}
      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          onClick={reset}
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
        >
          Try again
        </button>
        <a
          href="/clinician/dashboard"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Back to dashboard
        </a>
      </div>
    </main>
  );
}
