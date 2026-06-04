import Link from "next/link";
import { ChevronLeft, History as HistoryIcon } from "lucide-react";
import { requireClinician } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import {
  getMedicationHistoryFor,
  diffFor,
  fieldLabel,
  type MedicationChange,
} from "@/lib/medications-history";

export const dynamic = "force-dynamic";

export default async function MedHistoryPage({
  params,
}: {
  params: Promise<{ id: string; medicationId: string }>;
}) {
  const { id, medicationId } = await params;

  const user = await requireClinician();
  const [[patientRow], [med], history] = await Promise.all([
    withAuth(user, (sql) =>
      sql`SELECT p.first_name, p.last_name FROM patient_profiles pp JOIN profiles p ON p.id = pp.profile_id WHERE pp.profile_id = ${id} LIMIT 1`
    ),
    withAuth(user, (sql) =>
      sql`SELECT id, name, dose, kind FROM medications WHERE id = ${medicationId} LIMIT 1`
    ),
    getMedicationHistoryFor(id, medicationId, 200, user),
  ]);

  const p = patientRow;
  const fallbackName = history[0]?.medicationName ?? "(deleted medication)";

  return (
    <main className="max-w-3xl mx-auto px-6 py-6 space-y-5">
      <Link
        href={`/clinician/patient/${id}/stack/history`}
        className="text-sm text-teal-700 inline-flex items-center gap-1"
      >
        <ChevronLeft size={14} /> All history
      </Link>

      <header>
        <div className="text-xs uppercase tracking-wide text-slate-500">
          {p?.first_name} {p?.last_name}
        </div>
        <div className="text-xl font-semibold text-slate-900 flex items-center gap-1.5">
          <HistoryIcon size={18} className="text-slate-600" />
          {med?.name ?? fallbackName}
          {med?.dose && <span className="text-slate-400 font-normal text-base"> · {med.dose}</span>}
        </div>
        <div className="text-[12px] text-slate-500 mt-1">
          {history.length === 0
            ? "No changes recorded."
            : `${history.length} event${history.length === 1 ? "" : "s"} · newest first`}
        </div>
      </header>

      {history.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-6 text-center text-[12px] text-slate-500">
          No changes on file for this medication.
        </div>
      ) : (
        <ol className="space-y-3">
          {history.map((c) => (
            <ChangeRow key={c.id} change={c} />
          ))}
        </ol>
      )}
    </main>
  );
}

// Identical visual to the patient-wide history rows. Duplicated rather
// than extracted into a shared component because the wrapping page-level
// context differs and the markup is small.
function ChangeRow({ change }: { change: MedicationChange }) {
  const when = new Date(change.createdAt).toLocaleString();
  const diff = diffFor(change);
  return (
    <li className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[11px] text-slate-500">
          {when}
          {change.actorName && ` · ${change.actorName}`}
          {change.actorRole && <span className="text-slate-400"> ({change.actorRole})</span>}
        </div>
        <ChangeBadge type={change.changeType} />
      </div>

      {change.changeType === "create" && change.after && (
        <div className="text-[12px] text-slate-600 mt-2">
          Added {change.after.kind ?? "medication"}
          {change.after.dose && <> at <span className="font-medium">{change.after.dose}</span></>}.
        </div>
      )}

      {change.changeType === "delete" && (
        <div className="text-[12px] text-slate-600 mt-2">Removed from stack.</div>
      )}

      {change.changeType === "refill" && change.after && change.before && (
        <div className="text-[12px] text-slate-600 mt-2">
          Refilled to <span className="font-medium">{Number(change.after.quantity_on_hand)}</span> on hand
          {change.before.quantity_on_hand != null && (
            <> (from {Number(change.before.quantity_on_hand)})</>
          )}.
        </div>
      )}

      {(change.changeType === "update" || (change.changeType === "refill" && diff.length > 1)) && diff.length > 0 && (
        <ul className="mt-2 space-y-1 text-[12px]">
          {diff.map((d) => (
            <li key={d.field} className="text-slate-700">
              <span className="text-slate-500">{fieldLabel(d.field)}:</span>{" "}
              <DiffValue v={d.before} />
              <span className="text-slate-400"> → </span>
              <DiffValue v={d.after} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function DiffValue({ v }: { v: any }) {
  if (v == null || v === "") return <span className="text-slate-400 italic">empty</span>;
  if (typeof v === "boolean") return <span>{v ? "yes" : "no"}</span>;
  return <span className="font-medium">{String(v)}</span>;
}

function ChangeBadge({ type }: { type: MedicationChange["changeType"] }) {
  const tone: Record<MedicationChange["changeType"], string> = {
    create: "bg-emerald-50 text-emerald-700 border-emerald-200",
    update: "bg-sky-50 text-sky-700 border-sky-200",
    delete: "bg-rose-50 text-rose-700 border-rose-200",
    refill: "bg-violet-50 text-violet-700 border-violet-200",
  };
  return (
    <span
      className={`text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full border ${tone[type]}`}
    >
      {type}
    </span>
  );
}
