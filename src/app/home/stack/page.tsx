import Link from "next/link";
import { ChevronLeft, Pill, AlertTriangle, Package, FlaskConical } from "lucide-react";
import { requirePatient } from "@/lib/auth/server";
import {
  getDosesForDate,
  getAdherenceStrip,
  getStack,
  isoDate,
  refillStatus,
  type StackItem,
} from "@/lib/medications";
import { checkPatientStack, type InteractionHit } from "@/lib/medications-interactions";
import { StackClient } from "./stack-client";
import { RefillRequestButton } from "./refill-request-button";

export default async function PatientStackPage() {
  const user = await requirePatient();
  const today = isoDate(new Date());

  const [doses, adherence, stack] = await Promise.all([
    getDosesForDate(user.id, today, user),
    getAdherenceStrip(user.id, 7, user),
    getStack(user.id, user),
  ]);

  const interactions: InteractionHit[] = stack.length
    ? await checkPatientStack(
        stack.map((m) => ({ id: m.id, name: m.name, active: m.active })),
      )
    : [];

  // Only show meds/supps with at least one dose; the editor view (clinician)
  // covers items without doses.
  const stackWithDoses = stack.filter((m) => m.doses.length > 0);
  const refillByMed: Record<string, ReturnType<typeof refillStatus>> = {};
  for (const m of stack) refillByMed[m.id] = refillStatus(m);

  const takenToday = doses.filter((d) => d.taken).length;
  const total = doses.length;

  return (
    <main className="p-5 space-y-4 pb-6">
      <Link href="/home" className="text-sm text-teal-700 inline-flex items-center gap-1">
        <ChevronLeft size={14} /> Home
      </Link>

      <header>
        <div className="text-xs uppercase tracking-wide text-slate-500">Today</div>
        <div className="text-xl font-semibold text-slate-900 flex items-center gap-1.5">
          <Pill size={18} className="text-violet-600" /> Meds &amp; Supplements
        </div>
      </header>

      {stack.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-5 text-center">
          <div className="text-sm font-semibold text-slate-900">Nothing here yet</div>
          <div className="text-[12px] text-slate-500 leading-snug mt-1">
            Your clinician hasn&apos;t added any medications or supplements. They&apos;ll appear here once they do.
          </div>
        </div>
      ) : (
        <>
          {/* Headline tile */}
          <div className="bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white rounded-3xl p-5">
            <div className="text-[10px] uppercase tracking-wide opacity-90">Today</div>
            <div className="text-4xl font-semibold mt-1 tabular-nums">
              {total === 0 ? "—" : `${takenToday} / ${total}`}
            </div>
            <div className="text-[12px] opacity-90 mt-1">
              {total === 0
                ? "Nothing scheduled today."
                : takenToday >= total
                ? "All doses taken. Nice."
                : `${total - takenToday} ${total - takenToday === 1 ? "dose" : "doses"} left to take`}
            </div>
          </div>

          {/* Interaction alerts from your clinic's library */}
          {interactions.length > 0 && (
            <section className="bg-amber-50 border border-amber-300 text-amber-900 rounded-2xl p-4">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <AlertTriangle size={14} /> Heads up — check with your clinician
              </div>
              <ul className="mt-2 space-y-1.5">
                {interactions.map((h) => (
                  <li key={h.ruleId + h.medicationIdA + h.medicationIdB} className="text-[12px] leading-snug">
                    <span className="font-semibold">{h.matchedA}</span>
                    <span className="opacity-60"> + </span>
                    <span className="font-semibold">{h.matchedB}</span>: {h.message}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 7-day adherence strip */}
          <section className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-2">
              Last 7 days
            </div>
            <AdherenceStrip data={adherence} />
          </section>

          {/* Today's doses, grouped by time */}
          <StackClient logDate={today} doses={doses} />

          {/* Supplement nutrient totals */}
          <SupplementNutrientTotals stack={stack} />

          {/* Full list at the bottom for context (no check-offs) */}
          <section className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-2">
              Your full list
            </div>
            <div className="space-y-2">
              {stackWithDoses.map((m) => {
                const r = refillByMed[m.id];
                return (
                  <div key={m.id} className="border border-slate-200 rounded-xl px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">
                          {m.name}
                          {m.dose && <span className="text-slate-400 font-normal"> · {m.dose}</span>}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {m.doses.length} {m.doses.length === 1 ? "dose" : "doses"} per schedule
                          {m.pillarName && (
                            <span className="text-violet-700"> · {m.pillarName}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {r?.state === "low" && (
                          <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 inline-flex items-center gap-0.5">
                            <Package size={9} /> {r.daysRemaining}d
                          </span>
                        )}
                        {r?.state === "out" && (
                          <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 inline-flex items-center gap-0.5">
                            <Package size={9} /> out
                          </span>
                        )}
                        <span className="text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full border bg-slate-50 text-slate-600 border-slate-200">
                          {m.kind === "supplement" ? "supp" : "med"}
                        </span>
                      </div>
                    </div>
                    {m.instructions && (
                      <div className="text-[11px] text-slate-500 mt-1">{m.instructions}</div>
                    )}
                    {(r?.state === "low" || r?.state === "out") && (
                      <div className="mt-2">
                        <RefillRequestButton
                          medicationId={m.id}
                          medicationName={m.name}
                          variant={r.state}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

const NUTRIENT_ROWS: Array<{ key: keyof StackItem; label: string; unit: string }> = [
  { key: "vitaminDIu",   label: "Vitamin D",   unit: "IU"  },
  { key: "vitaminB12Ug", label: "Vitamin B12",  unit: "µg"  },
  { key: "ironMg",       label: "Iron",         unit: "mg"  },
  { key: "magnesiumMg",  label: "Magnesium",    unit: "mg"  },
  { key: "calciumMg",    label: "Calcium",      unit: "mg"  },
  { key: "potassiumMg",  label: "Potassium",    unit: "mg"  },
  { key: "sodiumMg",     label: "Sodium",       unit: "mg"  },
  { key: "dhaMg",        label: "DHA",          unit: "mg"  },
  { key: "epaMg",        label: "EPA",          unit: "mg"  },
  { key: "creatineMg",   label: "Creatine",     unit: "mg"  },
  { key: "coq10Mg",      label: "CoQ10",        unit: "mg"  },
  { key: "fiberG",       label: "Fiber",        unit: "g"   },
];

function SupplementNutrientTotals({ stack }: { stack: StackItem[] }) {
  const supplements = stack.filter((m) => m.kind === "supplement" && m.active);
  if (supplements.length === 0) return null;

  const totals: Partial<Record<string, number>> = {};
  for (const s of supplements) {
    const dosesPerDay = s.doses.length > 0
      ? s.doses.reduce((sum, d) => sum + d.daysOfWeek.length / 7, 0)
      : 1;
    for (const n of NUTRIENT_ROWS) {
      const val = s[n.key] as number | null;
      if (val != null && val > 0) {
        totals[n.key] = (totals[n.key] ?? 0) + val * dosesPerDay;
      }
    }
  }

  const present = NUTRIENT_ROWS.filter((n) => (totals[n.key] ?? 0) > 0);
  if (present.length === 0) return null;

  return (
    <section className="bg-violet-50 border border-violet-200 rounded-2xl p-4">
      <div className="text-[10px] uppercase tracking-wide text-violet-600 font-semibold flex items-center gap-1 mb-3">
        <FlaskConical size={11} /> Supplement nutrients · daily total
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2">
        {present.map((n) => (
          <div key={n.key} className="flex items-center justify-between text-[12px]">
            <span className="text-slate-600">{n.label}</span>
            <span className="font-semibold tabular-nums text-violet-800">
              {Math.round((totals[n.key]!) * 10) / 10} {n.unit}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2.5 text-[10px] text-violet-500 leading-snug">
        Totals from {supplements.filter((s) => NUTRIENT_ROWS.some((n) => (s[n.key] as number | null) != null)).length} active supplement{supplements.length !== 1 ? "s" : ""}, weighted by dose frequency.
      </div>
    </section>
  );
}

function AdherenceStrip({ data }: { data: Array<{ date: string; scheduled: number; taken: number }> }) {
  return (
    <div className="flex items-end gap-1.5 h-24">
      {data.map((d) => {
        const pct = d.scheduled === 0 ? null : Math.round((d.taken / d.scheduled) * 100);
        const dayLabel = new Date(d.date + "T00:00").toLocaleDateString(undefined, { weekday: "narrow" });
        const heightPct = pct == null ? 4 : Math.max(4, pct);
        const tone =
          pct == null
            ? "bg-slate-200"
            : pct >= 90
            ? "bg-emerald-500"
            : pct >= 60
            ? "bg-amber-500"
            : "bg-rose-500";
        return (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
            <div className="text-[9px] text-slate-500 tabular-nums">
              {pct == null ? "—" : `${pct}%`}
            </div>
            <div className="w-full bg-slate-100 rounded-t flex items-end" style={{ height: "calc(100% - 24px)" }}>
              <div className={`w-full ${tone} rounded-t`} style={{ height: `${heightPct}%` }} />
            </div>
            <div className="text-[9px] text-slate-500">{dayLabel}</div>
          </div>
        );
      })}
    </div>
  );
}
