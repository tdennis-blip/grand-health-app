import Link from "next/link";
import { ChevronLeft, AlertCircle } from "lucide-react";
import { getAllInteractionRules } from "@/lib/medications-interactions";
import { InteractionLibraryEditor } from "./library-editor";

export const dynamic = "force-dynamic";

export default async function InteractionLibraryPage() {
  const rules = await getAllInteractionRules();

  return (
    <main className="max-w-3xl mx-auto px-6 py-6 space-y-5">
      <Link href="/clinician/dashboard" className="text-sm text-teal-700 inline-flex items-center gap-1">
        <ChevronLeft size={14} /> Dashboard
      </Link>

      <header>
        <div className="text-xs uppercase tracking-wide text-slate-500">Library</div>
        <div className="text-xl font-semibold text-slate-900 flex items-center gap-1.5">
          <AlertCircle size={18} className="text-rose-600" /> Medication interactions
        </div>
        <div className="text-[12px] text-slate-500 mt-1 leading-snug">
          Clinic-wide pairs we want flagged on patient stacks. Edit a rule by
          tapping it. Inactive rules don&apos;t fire.
        </div>
      </header>

      <InteractionLibraryEditor initial={rules} />
    </main>
  );
}
