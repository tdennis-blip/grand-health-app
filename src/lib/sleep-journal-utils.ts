// Client-safe helpers and types for the sleep journal.
// No server imports — safe to use in "use client" components.

export type SleepJournalEntry = {
  id: string;
  entry_date: string;
  bed_time: string | null;
  wake_time: string | null;
  time_in_bed_minutes: number | null;
  awake_minutes: number | null;
  interruption_count: number | null;
  rested_rating: number | null; // 1-5
  notes: string | null;
  updated_at: string;
};

/** Convert "HH:MM:SS" or "HH:MM" to "HH:MM" for <input type="time">. */
export function timeForInput(t: string | null): string {
  if (!t) return "";
  const m = t.match(/^(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : "";
}

export function formatRatingLabel(rating: number | null): string {
  if (rating == null) return "—";
  switch (rating) {
    case 1: return "Wrecked";
    case 2: return "Tired";
    case 3: return "OK";
    case 4: return "Good";
    case 5: return "Great";
    default: return String(rating);
  }
}
