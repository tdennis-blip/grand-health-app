// Clinician dashboard — pulls patient roster from Postgres, gated by RLS.
// The Drizzle query goes through the pooled connection and reads the JWT,
// so we only see patients in the clinician's clinic.
import Link from "next/link";
import { requireClinician } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { AddUserButton } from "./add-user";

type RosterRow = {
  profile_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  member_since: string;
};

export default async function ClinicianDashboard() {
  const user = await requireClinician();

  const rosterRaw = await withAuth(user, (sql) =>
    sql`
      SELECT pp.profile_id, pp.member_since, p.email, p.first_name, p.last_name
      FROM patient_profiles pp
      JOIN profiles p ON p.id = pp.profile_id
      ORDER BY pp.member_since DESC
    `
  );

  const rows: RosterRow[] = rosterRaw.map((r: any) => ({
    profile_id: r.profile_id,
    email: r.email ?? "",
    first_name: r.first_name ?? null,
    last_name: r.last_name ?? null,
    member_since: r.member_since,
  }));
  const error = null as { message: string } | null;

  return (
    <main className="max-w-6xl mx-auto px-6 py-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">My panel</div>
          <div className="text-xl font-semibold text-slate-900">
            Patients ({rows.length})
          </div>
        </div>
        <AddUserButton />
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-xl p-3">
          Couldn&apos;t load patients: {error.message}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-10 text-center">
          <div className="text-sm font-semibold text-slate-900">No patients yet</div>
          <div className="text-xs text-slate-500 mt-1">
            Use &ldquo;Add patient&rdquo; above to create an account — they&apos;ll get a
            temporary password by email to finish signing in.
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
          {rows.map((p) => {
            const initials = [(p.first_name || p.email)[0], p.last_name?.[0]]
              .filter(Boolean)
              .join("")
              .toUpperCase();
            return (
              <Link
                key={p.profile_id}
                href={`/clinician/patient/${p.profile_id}`}
                className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition"
              >
                <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-600 font-semibold text-xs flex items-center justify-center">
                  {initials || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate">
                    {p.first_name} {p.last_name}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">{p.email}</div>
                </div>
                <div className="text-[11px] text-slate-500">
                  Member since {new Date(p.member_since).toLocaleDateString()}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
