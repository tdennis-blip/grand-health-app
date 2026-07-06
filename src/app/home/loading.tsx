// Route-level loading UI for all patient pages. Shown instantly on
// navigation while the server component streams in.
export default function HomeLoading() {
  return (
    <main className="max-w-md mx-auto px-4 py-8" aria-busy="true" aria-live="polite">
      <div className="flex items-center gap-3 text-slate-500">
        <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-teal-600" />
        <span className="text-sm">Loading&hellip;</span>
      </div>
      <div className="mt-6 space-y-3">
        <div className="h-28 animate-pulse rounded-2xl bg-slate-200" />
        <div className="h-28 animate-pulse rounded-2xl bg-slate-200" />
        <div className="h-28 animate-pulse rounded-2xl bg-slate-200" />
      </div>
    </main>
  );
}
