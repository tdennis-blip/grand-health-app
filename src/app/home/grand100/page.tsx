import { Trophy, Target } from "lucide-react";
import {
  getMyGrand100,
  projectDecline,
  requiredToday,
  GRAND100_DECLINE,
} from "@/lib/grand100";
import { requirePatient } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { HeroCharts, type ChartActivity } from "./hero-charts";
import { ActivityCard } from "./activity-card";

export default async function PatientGrand100() {
  const user = await requirePatient();

  const [{ ageNow, baseline, activities }, [profile]] = await Promise.all([
    getMyGrand100(),
    withAuth(user, (sql) => sql`SELECT first_name FROM profiles WHERE id = ${user.id} LIMIT 1`),
  ]);

  const vo2Now = baseline?.vo2Now ?? null;
  const squatNow = baseline?.squat1rmLb ?? null;
  const mobilityNow = baseline?.mobilityPercentile ?? null;
  const hasAge = ageNow != null;

  // Hero stat: project to age 100 (the namesake — keep these prominent regardless of per-activity target ages).
  const vo2At100Trained = hasAge && vo2Now != null
    ? projectDecline(vo2Now, ageNow!, 100, GRAND100_DECLINE.vo2max.trained)
    : null;
  const vo2At100Untrained = hasAge && vo2Now != null
    ? projectDecline(vo2Now, ageNow!, 100, GRAND100_DECLINE.vo2max.untrained)
    : null;

  const chartActivities: ChartActivity[] = activities.map((a) => ({
    id: a.id,
    name: a.name,
    icon: a.icon,
    accent: a.accent,
    requiredVo2: a.requiredVo2,
    requiredStrengthLb: a.requiredStrengthLb,
    requiredMobilityLevel: a.requiredMobilityLevel,
    targetAge: a.targetAge,
  }));

  return (
    <main className="p-4 space-y-3">
      <div>
        <div className="text-[10px] uppercase tracking-wide text-slate-500">Long game</div>
        <div className="text-lg font-semibold text-slate-900 flex items-center gap-1.5">
          <Trophy size={16} className="text-amber-600" /> Grand 100
        </div>
      </div>

      {/* Hero */}
      <div className="bg-white border-2 border-slate-900 rounded-2xl p-4 relative overflow-hidden">
        <div className="text-[10px] uppercase tracking-wide text-slate-500">{profile?.first_name ?? "You"} at 100</div>
        <div className="text-[12px] text-slate-700 leading-snug mt-1.5">
          The goal isn&apos;t to live to 100 — it&apos;s to do the things you love when you get there.
        </div>
        {hasAge && vo2Now != null ? (
          <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-center">
            <Stat label="VO₂ now" value={`${vo2Now}`} sub="" color="slate" />
            <Stat label="At 100 · trained" value={`${Math.round(vo2At100Trained!)}`} sub={`${GRAND100_DECLINE.vo2max.trained}%/dec`} color="yellow" />
            <Stat label="At 100 · sedentary" value={`${Math.round(vo2At100Untrained!)}`} sub={`${GRAND100_DECLINE.vo2max.untrained}%/dec`} color="red" />
          </div>
        ) : (
          <div className="mt-2.5 text-[10.5px] text-slate-500 leading-snug">
            {ageNow == null ? "Your date of birth isn't on file yet. " : ""}
            {vo2Now == null ? "Your VO₂ max baseline hasn't been measured yet. " : ""}
            Your clinician will fill these in during your next visit so we can start tracking your trajectory.
          </div>
        )}
      </div>

      {/* Hero chart — VO₂ only (strength + mobility live inside each activity card) */}
      {hasAge ? (
        <HeroCharts
          ageNow={ageNow!}
          vo2Now={vo2Now}
          activities={chartActivities}
          decline={{ vo2max: GRAND100_DECLINE.vo2max }}
        />
      ) : (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500 italic">
          Add your date of birth in Me to unlock the trajectory graphs.
        </div>
      )}

      {/* Activity goals — each expands to show its own strength trajectory */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[13px] font-semibold text-slate-900">What you want to do at 100</div>
            <div className="text-[10.5px] text-slate-500">Tap a goal to see its strength trajectory. Tap the age chip to change when.</div>
          </div>
        </div>
        {activities.length === 0 ? (
          <div className="text-sm text-slate-500 italic bg-white rounded-xl border border-dashed border-slate-200 p-4 text-center">
            No activities configured yet. Your clinician will set these up.
          </div>
        ) : (
          activities.map((a) => (
            <ActivityCard
              key={a.id}
              activity={{
                id: a.id,
                name: a.name,
                description: a.description,
                icon: a.icon,
                accent: a.accent,
                tier: a.tier,
                requiredVo2: a.requiredVo2,
                requiredStrengthLb: a.requiredStrengthLb,
                requiredStrengthLevel: a.requiredStrengthLevel,
                requiredMobilityLevel: a.requiredMobilityLevel,
                targetAge: a.targetAge,
              }}
              ageNow={ageNow}
              vo2Now={vo2Now}
              squatNow={squatNow}
              mobilityNow={mobilityNow}
              strengthDecline={GRAND100_DECLINE.strength}
              vo2Decline={GRAND100_DECLINE.vo2max}
              mobilityDecline={GRAND100_DECLINE.mobility}
            />
          ))
        )}
      </div>

      {/* Today's targets summary — uses each activity's own target age */}
      {hasAge && vo2Now != null && activities.length > 0 && (
        <div className="bg-slate-900 text-white rounded-2xl p-3.5">
          <div className="text-[10px] uppercase tracking-wide opacity-80 flex items-center gap-1.5">
            <Target size={11} /> Today&apos;s targets
          </div>
          <div className="text-[13px] font-semibold mt-1 leading-snug">
            To stay above the activities you care about at the ages you picked, here&apos;s what you need now:
          </div>
          <div className="mt-2.5 space-y-1.5">
            {activities.filter((a) => a.tier !== "stretch").map((a) => {
              const target = requiredToday(a.requiredVo2, ageNow!, a.targetAge, GRAND100_DECLINE.vo2max.trained);
              const meets = vo2Now! >= target;
              return (
                <div key={a.id} className="flex items-center justify-between gap-2">
                  <div className="text-[12px] truncate flex-1">{a.name} <span className="opacity-60">· @{a.targetAge}</span></div>
                  <div className="text-[11px] tabular-nums flex items-center gap-1.5">
                    <span className={meets ? "text-emerald-300" : "text-amber-300"}>
                      VO₂ {Math.round(target)}+
                    </span>
                    <span className={`w-1.5 h-1.5 rounded-full ${meets ? "bg-emerald-400" : "bg-amber-400"}`} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2.5 text-[10.5px] opacity-80 leading-snug">
            You&apos;re at VO₂ {vo2Now} today. Training keeps the curve flat — sedentary doubles the slope.
          </div>
        </div>
      )}
    </main>
  );
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub: string; color: "slate" | "yellow" | "red" }) {
  const valueColor = color === "yellow" ? "text-yellow-600" : color === "red" ? "text-red-500" : "text-slate-900";
  const bgColor = color === "yellow" ? "bg-yellow-50 border border-yellow-200" : color === "red" ? "bg-red-50 border border-red-200" : "bg-slate-50 border border-slate-200";
  return (
    <div className={`${bgColor} rounded-lg py-1.5`}>
      <div className="text-[9px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${valueColor}`}>{value}</div>
      {sub && <div className="text-[9px] text-slate-400">{sub}</div>}
    </div>
  );
}
