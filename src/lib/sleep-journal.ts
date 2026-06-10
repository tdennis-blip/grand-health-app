// Read helpers for the patient-entered sleep journal. The mutate path
// lives in /app/home/sleep/actions.ts.
//
// Pure helpers + the SleepJournalEntry type live in sleep-journal-utils.ts
// so client components can import them without pulling in next/headers.
import { getUser } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import type { AuthUser } from "@/lib/auth/server";
export type { SleepJournalEntry } from "@/lib/sleep-journal-utils";
export { timeForInput, formatRatingLabel } from "@/lib/sleep-journal-utils";
import type { SleepJournalEntry } from "@/lib/sleep-journal-utils";

/** Get the journal entry for a given date for the signed-in patient. */
export async function getJournalForDate(
  patientId: string,
  entryDate: string,
  user?: AuthUser
): Promise<SleepJournalEntry | null> {
  const resolvedUser = user ?? (await getUser());
  if (!resolvedUser) return null;
  const [row] = await withAuth(resolvedUser, (sql) =>
    sql`SELECT id, entry_date, bed_time, wake_time, time_in_bed_minutes, awake_minutes, interruption_count, rested_rating, notes, updated_at FROM sleep_journal_entries WHERE patient_id = ${patientId} AND entry_date = ${entryDate} LIMIT 1`
  );
  return (row as SleepJournalEntry | undefined) ?? null;
}

/** Last N journal entries, newest first. */
export async function getRecentJournal(
  patientId: string,
  days: number = 14,
  user?: AuthUser
): Promise<SleepJournalEntry[]> {
  const resolvedUser = user ?? (await getUser());
  if (!resolvedUser) return [];
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = isoDate(since);
  const rows = await withAuth(resolvedUser, (sql) =>
    sql`SELECT id, entry_date, bed_time, wake_time, time_in_bed_minutes, awake_minutes, interruption_count, rested_rating, notes, updated_at FROM sleep_journal_entries WHERE patient_id = ${patientId} AND entry_date >= ${sinceIso} ORDER BY entry_date DESC`
  );
  return rows as unknown as SleepJournalEntry[];
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
