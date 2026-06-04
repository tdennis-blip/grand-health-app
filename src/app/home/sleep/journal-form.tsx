"use client";

// Sleep journal client form for the patient. Lives on /home/sleep.
//
// Captures subjective context: time in bed, awake time, interruptions,
// rested rating, and a free-text "anything different last night" note.
// The form starts pre-filled when an entry for today already exists.
import { useState, useTransition } from "react";
import { Check, Clock, Bed, Moon, Sun, BookOpen, X } from "lucide-react";
import { upsertSleepJournal, deleteSleepJournal } from "./actions";
import { type SleepJournalEntry, timeForInput, formatRatingLabel } from "@/lib/sleep-journal-utils";

type Props = {
  entryDate: string; // YYYY-MM-DD
  initial: SleepJournalEntry | null;
};

const RATING_VALUES: Array<{ value: number; label: string; emoji: string }> = [
  { value: 1, label: "Wrecked", emoji: "😵" },
  { value: 2, label: "Tired", emoji: "😴" },
  { value: 3, label: "OK", emoji: "😐" },
  { value: 4, label: "Good", emoji: "🙂" },
  { value: 5, label: "Great", emoji: "💪" },
];

export function JournalForm({ entryDate, initial }: Props) {
  const [bedTime, setBedTime] = useState(timeForInput(initial?.bed_time ?? null));
  const [wakeTime, setWakeTime] = useState(timeForInput(initial?.wake_time ?? null));
  const [awakeMinutes, setAwakeMinutes] = useState(
    initial?.awake_minutes != null ? String(initial.awake_minutes) : ""
  );
  const [interruptions, setInterruptions] = useState(
    initial?.interruption_count != null ? String(initial.interruption_count) : ""
  );
  const [rating, setRating] = useState<number | null>(initial?.rested_rating ?? null);
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Live "time in bed" preview from bed/wake.
  const tibPreview = computeTibPreview(bedTime, wakeTime);

  const dirty =
    bedTime !== timeForInput(initial?.bed_time ?? null) ||
    wakeTime !== timeForInput(initial?.wake_time ?? null) ||
    awakeMinutes !== (initial?.awake_minutes != null ? String(initial.awake_minutes) : "") ||
    interruptions !== (initial?.interruption_count != null ? String(initial.interruption_count) : "") ||
    rating !== (initial?.rested_rating ?? null) ||
    notes !== (initial?.notes ?? "");

  function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("saving");
    setErrorMsg(null);
    const fd = new FormData(e.currentTarget);
    // Form's hidden entry_date is the canonical key.
    startTransition(async () => {
      const res = await upsertSleepJournal(fd);
      if (res.ok) {
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 1800);
      } else {
        setStatus("error");
        setErrorMsg(res.error);
      }
    });
  }

  function onClear() {
    if (!initial) {
      // Nothing saved — just reset the form locally.
      setBedTime("");
      setWakeTime("");
      setAwakeMinutes("");
      setInterruptions("");
      setRating(null);
      setNotes("");
      return;
    }
    if (!confirm("Delete this night's journal entry?")) return;
    setStatus("saving");
    startTransition(async () => {
      const res = await deleteSleepJournal(entryDate);
      if (res.ok) {
        setBedTime("");
        setWakeTime("");
        setAwakeMinutes("");
        setInterruptions("");
        setRating(null);
        setNotes("");
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 1800);
      } else {
        setStatus("error");
        setErrorMsg(res.error);
      }
    });
  }

  return (
    <form
      onSubmit={onSave}
      className="bg-white rounded-2xl border border-slate-200 p-3.5 space-y-3"
    >
      <input type="hidden" name="entry_date" value={entryDate} />

      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-[13px] font-semibold text-slate-900 flex items-center gap-1.5">
            <BookOpen size={13} className="text-indigo-500" /> Last night journal
          </div>
          <div className="text-[10.5px] text-slate-500">
            Your notes — these add context the tracker can&apos;t see.
          </div>
        </div>
        {status === "saved" && (
          <span className="text-[10.5px] text-emerald-600 font-semibold inline-flex items-center gap-0.5">
            <Check size={11} /> Saved
          </span>
        )}
        {status === "saving" && (
          <span className="text-[10.5px] text-slate-500">Saving…</span>
        )}
        {status === "error" && (
          <span className="text-[10.5px] text-rose-600">{errorMsg ?? "Error"}</span>
        )}
      </div>

      {/* bed + wake time */}
      <div className="grid grid-cols-2 gap-2">
        <TimeField
          label="In bed at"
          icon={<Moon size={11} />}
          name="bed_time"
          value={bedTime}
          onChange={setBedTime}
        />
        <TimeField
          label="Woke up at"
          icon={<Sun size={11} />}
          name="wake_time"
          value={wakeTime}
          onChange={setWakeTime}
        />
      </div>

      {tibPreview && (
        <div className="text-[10.5px] text-slate-500 flex items-center gap-1 -mt-1">
          <Bed size={10} /> {tibPreview}
        </div>
      )}

      {/* awake mins + interruptions */}
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Awake during night"
          name="awake_minutes"
          value={awakeMinutes}
          onChange={setAwakeMinutes}
          suffix="min"
          icon={<Clock size={11} />}
          min={0}
          max={1440}
        />
        <NumberField
          label="Interruptions"
          name="interruption_count"
          value={interruptions}
          onChange={setInterruptions}
          suffix="times"
          min={0}
          max={100}
        />
      </div>

      {/* rested rating */}
      <div>
        <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
          How rested do you feel?
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {RATING_VALUES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRating(rating === r.value ? null : r.value)}
              aria-pressed={rating === r.value}
              className={`flex flex-col items-center gap-0.5 rounded-lg border px-1 py-1.5 transition ${
                rating === r.value
                  ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                  : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              <span className="text-base leading-none">{r.emoji}</span>
              <span className="text-[9.5px] font-semibold">{r.label}</span>
            </button>
          ))}
        </div>
        <input type="hidden" name="rested_rating" value={rating ?? ""} />
      </div>

      {/* notes */}
      <div>
        <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
          Anything different last night?
        </div>
        <textarea
          name="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Late coffee, traveling, sick kid, new room, alcohol with dinner…"
          className="w-full text-[12px] text-slate-800 placeholder:text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
        />
        <div className="text-right text-[9.5px] text-slate-400 mt-0.5">{notes.length}/2000</div>
      </div>

      {/* footer */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="text-[10px] text-slate-500">
          {initial ? (
            <>
              Last saved · rated{" "}
              <span className="font-semibold text-slate-700">
                {formatRatingLabel(initial.rested_rating)}
              </span>
            </>
          ) : (
            "Not saved yet"
          )}
        </div>
        <div className="flex items-center gap-2">
          {initial && (
            <button
              type="button"
              onClick={onClear}
              disabled={pending}
              className="text-[11px] font-semibold text-slate-500 hover:text-rose-600 inline-flex items-center gap-1 disabled:opacity-50"
            >
              <X size={11} /> Clear
            </button>
          )}
          <button
            type="submit"
            disabled={pending || !dirty}
            className="text-[11.5px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 px-3 py-1.5 rounded-lg transition"
          >
            {pending ? "Saving…" : initial ? "Update" : "Save"}
          </button>
        </div>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TimeField({
  label,
  icon,
  name,
  value,
  onChange,
}: {
  label: string;
  icon: React.ReactNode;
  name: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1 flex items-center gap-1">
        {icon} {label}
      </div>
      <input
        type="time"
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-[13px] text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 tabular-nums"
      />
    </label>
  );
}

function NumberField({
  label,
  name,
  value,
  onChange,
  suffix,
  icon,
  min,
  max,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  icon?: React.ReactNode;
  min?: number;
  max?: number;
}) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1 flex items-center gap-1">
        {icon} {label}
      </div>
      <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 focus-within:ring-2 focus-within:ring-indigo-200 focus-within:border-indigo-300">
        <input
          type="number"
          inputMode="numeric"
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          min={min}
          max={max}
          placeholder="—"
          className="w-full text-[13px] text-slate-800 bg-transparent py-1.5 focus:outline-none tabular-nums"
        />
        {suffix && <span className="text-[10px] text-slate-400">{suffix}</span>}
      </div>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeTibPreview(bed: string, wake: string): string | null {
  if (!bed || !wake) return null;
  const m = bed.match(/^(\d{2}):(\d{2})/);
  const w = wake.match(/^(\d{2}):(\d{2})/);
  if (!m || !w) return null;
  const bedMin = Number(m[1]) * 60 + Number(m[2]);
  const wakeMin = Number(w[1]) * 60 + Number(w[2]);
  let diff = wakeMin - bedMin;
  if (diff <= 0) diff += 24 * 60;
  const h = Math.floor(diff / 60);
  const mm = diff % 60;
  return `Time in bed · ${h}h ${mm}m`;
}
