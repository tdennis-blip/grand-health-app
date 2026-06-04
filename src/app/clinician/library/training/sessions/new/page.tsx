import Link from "next/link";
import { NewSessionForm } from "./new-session-form";

export default function NewSessionPage() {
  return (
    <main className="max-w-xl mx-auto px-6 py-6 space-y-5">
      <Link
        href="/clinician/library/training/sessions"
        className="text-sm text-teal-700 hover:text-teal-800 inline-flex items-center gap-1"
      >
        &larr; Back to sessions
      </Link>
      <header>
        <div className="text-xs uppercase tracking-wide text-slate-500">New session</div>
        <div className="text-xl font-semibold text-slate-900">Pick a kind</div>
        <div className="text-xs text-slate-500 mt-1">
          Each kind has its own editor — strength &amp; mobility hold exercises with sets, cardio holds a protocol.
        </div>
      </header>
      <NewSessionForm />
    </main>
  );
}
