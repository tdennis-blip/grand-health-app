import Link from "next/link";
import { NewProgramForm } from "./new-program-form";

export default function NewProgramPage() {
  return (
    <main className="max-w-xl mx-auto px-6 py-6 space-y-5">
      <Link
        href="/clinician/library/training/programs"
        className="text-sm text-teal-700 hover:text-teal-800 inline-flex items-center gap-1"
      >
        &larr; Back to programs
      </Link>
      <header>
        <div className="text-xs uppercase tracking-wide text-slate-500">New program</div>
        <div className="text-xl font-semibold text-slate-900">Name your program</div>
        <div className="text-xs text-slate-500 mt-1">
          You&apos;ll build the Mon-Sun schedule on the next screen.
        </div>
      </header>
      <NewProgramForm />
    </main>
  );
}
