"use client";

import { useState } from "react";
import {
  Trophy,
  Footprints,
  Mountain,
  TrendingUp,
  Baby,
  ShoppingBag,
  Activity,
  Dumbbell,
  Move,
  ChevronDown,
} from "lucide-react";
import { TargetAgeEditor } from "./target-age-editor";
import { TrajectoryChart, projectDecline, requiredToday } from "./trajectory-chart";
import { MOBILITY_FLOOR_FOR_LEVEL } from "./hero-charts";

const ICONS: Record<string, typeof Trophy> = {
  Trophy, Footprints, Mountain, TrendingUp, Baby, ShoppingBag, Activity,
};

export type ActivityCardProps = {
  activity: {
    id: string;
    name: string;
    description: string | null;
    icon: string | null;
    accent: string | null;
    tier: "essential" | "important" | "stretch";
    requiredVo2: number;
    requiredStrengthLb: number | null;
    requiredStrengthLevel: "low" | "moderate" | "high";
    requiredMobilityLevel: "low" | "moderate" | "high";
    targetAge: number;
  };
  ageNow: number | null;
  vo2Now: number | null;
  squatNow: number | null;
  mobilityNow: number | null;
  strengthDecline: { trained: number; untrained: number };
  vo2Decline: { trained: number; untrained: number };
  mobilityDecline: { trained: number; untrained: number };
};

export function ActivityCard({
  activity,
  ageNow,
  vo2Now,
  squatNow,
  mobilityNow,
  strengthDecline,
  vo2Decline,
  mobilityDecline,
}: ActivityCardProps) {
  const [expanded, setExpanded] = useState(false);

  const Icon = (activity.icon && ICONS[activity.icon]) || Activity;
  const accent = activity.accent || "from-teal-600 to-emerald-600";
  const hasMath = ageNow != null && vo2Now != null;

  let outlook: "secure" | "trained-only" | "at-risk" | "unknown" = "unknown";
  let reqToday = 0, reqTodayUntrained = 0;
  let reqStrengthToday: number | null = null;
  if (hasMath) {
    reqToday = requiredToday(activity.requiredVo2, ageNow!, activity.targetAge, vo2Decline.trained);
    reqTodayUntrained = requiredToday(activity.requiredVo2, ageNow!, activity.targetAge, vo2Decline.untrained);
    const vo2AtTargetTrained = projectDecline(vo2Now!, ageNow!, activity.targetAge, vo2Decline.trained);
    const vo2AtTargetUntrained = projectDecline(vo2Now!, ageNow!, activity.targetAge, vo2Decline.untrained);
    const trainedReach = vo2AtTargetTrained >= activity.requiredVo2;
    const untrainedReach = vo2AtTargetUntrained >= activity.requiredVo2;
    outlook = trainedReach && untrainedReach ? "secure" : trainedReach ? "trained-only" : "at-risk";
    if (activity.requiredStrengthLb != null) {
      reqStrengthToday = requiredToday(activity.requiredStrengthLb, ageNow!, activity.targetAge, strengthDecline.trained);
    }
  }
  const tone = outlook === "secure"
    ? { ring: "border-emerald-200", chip: "bg-emerald-50 text-emerald-700 border-emerald-200", chipText: "On track" }
    : outlook === "trained-only"
    ? { ring: "border-amber-200", chip: "bg-amber-50 text-amber-700 border-amber-200", chipText: "Training-dependent" }
    : outlook === "at-risk"
    ? { ring: "border-rose-200", chip: "bg-rose-50 text-rose-700 border-rose-200", chipText: "At risk" }
    : { ring: "border-slate-200", chip: "bg-slate-100 text-slate-600 border-slate-200", chipText: "Pending baseline" };
  const tierLabel = { essential: "Essential", important: "Important", stretch: "Stretch goal" }[activity.tier];
  const meetsTrained = hasMath && vo2Now! >= reqToday;
  const meetsStrength = hasMath && squatNow != null && reqStrengthToday != null ? squatNow >= reqStrengthToday : null;

  // Toggle handler — guard against clicks bubbling out of the target-age editor input.
  const onHeaderClick = (e: React.MouseEvent) => {
    const tag = (e.target as HTMLElement).tagName.toLowerCase();
    if (tag === "input" || tag === "button" || tag === "label" || (e.target as HTMLElement).closest("button, input, label")) {
      return;
    }
    setExpanded((p) => !p);
  };

  return (
    <div className={`bg-white rounded-2xl border ${tone.ring} overflow-hidden`}>
      {/* Header — clickable */}
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="w-full text-left p-3 hover:bg-slate-50/60 transition"
        aria-expanded={expanded}
      >
        <div className="flex items-start gap-2.5">
          <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${accent} text-white flex items-center justify-center flex-shrink-0`}>
            <Icon size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="text-[12.5px] font-semibold text-slate-900 leading-snug">{activity.name}</div>
              <span className={`text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded-full border ${tone.chip}`}>
                {tone.chipText}
              </span>
            </div>
            {activity.description && (
              <div className="text-[10.5px] text-slate-500 leading-snug mt-0.5">{activity.description}</div>
            )}
            <div className="flex items-center gap-1.5 mt-1" onClick={(e) => e.stopPropagation()}>
              {tierLabel && (
                <div className="text-[9px] uppercase tracking-wide text-slate-400 font-semibold">{tierLabel}</div>
              )}
              <span className="text-[9px] text-slate-400 font-semibold">·</span>
              <span className="text-[9px] uppercase tracking-wide text-slate-500 font-semibold">Want this at</span>
              <TargetAgeEditor activityId={activity.id} initialAge={activity.targetAge} />
            </div>
          </div>
          <ChevronDown
            size={14}
            className={`text-slate-400 mt-1 flex-shrink-0 transition ${expanded ? "rotate-180" : ""}`}
          />
        </div>

        {/* Requirements at target age — always visible */}
        <div className="mt-2.5 grid grid-cols-3 gap-1.5">
          <Req label="VO₂" value={`${activity.requiredVo2}`} tone="emerald" />
          <Req
            label="Squat"
            value={activity.requiredStrengthLb != null ? `${activity.requiredStrengthLb}` : cap(activity.requiredStrengthLevel)}
            unit={activity.requiredStrengthLb != null ? "lb 1RM" : undefined}
            tone="blue"
          />
          <Req label="Mobility" value={cap(activity.requiredMobilityLevel)} tone="amber" />
        </div>
      </button>

      {/* Back-cast row — always visible */}
      {hasMath && (
        <div className="px-3 pb-3 pt-0">
          <div className="pt-2.5 border-t border-slate-100">
            <div className="text-[9.5px] uppercase tracking-wide text-slate-500 font-semibold">
              To do this at {activity.targetAge}, you need TODAY:
            </div>
            <div className="mt-1 grid grid-cols-2 gap-1.5 text-[11.5px]">
              <div className={`flex items-center justify-between bg-slate-50 rounded-md px-2 py-1 border ${meetsTrained ? "border-emerald-200" : "border-amber-200"}`}>
                <span className="text-slate-600">VO₂ trained</span>
                <span className={`font-semibold tabular-nums ${meetsTrained ? "text-emerald-700" : "text-amber-700"}`}>
                  ≥ {Math.round(reqToday)}
                </span>
              </div>
              {reqStrengthToday != null ? (
                <div className={`flex items-center justify-between bg-slate-50 rounded-md px-2 py-1 border ${meetsStrength ? "border-emerald-200" : meetsStrength === false ? "border-amber-200" : "border-slate-200"}`}>
                  <span className="text-slate-600">Squat 1RM</span>
                  <span className={`font-semibold tabular-nums ${meetsStrength ? "text-emerald-700" : meetsStrength === false ? "text-amber-700" : "text-slate-700"}`}>
                    ≥ {Math.round(reqStrengthToday)} lb
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-between bg-slate-50 rounded-md px-2 py-1 border border-slate-200">
                  <span className="text-slate-600">VO₂ sedentary</span>
                  <span className="font-semibold tabular-nums text-slate-700">≥ {Math.round(reqTodayUntrained)}</span>
                </div>
              )}
            </div>
            <div className="text-[9.5px] text-slate-500 mt-1">
              You&apos;re at {vo2Now} VO₂{squatNow != null ? ` · ${squatNow} lb squat` : ""} today.{" "}
              {meetsTrained ? "On track if you keep training." : `Need to lift VO₂ by ${Math.max(0, Math.round(reqToday - (vo2Now ?? 0)))} points.`}
            </div>
            {!expanded && (
              <div className="text-[10px] text-teal-700 font-semibold mt-1.5 flex items-center gap-1">
                <Dumbbell size={10} /> Tap to see strength &amp; mobility trajectories for this goal
              </div>
            )}
          </div>
        </div>
      )}

      {/* Expanded — strength + mobility trajectories */}
      {expanded && ageNow != null && (
        <div className="px-3 pb-3 space-y-2.5">
          <TrajectoryChart
            title={`Strength trajectory · ${activity.name}`}
            icon={<Dumbbell size={14} className="text-blue-500" />}
            yAxisLabel="squat 1RM · lb"
            yMin={0}
            yMax={Math.max(300, (squatNow ?? 0) + 50, (activity.requiredStrengthLb ?? 0) + 50)}
            yTicks={[50, 100, 150, 200, 250, 300]}
            currentValue={squatNow}
            currentLabel={squatNow != null ? `${squatNow}` : null}
            ageNow={ageNow}
            targetAge={activity.targetAge}
            required={activity.requiredStrengthLb}
            decline={strengthDecline}
            activityName={activity.name}
            unitSuffix=" lb"
          />
          <TrajectoryChart
            title={`Mobility trajectory · ${activity.name}`}
            icon={<Move size={14} className="text-amber-500" />}
            yAxisLabel="percentile"
            yMin={0}
            yMax={100}
            yTicks={[20, 40, 60, 80, 100]}
            currentValue={mobilityNow}
            currentLabel={mobilityNow != null ? `${mobilityNow}th` : null}
            ageNow={ageNow}
            targetAge={activity.targetAge}
            required={MOBILITY_FLOOR_FOR_LEVEL[activity.requiredMobilityLevel]}
            decline={mobilityDecline}
            activityName={activity.name}
            unitSuffix=""
            requiredLabel={`${activity.requiredMobilityLevel} (≥${MOBILITY_FLOOR_FOR_LEVEL[activity.requiredMobilityLevel]}th)`}
          />
        </div>
      )}
    </div>
  );
}

function Req({ label, value, unit, tone }: { label: string; value: string; unit?: string; tone: "emerald" | "blue" | "amber" }) {
  const cls =
    tone === "emerald" ? "bg-emerald-50 text-emerald-800 border-emerald-200"
    : tone === "blue"  ? "bg-blue-50 text-blue-800 border-blue-200"
    : "bg-amber-50 text-amber-800 border-amber-200";
  return (
    <div className={`rounded-lg border px-1.5 py-1.5 ${cls}`}>
      <div className="text-[8.5px] uppercase tracking-wide opacity-70 font-semibold">{label}</div>
      <div className="text-[12.5px] font-semibold tabular-nums leading-tight">{value}</div>
      {unit && <div className="text-[8.5px] opacity-70 leading-tight mt-0.5">{unit}</div>}
    </div>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
