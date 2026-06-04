"use client";

import { useState } from "react";
import { Trophy, Footprints, Mountain, TrendingUp, Baby, ShoppingBag, Activity, Heart } from "lucide-react";
import { TrajectoryChart } from "./trajectory-chart";

const ICONS: Record<string, typeof Trophy> = {
  Trophy, Footprints, Mountain, TrendingUp, Baby, ShoppingBag, Activity,
};

export type ChartActivity = {
  id: string;
  name: string;
  icon: string | null;
  accent: string | null;
  requiredVo2: number;
  requiredStrengthLb: number | null;
  requiredMobilityLevel: "low" | "moderate" | "high";
  targetAge: number;
};

type DeclineRates = {
  vo2max: { trained: number; untrained: number };
};

// Mobility level → percentile floor. Used by the per-activity mobility chart
// inside the expanded activity card. Exported so that component can reuse it.
export const MOBILITY_FLOOR_FOR_LEVEL: Record<"low" | "moderate" | "high", number> = {
  low: 25,
  moderate: 55,
  high: 80,
};

export function HeroCharts({
  ageNow,
  vo2Now,
  activities,
  decline,
}: {
  ageNow: number;
  vo2Now: number | null;
  activities: ChartActivity[];
  decline: DeclineRates;
}) {
  const [selectedId, setSelectedId] = useState<string>(activities[0]?.id ?? "");
  const selected = activities.find((a) => a.id === selectedId) ?? activities[0];
  const highestVo2Activity = activities.length > 0
    ? activities.reduce((best, a) => a.requiredVo2 > best.requiredVo2 ? a : best)
    : null;

  if (!selected) {
    return (
      <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500 italic">
        No activities configured yet — your clinician will set these up.
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {/* Activity picker — drives the VO₂ chart. Strength + mobility live inside each activity card. */}
      <div className="bg-white rounded-xl border border-slate-200 p-2.5">
        <div className="text-[9.5px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
          Focus the VO₂ graph on
        </div>
        <div className="flex gap-1 overflow-x-auto -mx-1 px-1 pb-0.5">
          {activities.map((a) => {
            const Icon = (a.icon && ICONS[a.icon]) || Activity;
            const isSel = a.id === selected.id;
            return (
              <button
                key={a.id}
                onClick={() => setSelectedId(a.id)}
                className={`flex-shrink-0 flex items-center gap-1 text-[10.5px] font-semibold rounded-md px-2 py-1 border transition ${
                  isSel
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                }`}
              >
                <Icon size={11} />
                <span className="whitespace-nowrap">{a.name}</span>
                <span className={`tabular-nums text-[9.5px] ${isSel ? "opacity-75" : "text-slate-400"}`}>@{a.targetAge}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* VO₂ chart */}
      <TrajectoryChart
        title="VO₂ max trajectory"
        icon={<Heart size={14} className="text-rose-500" />}
        yAxisLabel="VO₂ max"
        yMin={0}
        yMax={Math.max(60, (vo2Now ?? 0) + 5)}
        yTicks={[10, 20, 30, 40, 50, 60]}
        currentValue={vo2Now}
        currentLabel={vo2Now != null ? `${vo2Now}` : null}
        ageNow={ageNow}
        targetAge={highestVo2Activity?.targetAge ?? selected.targetAge}
        required={highestVo2Activity?.requiredVo2 ?? selected.requiredVo2}
        decline={decline.vo2max}
        activityName={highestVo2Activity?.name ?? selected.name}
        unitSuffix=""
      />
    </div>
  );
}
