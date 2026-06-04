import Link from "next/link";
import { User, Plug, ChevronRight } from "lucide-react";
import { requirePatient } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { signOut } from "@/app/auth/actions";
import { ProfileEditor, type ProfileInitial } from "./profile-editor";

export default async function PatientProfile() {
  const user = await requirePatient();

  const [[profile], [patient]] = await Promise.all([
    withAuth(user, (sql) =>
      sql`SELECT first_name, last_name, email FROM profiles WHERE id = ${user.id} LIMIT 1`
    ),
    withAuth(user, (sql) =>
      sql`
        SELECT pp.date_of_birth, pp.sex, pp.height_cm, pp.weight_kg, pp.member_since, pp.dietary_preferences,
               cp.first_name AS clin_first, cp.last_name AS clin_last, ccp.role_label AS clin_role_label
        FROM patient_profiles pp
        LEFT JOIN profiles cp ON cp.id = pp.primary_clinician_id
        LEFT JOIN clinician_profiles ccp ON ccp.profile_id = pp.primary_clinician_id
        WHERE pp.profile_id = ${user.id}
        LIMIT 1
      `
    ),
  ]);

  const initials = [(profile?.first_name || profile?.email || "?")[0], profile?.last_name?.[0]]
    .filter(Boolean)
    .join("")
    .toUpperCase();

  const initial: ProfileInitial = {
    firstName: profile?.first_name ?? "",
    lastName: profile?.last_name ?? "",
    email: profile?.email ?? "",
    dob: patient?.date_of_birth ?? null,
    sex: (patient?.sex as ProfileInitial["sex"]) ?? null,
    heightCm: patient?.height_cm ?? null,
    weightKg: patient?.weight_kg ?? null,
    dietaryPreferences: patient?.dietary_preferences ?? null,
  };

  return (
    <div className="p-5 space-y-4">
      <div>
        <div className="text-xs uppercase tracking-wide text-slate-500">Account</div>
        <div className="text-xl font-semibold text-slate-900 flex items-center gap-1.5">
          <User size={18} className="text-slate-600" /> Me
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-3">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-teal-600 to-emerald-500 text-white font-semibold flex items-center justify-center text-base flex-shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-base font-semibold text-slate-900 truncate">
            {profile?.first_name} {profile?.last_name}
          </div>
          <div className="text-[12px] text-slate-500 truncate">{profile?.email}</div>
          {patient?.member_since && (
            <div className="text-[11px] text-slate-400 mt-0.5">
              Member since {new Date(patient.member_since).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
            </div>
          )}
        </div>
      </div>

      <ProfileEditor initial={initial} />

      {patient?.clin_first && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Your clinician</div>
          <div className="text-sm font-semibold text-slate-900 mt-1">{patient.clin_first} {patient.clin_last}</div>
          {patient?.clin_role_label && (
            <div className="text-[11px] text-slate-500 mt-0.5">{patient.clin_role_label}</div>
          )}
        </div>
      )}

      <Link
        href="/home/profile/integrations"
        className="block bg-white rounded-2xl border border-slate-200 p-4 hover:border-teal-300 transition"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center flex-shrink-0">
            <Plug size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-slate-900">Wearables &amp; integrations</div>
            <div className="text-[11px] text-slate-500 leading-snug">Connect Oura, Whoop, and more.</div>
          </div>
          <ChevronRight size={16} className="text-slate-400 flex-shrink-0" />
        </div>
      </Link>

      <form action={signOut}>
        <button
          type="submit"
          className="w-full text-sm font-semibold text-slate-700 bg-white border border-slate-200 px-4 py-2.5 rounded-lg hover:bg-slate-50"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
