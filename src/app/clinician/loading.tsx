// Route-level loading UI for all clinician pages. Next.js shows this
// instantly on navigation while the server component streams in.
export default function ClinicianLoading() {
  return (
    <main className="max-w-6xl mx-auto px-6 py-10" aria-busy="true" aria-live="polite">
      <div className="flex items-center gap-3 text-slate-500">
        <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-teal-600" />
        <span className="text-sm">Loading&hellip;</span>
      </div>
      <div className="mt-6 space-y-3">
        <div className="h-8 w-1/3 animate-pulse rounded bg-slate-200" />
        <div className="h-24 animate-pulse rounded-xl bg-slate-200" />
        <div className="h-24 animate-pulse rounded-xl bg-slate-200" />
      </div>
    </main>
  );
}
