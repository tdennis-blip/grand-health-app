"use server";

// Patient sleep-journal server actions.
//
// One row per (patient_id, entry_date). Upsert pattern: read existing,
// merge incoming fields, then upsert. Empty strings / null clear a field.
//
// Every mutation calls recordAudit() and revalidates /home/sleep + /home.
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePatient } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { recordAudit } from "@/lib/audit";

// ----- helpers --------------------------------------------------------------

function todayLocalIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function emptyToNull(v: FormDataEntryValue | null | undefined): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}

function nullableInt(s: string | null): number | null {
  if (s == null) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

// HH:MM input — pad to HH:MM:00 for postgres time column. Pass through
// null when empty.
function nullableTime(s: string | null): string | null {
  if (s == null) return null;
  // accept HH:MM or HH:MM:SS
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s;
  return null;
}

// Compute time in bed from bed_time + wake_time, wrapping past midnight if
// wake_time < bed_time. Returns null if either is missing.
function computeTimeInBed(bed: string | null, wake: string | null): number | null {
  if (!bed || !wake) return null;
  const [bh, bm] = bed.split(":").map(Number);
  const [wh, wm] = wake.split(":").map(Number);
  if ([bh, bm, wh, wm].some((n) => !Number.isFinite(n))) return null;
  let mins = wh * 60 + wm - (bh * 60 + bm);
  if (mins <= 0) mins += 24 * 60; // wrapped past midnight
  return mins;
}

// ----- schema ---------------------------------------------------------------

const UpsertSchema = z.object({
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bed_time: z.string().nullable(),
  wake_time: z.string().nullable(),
  time_in_bed_minutes: z.number().int().min(0).max(1440).nullable(),
  awake_minutes: z.number().int().min(0).max(1440).nullable(),
  interruption_count: z.number().int().min(0).max(100).nullable(),
  rested_rating: z.number().int().min(1).max(5).nullable(),
  notes: z.string().max(2000).nullable(),
});

// ----- actions --------------------------------------------------------------

export async function upsertSleepJournal(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  let user;
  try { user = await requirePatient(); } catch { return { ok: false, error: "Not signed in" }; }

  const entry_date = (emptyToNull(formData.get("entry_date")) ?? todayLocalIso()) as string;
  const bed_time = nullableTime(emptyToNull(formData.get("bed_time")));
  const wake_time = nullableTime(emptyToNull(formData.get("wake_time")));

  // If the patient typed an explicit time-in-bed, honor it. Otherwise
  // compute from bed/wake when both are present.
  const explicitTib = nullableInt(emptyToNull(formData.get("time_in_bed_minutes")));
  const computedTib = computeTimeInBed(bed_time, wake_time);
  const time_in_bed_minutes = explicitTib ?? computedTib;

  const payload = {
    entry_date,
    bed_time,
    wake_time,
    time_in_bed_minutes,
    awake_minutes: nullableInt(emptyToNull(formData.get("awake_minutes"))),
    interruption_count: nullableInt(emptyToNull(formData.get("interruption_count"))),
    rested_rating: nullableInt(emptyToNull(formData.get("rested_rating"))),
    notes: emptyToNull(formData.get("notes")),
  };

  const parsed = UpsertSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const [existing] = await withAuth(user, (sql) =>
    sql`SELECT * FROM sleep_journal_entries WHERE patient_id = ${user.id} AND entry_date = ${entry_date} LIMIT 1`
  );

  const d = parsed.data;
  const [saved] = await withAuth(user, (sql) =>
    sql`
      INSERT INTO sleep_journal_entries
        (clinic_id, patient_id, entry_date, bed_time, wake_time, time_in_bed_minutes, awake_minutes, interruption_count, rested_rating, notes)
      VALUES (${user.clinicId}, ${user.id}, ${d.entry_date}, ${d.bed_time}, ${d.wake_time},
              ${d.time_in_bed_minutes}, ${d.awake_minutes}, ${d.interruption_count}, ${d.rested_rating}, ${d.notes})
      ON CONFLICT (patient_id, entry_date) DO UPDATE
        SET bed_time = EXCLUDED.bed_time, wake_time = EXCLUDED.wake_time,
            time_in_bed_minutes = EXCLUDED.time_in_bed_minutes, awake_minutes = EXCLUDED.awake_minutes,
            interruption_count = EXCLUDED.interruption_count, rested_rating = EXCLUDED.rested_rating,
            notes = EXCLUDED.notes, updated_at = now()
      RETURNING *
    `
  );

  if (!saved) return { ok: false, error: "Save failed" };

  await recordAudit({
    action: existing ? "update" : "create",
    entityType: "sleep_journal_entry",
    entityId: saved?.id ?? null,
    patientId: user.id,
    meta: { before: existing ?? null, after: saved ?? null },
  });

  revalidatePath("/home/sleep");
  revalidatePath("/home");
  return { ok: true };
}

export async function deleteSleepJournal(entryDate: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) {
    return { ok: false, error: "Invalid date" };
  }
  let user;
  try { user = await requirePatient(); } catch { return { ok: false, error: "Not signed in" }; }

  const [existing] = await withAuth(user, (sql) =>
    sql`SELECT * FROM sleep_journal_entries WHERE patient_id = ${user.id} AND entry_date = ${entryDate} LIMIT 1`
  );

  if (!existing) {
    return { ok: true };
  }

  await withAuth(user, (sql) =>
    sql`DELETE FROM sleep_journal_entries WHERE patient_id = ${user.id} AND entry_date = ${entryDate}`
  );

  await recordAudit({
    action: "delete",
    entityType: "sleep_journal_entry",
    entityId: existing.id,
    patientId: user.id,
    meta: { before: existing },
  });

  revalidatePath("/home/sleep");
  revalidatePath("/home");
  return { ok: true };
}
