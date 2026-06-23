import Link from "next/link";
import { requireClinician } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { ExercisesClient } from "./exercises-client";

export default async function ExercisesPage() {
  const user = await requireClinician();
  const data = await withAuth(user, (sql) =>
    sql`SELECT id, kind, name, primary_area, coach_note, video_title, video_length, video_url, video_public_id, per_side FROM exercise_library ORDER BY kind ASC, name ASC`
  );

  return (
    <main className="max-w-5xl mx-auto px-6 py-6 space-y-6">
      <Link href="/clinician/library/training" className="text-sm text-teal-700 hover:text-teal-800 inline-flex items-center gap-1">
        &larr; Training library
      </Link>
      <header>
        <div className="text-xs uppercase tracking-wide text-slate-500">Training library</div>
        <div className="text-xl font-semibold text-slate-900">Exercises</div>
        <div className="text-xs text-slate-500 mt-1">
          Atomic moves with optional attached video. Strength and mobility are color-coded.
        </div>
      </header>

      <ExercisesClient
        initial={(data ?? []).map((e) => ({
          id: e.id,
          kind: e.kind as "strength" | "mobility",
          name: e.name,
          primaryArea: e.primary_area,
          coachNote: e.coach_note,
          videoTitle: e.video_title,
          videoLength: e.video_length,
          videoUrl: e.video_url,
          videoPublicId: e.video_public_id,
          perSide: e.per_side ?? false,
        }))}
      />
    </main>
  );
}
