import Link from "next/link";
import { requireClinician } from "@/lib/auth/server";
import { isAdminClinician } from "@/lib/care-team";
import { withAuth } from "@/lib/db/connection";
import { getMyUnreadCount } from "@/lib/messages";
import { SignOutButton } from "@/components/sign-out-button";

export default async function ClinicianLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // requireClinician() enforces the TOTP MFA gate itself now (redirects
  // un-enrolled clinicians to /mfa-setup), so no separate check here.
  const user = await requireClinician();

  const [profile] = await withAuth(user, (sql) =>
    sql`
      SELECT p.first_name, p.last_name, cp.role_label
      FROM profiles p
      LEFT JOIN clinician_profiles cp ON cp.profile_id = p.id
      WHERE p.id = ${user.id}
      LIMIT 1
    `
  );

  const roleLabel = profile?.role_label ?? null;

  const [unread, isAdmin] = await Promise.all([
    getMyUnreadCount(),
    isAdminClinician(user.id),
  ]);

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between gap-6">
          <Link href="/clinician/dashboard" className="flex items-center gap-2 flex-shrink-0">
            <div className="w-8 h-8 rounded-lg bg-teal-700 text-white font-bold flex items-center justify-center">G</div>
            <div>
              <div className="text-sm font-semibold text-slate-900 leading-none">Grand Health</div>
              <div className="text-[11px] text-slate-500 leading-tight mt-0.5">Clinician portal</div>
            </div>
          </Link>
          <nav className="flex items-center gap-5 text-sm flex-1">
            <Link href="/clinician/dashboard" className="text-slate-700 hover:text-slate-900 font-medium">
              Patients
            </Link>
            <Link href="/clinician/library/risks" className="text-slate-700 hover:text-slate-900 font-medium">
              Risk library
            </Link>
            <Link href="/clinician/library/training" className="text-slate-700 hover:text-slate-900 font-medium">
              Training
            </Link>
            <Link href="/clinician/library/grand100" className="text-slate-700 hover:text-slate-900 font-medium">
              Grand 100
            </Link>
            <Link href="/clinician/library/interactions" className="text-slate-700 hover:text-slate-900 font-medium">
              Interactions
            </Link>
            <Link href="/clinician/refills" className="text-slate-700 hover:text-slate-900 font-medium">
              Refills
            </Link>
            {isAdmin && (
              <Link href="/clinician/audit" className="text-slate-700 hover:text-slate-900 font-medium">
                Audit log
              </Link>
            )}
            <Link href="/clinician/settings/appointment-types" className="text-slate-700 hover:text-slate-900 font-medium">
              Settings
            </Link>
            <Link href="/clinician/settings/team" className="text-slate-700 hover:text-slate-900 font-medium">
              Team
            </Link>
            <Link href="/clinician/messages" className="text-slate-700 hover:text-slate-900 font-medium flex items-center gap-1.5">
              Messages
              {unread > 0 && (
                <span className="text-[10px] font-semibold text-white bg-rose-600 px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                  {unread}
                </span>
              )}
            </Link>
          </nav>
          <div className="flex items-center gap-3 text-sm flex-shrink-0">
            <Link href="/clinician/settings/profile" className="text-slate-600 hidden sm:block text-right leading-tight hover:text-slate-900" title="My profile">
              <div>{profile.first_name} {profile.last_name}</div>
              {roleLabel && <div className="text-[11px] text-slate-400">{roleLabel}</div>}
            </Link>
            <SignOutButton className="text-xs font-semibold text-slate-700 bg-white border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50" />
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
