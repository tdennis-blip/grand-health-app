"use client";

import { useState, useTransition } from "react";
import { Check, Send } from "lucide-react";
import { saveWorkoutFeedback } from "./log-actions";

const RPE_HINT: Record<number, string> = {
  1: "Very easy", 2: "Easy", 3: "Light", 4: "Comfortable", 5: "Moderate",
  6: "Somewhat hard", 7: "Hard", 8: "Very hard", 9: "Near max", 10: "Max effort",
};

export function WorkoutFeedback({
  sessionId,
  sessionName,
  day,
  logDate,
  initial,
}: {
  sessionId: string;
  sessionName: string;
  day: string;
  logDate: string;
  initial: { rpe: number | null; comment: string | null } | null;
}) {
  const [rpe, setRpe] = useState<number | null>(initial?.rpe ?? null);
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<null | "saved" | "messaged">(null);

  const save = () => {
    setStatus(null);
    startTransition(async () => {
      const res = await saveWorkoutFeedback({
        sessionId,
        sessionName,
        day,
        logDate,
        rpe,
        comment: comment.trim() ? comment.trim() : null,
      });
      setStatus(res?.messaged ? "messaged" : "saved");
    });
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
      <div>
        <div className="text-sm font-semibold text-slate-900">How did that feel?</div>
        <div className="text-[12px] text-slate-500 leading-snug">
          Rate your effort and leave any comments or questions for your trainer.
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1.5">
          Effort (RPE 1–10){rpe != null ? ` · ${RPE_HINT[rpe]}` : ""}
        </div>
        <div className="grid grid-cols-10 gap-1">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRpe(rpe === n ? null : n)}
              className={`h-9 rounded-lg text-sm font-semibold tabular-nums transition-colors ${
                rpe === n
                  ? "bg-teal-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1.5">
          Comments / questions
        </div>
        <textarea
          rows={3}
          value={comment}
          onChange={(e) => { setComment(e.target.value); setStatus(null); }}
          placeholder="Felt strong today, but my left knee was a little sore on lunges — should I swap those?"
          className="w-full text-[13px] border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
        />
        <div className="text-[11px] text-slate-400 mt-1">
          Comments are sent to your trainer as a message.
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending || (rpe == null && comment.trim() === "")}
          className={`text-sm font-semibold px-4 py-2 rounded-lg inline-flex items-center gap-1.5 ${
            pending || (rpe == null && comment.trim() === "")
              ? "bg-slate-200 text-slate-400 cursor-not-allowed"
              : "bg-teal-700 text-white hover:bg-teal-800"
          }`}
        >
          <Send size={14} /> {pending ? "Sending…" : "Submit feedback"}
        </button>
        {status === "messaged" && (
          <span className="text-xs text-emerald-700 inline-flex items-center gap-1">
            <Check size={13} /> Sent to your trainer.
          </span>
        )}
        {status === "saved" && (
          <span className="text-xs text-emerald-700 inline-flex items-center gap-1">
            <Check size={13} /> Saved.
          </span>
        )}
      </div>
    </section>
  );
}
