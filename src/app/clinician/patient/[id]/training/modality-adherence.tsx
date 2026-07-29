import { Dumbbell, Activity, Flame, Sparkles } from "lucide-react";
import type { ModalityAdherence } from "@/lib/training-analytics";

const ICON: Record<ModalityAdherence["kind"], typeof Dumbbell> = {
  strength: Dumbbell, zone2: Activity, vo2max: Flame, mobility: Sparkles,
};

function barColor(pct: number): string {
  if (pct >= 80) return "bg-emerald-500";
  if (pct >= 50) return "bg-amber-500";
  return "bg-rose-500";
}

// Provider view: adherence to the prescribed program, split by modality, over
// the last 4 weeks. Hidden when there's no active program.
export function ModalityAdherencePanel({ data, weeks = 4 }: { data: ModalityAdherence[] | null; weeks?: number }) {
  if (!data) {
    return (
      <section className="bg-white rounded-2xl border border-slate-200 p-5">
        <Header weeks={weeks} />
        <div className="mt-3 text-[13px] text-slate-500 italic">No active program assigned — adherence appears once a program is assigned.</div>
      </section>
    );
  }

  const anyPrescribed = data.some((d) => d.prescribed > 0);

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5">
      <Header weeks={weeks} />
      {!anyPrescribed ? (
        <div className="mt-3 text-[13px] text-slate-500 italic">The active program doesn&apos;t schedule any sessions yet.</div>
      ) : (
        <div className="mt-3 space-y-3">
          {data.filter((d) => d.prescribed > 0).map((d) => {
            const Icon = ICON[d.kind];
            const pct = d.pct ?? 0;
            return (
              <div key={d.kind}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 text-[13px] font-medium text-slate-800">
                    <Icon size={14} className="text-slate-500" /> {d.label}
                  </div>
                  <div className="text-[12px] tabular-nums text-slate-500">
                    <span className="font-semibold text-slate-900">{d.completed}</span> / {d.prescribed}
                    <span className="ml-1.5 font-semibold text-slate-700">{pct}%</span>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className={`h-full rounded-full ${barColor(pct)}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Header({ weeks }: { weeks: number }) {
  return (
    <div>
      <div className="text-sm font-semibold text-slate-900">Training adherence by modality</div>
      <div className="text-[11px] text-slate-500">Completed vs. prescribed sessions over the last {weeks} weeks.</div>
    </div>
  );
}
