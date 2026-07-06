"use client";

// Route-level error boundary for patient pages. Friendly recovery screen —
// never shows internal error details to patients.
import { useEffect } from "react";

export default function HomeError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("Patient page error", error.digest ?? error.message);
  }, [error]);

  return (
    <main className="max-w-md mx-auto px-4 py-16 text-center">
      <h1 className="text-lg font-semibold text-slate-800">Something went wrong</h1>
      <p className="mt-2 text-sm text-slate-600">
        We hit a snag loading this page. Your data is safe — give it another try.
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
          href="/home"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Go home
        </a>
      </div>
    </main>
  );
}
