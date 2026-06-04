import Link from "next/link";
import { requireClinician } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { ZonesTargetsClient } from "./zones-targets-client";

export default async function ZonesPage() {
  const user = await requireClinician();

  const [zones, [targets]] = await Promise.all([
    withAuth(user, (sql) =>
      sql`SELECT id, zone_key, name, short_name, low_bpm, high_bpm FROM hr_zones ORDER BY sort_order ASC`
    ),
    withAuth(user, (sql) =>
      sql`SELECT strength_per_week, zone2_minutes_per_week, vo2max_minutes_per_week, mobility_per_week FROM training_targets WHERE clinic_id = ${user.clinicId} LIMIT 1`
    ),
  ]);

  return (
    <main className="max-w-5xl mx-auto px-6 py-6 space-y-6">
      <Link href="/clinician/library/training" className="text-sm text-teal-700 hover:text-teal-800 inline-flex items-center gap-1">
        &larr; Training library
      </Link>
      <header>
        <div className="text-xs uppercase tracking-wide text-slate-500">Training library</div>
        <div className="text-xl font-semibold text-slate-900">Zones &amp; targets</div>
        <div className="text-xs text-slate-500 mt-1">
          Heart-rate zone boundaries used by Zone 2 and VO₂ max sessions, plus weekly volume targets.
        </div>
      </header>

      <ZonesTargetsClient
        zones={zones.map((z) => ({
          id: z.id,
          zoneKey: z.zone_key,
          name: z.name,
          shortName: z.short_name,
          lowBpm: z.low_bpm,
          highBpm: z.high_bpm,
        }))}
        targets={{
          strengthPerWeek: targets?.strength_per_week ?? 3,
          zone2MinutesPerWeek: targets?.zone2_minutes_per_week ?? 180,
          vo2maxMinutesPerWeek: targets?.vo2max_minutes_per_week ?? 30,
          mobilityPerWeek: targets?.mobility_per_week ?? 4,
        }}
      />
    </main>
  );
}
