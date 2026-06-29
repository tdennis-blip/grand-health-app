import Link from "next/link";
import { User, Plug, ChevronRight } from "lucide-react";
import { requirePatient } from "@/lib/auth/server";
import { withAuth, serviceRoleSql } from "@/lib/db/connection";
import { ProfileEditor, type ProfileInitial } from "./profile-editor";
import { SignOutButton } from "@/components/sign-out-button";

export default async function PatientProfile() {
  const user = await requirePatient();

  const [[profile], [patient], team] = await Promise.all([
    withAuth(user, (sql) =>
      sql`SELECT first_name, last_name, email FROM profiles WHERE id = ${user.id} LIMIT 1`
    ),
    withAuth(user, (sql) =>
      sql`
        SELECT pp.date_of_birth, pp.sex, pp.height_cm, pp.weight_kg, pp.member_since, pp.dietary_preferences,
               pp.primary_clinician_id
        FROM patient_profiles pp
        WHERE pp.profile_id = ${user.id}
        LIMIT 1
      `
    ),
    // Care team = everyone on the patient's clinic. Service-role read scoped
    // to the patient's own clinic (safe to show the roster + roles).
    serviceRoleSql<
      { profile_id: string; first_name: string | null; last_name: string | null; professional_role: string | null; role_label: string | null; title: string | null; credentials: string | null }[]
    >`
      SELECT cp.profile_id, p.first_name, p.last_name,
             cp.professional_role, cp.role_label, cp.title, cp.credentials
      FROM public.clinician_profiles cp
      JOIN public.profiles p ON p.id = cp.profile_id
      WHERE cp.clinic_id = ${user.clinicId}
      ORDER BY p.last_name NULLS LAST, p.first_name NULLS LAST
    `,
  ]);

  const roleFor = (m: { professional_role: string | null; role_label: string | null; title: string | null }) =>
    m.professional_role || m.role_label || m.title || null;
  const teamInitials = (m: { first_name: string | null; last_name: string | null }) =>
    [(m.first_name || "?")[0], m.last_name?.[0]].filter(Boolean).join("").toUpperCase();

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

      {team.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-3">Your team</div>
          <div className="space-y-3">
            {team.map((m) => {
              const role = roleFor(m);
              const isPrimary = m.profile_id === patient?.primary_clinician_id;
              return (
                <div key={m.profile_id} className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-500 to-slate-600 text-white text-[12px] font-semibold flex items-center justify-center flex-shrink-0">
                    {teamInitials(m)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">
                      {m.first_name} {m.last_name}
                      {m.credentials && <span className="text-slate-400 font-normal">, {m.credentials}</span>}
                      {isPrimary && (
                        <span className="ml-2 text-[9.5px] uppercase tracking-wide font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-full px-1.5 py-0.5 align-middle">
                          Your clinician
                        </span>
                      )}
                    </div>
                    {role && <div className="text-[11px] text-slate-500 truncate">{role}</div>}
                  </div>
                </div>
              );
            })}
          </div>
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

      <SignOutButton className="w-full text-sm font-semibold text-slate-700 bg-white border border-slate-200 px-4 py-2.5 rounded-lg hover:bg-slate-50" />
    </div>
  );
}
