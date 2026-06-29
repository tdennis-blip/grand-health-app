import Link from "next/link";
import { requireClinician } from "@/lib/auth/server";
import { serviceRoleSql } from "@/lib/db/connection";
import { ProviderProfileEditor } from "./profile-editor";

export default async function ProviderProfilePage() {
  const user = await requireClinician();

  const [row] = await serviceRoleSql<
    {
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      professional_role: string | null;
      title: string | null;
      credentials: string | null;
    }[]
  >`
    SELECT p.first_name, p.last_name, p.email,
           cp.professional_role, cp.title, cp.credentials
    FROM public.profiles p
    LEFT JOIN public.clinician_profiles cp ON cp.profile_id = p.id
    WHERE p.id = ${user.id}
    LIMIT 1
  `;

  return (
    <main className="max-w-2xl mx-auto px-6 py-6 space-y-5">
      <Link href="/clinician/dashboard" className="text-sm text-teal-700">&larr; Back to panel</Link>
      <div>
        <div className="text-xs uppercase tracking-wide text-slate-500">Settings</div>
        <h1 className="text-xl font-semibold text-slate-900">My profile</h1>
      </div>

      <ProviderProfileEditor
        initial={{
          firstName: row?.first_name ?? "",
          lastName: row?.last_name ?? "",
          email: row?.email ?? "",
          professionalRole: row?.professional_role ?? "",
          title: row?.title ?? "",
          credentials: row?.credentials ?? "",
        }}
      />
    </main>
  );
}
