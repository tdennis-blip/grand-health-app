"use client";

import { useState, useTransition } from "react";
import { Sparkles, ChevronDown, ChevronUp, RefreshCw, AlertCircle } from "lucide-react";
import { generateDietPlan, type PlanType } from "./ai-plan-actions";

const PLAN_TYPES: { id: PlanType; label: string; emoji: string }[] = [
  { id: "breakfast", label: "Breakfast", emoji: "🌅" },
  { id: "lunch",     label: "Lunch",     emoji: "☀️" },
  { id: "dinner",    label: "Dinner",    emoji: "🌙" },
  { id: "snack",     label: "Snack",     emoji: "🍎" },
  { id: "full_day",  label: "Full day",  emoji: "📅" },
];

export function AIDietPlan({ hasPreferences }: { hasPreferences: boolean }) {
  const [open, setOpen] = useState(false);
  const [planType, setPlanType] = useState<PlanType>("full_day");
  const [notes, setNotes] = useState("");
  const [plan, setPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const generate = () => {
    setPlan(null);
    setError(null);
    startTransition(async () => {
      const result = await generateDietPlan({ planType, additionalNotes: notes });
      if (result.ok) {
        setPlan(result.plan);
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {/* Header — always visible, toggles the panel */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3.5 text-left"
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
            <Sparkles size={13} className="text-white" />
          </div>
          <div>
            <div className="text-[13px] font-semibold text-slate-900">AI meal planner</div>
            <div className="text-[10.5px] text-slate-500">
              Generate a plan based on your goals &amp; preferences
            </div>
          </div>
        </div>
        {open ? (
          <ChevronUp size={15} className="text-slate-400 flex-shrink-0" />
        ) : (
          <ChevronDown size={15} className="text-slate-400 flex-shrink-0" />
        )}
      </button>

      {open && (
        <div className="border-t border-slate-100 px-4 pb-4 space-y-3 pt-3">
          {/* Hint if no preferences set */}
          {!hasPreferences && (
            <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-snug">
              Tip: add your dietary preferences &amp; restrictions in{" "}
              <a href="/home/profile" className="underline font-semibold">
                Me → Profile
              </a>{" "}
              so the AI can personalise your plans.
            </div>
          )}

          {/* Plan type selector */}
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1.5">
              What do you want planned?
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PLAN_TYPES.map((pt) => (
                <button
                  key={pt.id}
                  onClick={() => setPlanType(pt.id)}
                  className={`text-[11.5px] font-semibold px-3 py-1.5 rounded-full border transition ${
                    planType === pt.id
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {pt.emoji} {pt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Additional notes */}
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
              Anything specific? <span className="normal-case font-normal">(optional)</span>
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={300}
              placeholder="e.g. High protein, quick to prepare, no cooking tonight, using up chicken…"
              className="w-full text-[12px] text-slate-800 placeholder:text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
            />
          </div>

          {/* Generate button */}
          <button
            onClick={generate}
            disabled={pending}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-[13px] text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-60 transition"
          >
            {pending ? (
              <>
                <RefreshCw size={13} className="animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Sparkles size={13} />
                Generate plan
              </>
            )}
          </button>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 text-[12px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2.5">
              <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* Plan output */}
          {plan && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
              <PlanRenderer text={plan} />
              <button
                onClick={generate}
                disabled={pending}
                className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 disabled:opacity-50"
              >
                <RefreshCw size={10} /> Regenerate
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Render the AI markdown-like response into styled elements
// ---------------------------------------------------------------------------

function PlanRenderer({ text }: { text: string }) {
  const lines = text.split("\n");

  return (
    <div className="space-y-1.5 text-[12.5px] text-slate-800 leading-snug">
      {lines.map((line, i) => {
        if (line.startsWith("## ")) {
          return (
            <div key={i} className="text-[11px] uppercase tracking-wide font-bold text-indigo-700 pt-2 first:pt-0">
              {line.replace(/^## /, "")}
            </div>
          );
        }
        if (line.startsWith("### ")) {
          return (
            <div key={i} className="text-[12px] font-semibold text-slate-900 pt-1">
              {line.replace(/^### /, "")}
            </div>
          );
        }
        if (line.startsWith("**") && line.endsWith("**")) {
          return (
            <div key={i} className="font-semibold text-slate-900">
              {line.replace(/\*\*/g, "")}
            </div>
          );
        }
        if (line.startsWith("- ") || line.startsWith("• ")) {
          return (
            <div key={i} className="flex gap-1.5 pl-1">
              <span className="text-slate-400 flex-shrink-0">·</span>
              <span>{renderInline(line.replace(/^[-•] /, ""))}</span>
            </div>
          );
        }
        if (line.trim() === "") {
          return <div key={i} className="h-1" />;
        }
        return (
          <div key={i}>{renderInline(line)}</div>
        );
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  // Bold: **text**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  if (parts.length === 1) return text;
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i}>{p.slice(2, -2)}</strong>
        ) : (
          p
        )
      )}
    </>
  );
}
