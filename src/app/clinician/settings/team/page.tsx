// Team settings: list clinic staff, manage the admin flag.
// Admins see Make/Remove admin buttons; non-admins get a read-only roster.
// Admin = sees ALL patients in the clinic (vs only assigned/care-team ones).
import { requireClinician } from "@/lib/auth/server";
import { getClinicStaff, isAdminClinician } from "@/lib/care-team";
import { recordAudit } from "@/lib/audit";
import { TeamManager } from "./team-manager";

export const dynamic = "force-dynamic";

export default async function TeamSettingsPage() {
  const user = await requireClinician();
  const [staff, iAmAdmin] = await Promise.all([
    getClinicStaff(user.clinicId),
    isAdminClinician(user.id),
  ]);

  // Read audit: staff roster with emails/roles viewed.
  recordAudit({ action: "read", entityType: "clinic_staff_roster" }).catch(() => {});

  return (
    <main className="max-w-3xl mx-auto px-6 py-8">
      <h1 className="text-xl font-semibold text-slate-800">Team</h1>
      <p className="mt-1 text-sm text-slate-600">
        Administrators can see every patient in the clinic and manage staff access.
        Non-admin staff only see patients they&apos;re assigned to on a care team.
      </p>
      <div className="mt-6">
        <TeamManager staff={staff} myId={user.id} iAmAdmin={iAmAdmin} />
      </div>
      {!iAmAdmin && (
        <p className="mt-4 text-xs text-slate-400">
          Only administrators can change admin access.
        </p>
      )}
    </main>
  );
}
