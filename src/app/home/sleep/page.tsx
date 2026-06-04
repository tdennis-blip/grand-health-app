// Patient sleep dashboard.
//
// Layout:
//   1. Header
//   2. "Last night" hero — duration, efficiency, HRV, recovery, sleep score
//   3. 7-day duration bars vs goal
//   4. 30-day trend lines (duration, efficiency, recovery, HRV)
//   5. Tips / next steps
//
// Data comes from public.wearable_daily_metrics via getSleepSummary. If no
// tracker is connected we render a clean empty state pointing at the
// integrations page.
import Link from "next/link";
import {
  Moon,
  HeartPulse,
  Activity,
  Gauge,
  Plug,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { requirePatient } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import {
  getSleepSummary,
  formatSleepDuration,
  hasAnyConnection,
  prettyProvider,
  type SleepNight,
} from "@/lib/wearables/queries";
import { getJournalForDate } from "@/lib/sleep-journal";
import { JournalForm } from "./journal-form";

export default async function PatientSleep() {
  const user = await requirePatient();
  const todayIso = todayLocalIsoDate();

  const [[profile], connected, summary, journalToday] = await Promise.all([
    withAuth(user, (sql) => sql`SELECT first_name FROM profiles WHERE id = ${user.id} LIMIT 1`),
    hasAnyConnection(user.id),
    getSleepSummary(user.id, 30),
    getJournalForDate(user.id, todayIso, user),
  ]);

  const last = summary.last;
  const goalMin = summary.durationGoalMinutes;

  return (
    <main className="max-w-md mx-auto p-4 space-y-3">
      <div>
        <div className="text-[10px] uppercase tracking-wide text-slate-500">Rest & recovery</div>
        <div className="text-lg font-semibold text-slate-900 flex items-center gap-1.5">
          <Moon size={16} className="text-indigo-600" /> Sleep
        </div>
        <div className="text-[11px] text-slate-500 mt-0.5">
          Hi {profile?.first_name ?? "there"} — your tracker syncs every morning. Most adults need 7–9 hours.
        </div>
      </div>

      {!connected && <EmptyState />}

      {connected && last != null && (
        <>
          {/* Last night hero */}
          <LastNightHero
            night={last}
            goalMin={goalMin}
          />

          {/* 7-day duration bars */}
          <SevenDayBars nights={summary.shortTrend} goalMin={goalMin} />
        </>
      )}

      {connected && last == null && <WaitingForSync />}

      {/* Patient-entered journal — always visible. Works whether or not a
          tracker is connected. */}
      <JournalForm entryDate={todayIso} initial={journalToday} />

      {connected && last != null && (
        <>
          {/* 30-day summary stats */}
          <ThirtyDaySummary summary={summary} />

          {/* 30-day trend lines */}
          <ThirtyDayTrends nights={summary.longTrend} />

          {/* Tips */}
          <Tips
            avgDurationMin={summary.avgDurationMin}
            avgEfficiencyPct={summary.avgEfficiencyPct}
            avgRecovery={summary.avgRecoveryScore}
            nightsMeetingGoal={summary.nightsMeetingDurationGoal}
            windowDays={summary.windowDays}
          />
        </>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Empty states
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <Link
      href="/home/profile/integrations"
      className="block bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-600 text-white rounded-2xl p-4 hover:shadow-lg transition"
    >
      <div className="text-[10px] uppercase tracking-wide opacity-90 flex items-center gap-1">
        <Plug size={11} /> Connect a tracker
      </div>
      <div className="text-base font-semibold mt-1.5">No sleep data yet</div>
      <div className="text-[11.5px] opacity-90 leading-snug mt-1">
        Link your Oura or Whoop in Integrations to start sending nightly sleep,
        HRV, and recovery to this page and to your care team.
      </div>
      <div className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold bg-white/15 rounded-lg px-2.5 py-1.5">
        Open integrations <ChevronRight size={12} />
      </div>
    </Link>
  );
}

function WaitingForSync() {
  return (
    <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-4 text-center">
      <div className="text-[12px] text-slate-500 leading-snug">
        Your tracker is connected but we haven&apos;t received a night of sleep yet.
        It typically lands shortly after you wake up.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Last night hero
// ---------------------------------------------------------------------------

function LastNightHero({
  night,
  goalMin,
}: {
  night: SleepNight;
  goalMin: number;
}) {
  const dur = night.durationMin ?? 0;
  const pct = Math.min(1, dur / goalMin);
  // Heuristic "headline" score: average of the things we have.
  const parts: number[] = [];
  if (night.durationMin != null) parts.push(Math.min(1, night.durationMin / goalMin) * 100);
  if (night.efficiencyPct != null) parts.push(Math.min(100, night.efficiencyPct));
  if (night.recoveryScore != null) parts.push(Math.min(100, night.recoveryScore));
  const headline = parts.length > 0 ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : null;

  const meets = night.durationMin != null && night.durationMin >= goalMin;
  const dateLabel = formatDateLabel(night.date);

  return (
    <div className="bg-gradient-to-br from-indigo-700 via-violet-700 to-purple-700 text-white rounded-2xl p-4 relative overflow-hidden">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wide opacity-90 flex items-center gap-1">
          <Moon size={11} /> Last night · {dateLabel}
        </div>
        {night.provider && (
          <div className="text-[9px] uppercase tracking-wide opacity-75 bg-white/15 rounded-full px-1.5 py-0.5">
            {prettyProvider(night.provider)}
          </div>
        )}
      </div>

      <div className="mt-2 flex items-end gap-3">
        <div>
          <div className="text-3xl font-semibold tabular-nums leading-none">
            {formatSleepDuration(night.durationMin) ?? "—"}
          </div>
          <div className="text-[10.5px] opacity-85 mt-1">
            {meets ? "Met your 7h floor" : night.durationMin != null
              ? `${Math.round((goalMin - night.durationMin) / 60 * 10) / 10}h short of 7h goal`
              : "Duration not reported"}
          </div>
        </div>
        {headline != null && (
          <div className="ml-auto text-right">
            <div className="text-[10px] uppercase tracking-wide opacity-80">Score</div>
            <div className="text-2xl font-semibold tabular-nums leading-none">{headline}</div>
            <div className="text-[10px] opacity-75">/ 100</div>
          </div>
        )}
      </div>

      {/* duration bar vs goal */}
      <div className="mt-3">
        <div className="h-2 bg-white/15 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${meets ? "bg-emerald-300" : "bg-white"}`}
            style={{ width: `${Math.round(pct * 100)}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[9.5px] opacity-80 tabular-nums">
          <span>0h</span>
          <span>Goal · 7h</span>
          <span>10h</span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
        <HeroStat
          icon={<Gauge size={11} />}
          label="Efficiency"
          value={night.efficiencyPct != null ? `${Math.round(night.efficiencyPct)}%` : "—"}
        />
        <HeroStat
          icon={<HeartPulse size={11} />}
          label="HRV"
          value={night.hrvMs != null ? `${Math.round(night.hrvMs)}ms` : "—"}
        />
        <HeroStat
          icon={<Activity size={11} />}
          label="Recovery"
          value={night.recoveryScore != null ? String(Math.round(night.recoveryScore)) : "—"}
        />
      </div>
    </div>
  );
}

function HeroStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-white/15 rounded-lg py-1.5">
      <div className="text-[9px] uppercase tracking-wide opacity-90 flex items-center justify-center gap-1">
        {icon} {label}
      </div>
      <div className="text-[13px] font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 7-day bars
// ---------------------------------------------------------------------------

function SevenDayBars({
  nights,
  goalMin,
}: {
  nights: SleepNight[];
  goalMin: number;
}) {
  const yMax = 10 * 60; // 10h ceiling
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-3.5">
      <div className="flex items-baseline justify-between">
        <div className="text-[13px] font-semibold text-slate-900">Last 7 nights</div>
        <div className="text-[10px] text-slate-500">vs 7h goal</div>
      </div>
      <div className="mt-3 flex items-end gap-1.5 h-24">
        {nights.map((n) => {
          const v = n.durationMin ?? 0;
          const heightPct = Math.min(1, v / yMax);
          const meets = n.durationMin != null && n.durationMin >= goalMin;
          const isMissing = n.durationMin == null;
          return (
            <div key={n.date} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex-1 flex items-end">
                <div
                  className={`w-full rounded-md transition-all ${
                    isMissing
                      ? "bg-slate-100"
                      : meets
                      ? "bg-emerald-500"
                      : "bg-indigo-400"
                  }`}
                  style={{ height: isMissing ? "4px" : `${Math.max(6, heightPct * 100)}%` }}
                  title={isMissing ? "No data" : `${formatSleepDuration(n.durationMin) ?? ""}`}
                />
              </div>
              <div className="text-[9px] text-slate-500">{dayLetter(n.date)}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-emerald-500" /> ≥ 7h
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-indigo-400" /> below
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-slate-100 border border-slate-200" /> no data
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 30-day summary tiles
// ---------------------------------------------------------------------------

function ThirtyDaySummary({
  summary,
}: {
  summary: {
    windowDays: number;
    nightsWithData: number;
    avgDurationMin: number | null;
    avgEfficiencyPct: number | null;
    avgRecoveryScore: number | null;
    avgHrvMs: number | null;
    avgRestingHrBpm: number | null;
    nightsMeetingDurationGoal: number;
  };
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-3.5">
      <div className="flex items-baseline justify-between">
        <div className="text-[13px] font-semibold text-slate-900">30-day averages</div>
        <div className="text-[10px] text-slate-500">{summary.nightsWithData} nights of data</div>
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        <SummaryTile
          label="Sleep"
          value={summary.avgDurationMin != null
            ? formatSleepDuration(Math.round(summary.avgDurationMin)) ?? "—"
            : "—"}
          tone="indigo"
        />
        <SummaryTile
          label="Efficiency"
          value={summary.avgEfficiencyPct != null ? `${Math.round(summary.avgEfficiencyPct)}%` : "—"}
          tone="emerald"
        />
        <SummaryTile
          label="Recovery"
          value={summary.avgRecoveryScore != null ? String(Math.round(summary.avgRecoveryScore)) : "—"}
          tone="violet"
        />
        <SummaryTile
          label="HRV"
          value={summary.avgHrvMs != null ? `${Math.round(summary.avgHrvMs)}ms` : "—"}
          tone="rose"
        />
        <SummaryTile
          label="Resting HR"
          value={summary.avgRestingHrBpm != null ? `${Math.round(summary.avgRestingHrBpm)}` : "—"}
          unit="bpm"
          tone="amber"
        />
        <SummaryTile
          label="≥ 7h nights"
          value={`${summary.nightsMeetingDurationGoal}`}
          unit={`/ ${summary.windowDays}`}
          tone="teal"
        />
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit?: string;
  tone: "indigo" | "emerald" | "violet" | "rose" | "amber" | "teal";
}) {
  const cls =
    tone === "indigo" ? "bg-indigo-50 text-indigo-800 border-indigo-200"
    : tone === "emerald" ? "bg-emerald-50 text-emerald-800 border-emerald-200"
    : tone === "violet" ? "bg-violet-50 text-violet-800 border-violet-200"
    : tone === "rose" ? "bg-rose-50 text-rose-800 border-rose-200"
    : tone === "amber" ? "bg-amber-50 text-amber-800 border-amber-200"
    : "bg-teal-50 text-teal-800 border-teal-200";
  return (
    <div className={`rounded-lg border px-1.5 py-1.5 ${cls}`}>
      <div className="text-[8.5px] uppercase tracking-wide opacity-70 font-semibold">{label}</div>
      <div className="text-[12.5px] font-semibold tabular-nums leading-tight">{value}</div>
      {unit && <div className="text-[8.5px] opacity-70 leading-tight mt-0.5">{unit}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 30-day trend chart
// ---------------------------------------------------------------------------

function ThirtyDayTrends({ nights }: { nights: SleepNight[] }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-3.5 space-y-3">
      <div className="text-[13px] font-semibold text-slate-900">30-day trends</div>
      <TrendLine
        title="Sleep duration"
        values={nights.map((n) => n.durationMin)}
        unit="h"
        formatter={(v) => `${(v / 60).toFixed(1)}h`}
        color="#6366f1"
        bgColor="#e0e7ff"
        goal={7 * 60}
        yMin={0}
        yMax={10 * 60}
      />
      <TrendLine
        title="Efficiency"
        values={nights.map((n) => n.efficiencyPct)}
        unit="%"
        formatter={(v) => `${Math.round(v)}%`}
        color="#10b981"
        bgColor="#d1fae5"
        yMin={50}
        yMax={100}
      />
      <TrendLine
        title="Recovery"
        values={nights.map((n) => n.recoveryScore)}
        unit=""
        formatter={(v) => `${Math.round(v)}`}
        color="#8b5cf6"
        bgColor="#ede9fe"
        yMin={0}
        yMax={100}
      />
      <TrendLine
        title="HRV"
        values={nights.map((n) => n.hrvMs)}
        unit="ms"
        formatter={(v) => `${Math.round(v)}ms`}
        color="#f43f5e"
        bgColor="#ffe4e6"
      />
    </div>
  );
}

function TrendLine({
  title,
  values,
  formatter,
  color,
  bgColor,
  goal,
  yMin: yMinProp,
  yMax: yMaxProp,
}: {
  title: string;
  values: (number | null)[];
  unit: string;
  formatter: (v: number) => string;
  color: string;
  bgColor: string;
  goal?: number;
  yMin?: number;
  yMax?: number;
}) {
  const W = 320;
  const H = 60;
  const padL = 2;
  const padR = 2;
  const padT = 4;
  const padB = 4;

  const finite = values.filter((v): v is number => v != null && Number.isFinite(v));
  const last = [...values].reverse().find((v): v is number => v != null);

  if (finite.length < 2) {
    return (
      <div>
        <div className="flex items-baseline justify-between">
          <div className="text-[11px] text-slate-600 font-semibold">{title}</div>
          <div className="text-[10px] text-slate-400">Not enough data</div>
        </div>
        <div className="h-10 mt-1 rounded-md bg-slate-50" />
      </div>
    );
  }

  const min = yMinProp ?? Math.min(...finite);
  const max = yMaxProp ?? Math.max(...finite);
  const range = max - min || 1;

  const stepX = (W - padL - padR) / Math.max(1, values.length - 1);
  const xAt = (i: number) => padL + i * stepX;
  const yAt = (v: number) => padT + (1 - (v - min) / range) * (H - padT - padB);

  // Build path with gaps for null values.
  const segments: string[] = [];
  let segment: string[] = [];
  values.forEach((v, i) => {
    if (v == null || !Number.isFinite(v)) {
      if (segment.length > 0) {
        segments.push(segment.join(" "));
        segment = [];
      }
      return;
    }
    const x = xAt(i).toFixed(1);
    const y = yAt(v).toFixed(1);
    segment.push(segment.length === 0 ? `M${x},${y}` : `L${x},${y}`);
  });
  if (segment.length > 0) segments.push(segment.join(" "));

  // Filled area below the line (per segment)
  const areaSegments: string[] = [];
  segment = [];
  let segStartIdx = -1;
  values.forEach((v, i) => {
    if (v == null || !Number.isFinite(v)) {
      if (segment.length > 0 && segStartIdx >= 0) {
        const startX = xAt(segStartIdx).toFixed(1);
        const endX = xAt(i - 1).toFixed(1);
        const bottomY = (H - padB).toFixed(1);
        areaSegments.push(
          `M${startX},${bottomY} ` + segment.join(" ") + ` L${endX},${bottomY} Z`
        );
        segment = [];
        segStartIdx = -1;
      }
      return;
    }
    const x = xAt(i).toFixed(1);
    const y = yAt(v).toFixed(1);
    if (segStartIdx < 0) segStartIdx = i;
    segment.push(segment.length === 0 ? `M${x},${y}` : `L${x},${y}`);
  });
  if (segment.length > 0 && segStartIdx >= 0) {
    const startX = xAt(segStartIdx).toFixed(1);
    const endX = xAt(values.length - 1).toFixed(1);
    const bottomY = (H - padB).toFixed(1);
    areaSegments.push(
      `M${startX},${bottomY} ` + segment.join(" ") + ` L${endX},${bottomY} Z`
    );
  }

  const goalY = goal != null && goal >= min && goal <= max ? yAt(goal) : null;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div className="text-[11px] text-slate-600 font-semibold">{title}</div>
        <div className="text-[10.5px] text-slate-500 tabular-nums">
          {last != null ? formatter(last) : "—"}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full mt-1" preserveAspectRatio="none">
        {goalY != null && (
          <line
            x1={padL}
            y1={goalY}
            x2={W - padR}
            y2={goalY}
            stroke="#94a3b8"
            strokeWidth="0.6"
            strokeDasharray="3 3"
          />
        )}
        {areaSegments.map((d, i) => (
          <path key={i} d={d} fill={bgColor} fillOpacity="0.5" />
        ))}
        {segments.map((d, i) => (
          <path key={i} d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        ))}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tips
// ---------------------------------------------------------------------------

function Tips({
  avgDurationMin,
  avgEfficiencyPct,
  avgRecovery,
  nightsMeetingGoal,
  windowDays,
}: {
  avgDurationMin: number | null;
  avgEfficiencyPct: number | null;
  avgRecovery: number | null;
  nightsMeetingGoal: number;
  windowDays: number;
}) {
  const tips: { title: string; body: string }[] = [];

  const goalRate = nightsMeetingGoal / Math.max(1, windowDays);

  if (avgDurationMin != null && avgDurationMin < 7 * 60) {
    const shortMin = 7 * 60 - avgDurationMin;
    tips.push({
      title: "Aim for an earlier lights-out",
      body: `You're averaging ${Math.round(shortMin)} minutes below the 7h floor. Shift bedtime ~${Math.round(shortMin / 2)} min earlier and protect the morning rise time.`,
    });
  }

  if (avgEfficiencyPct != null && avgEfficiencyPct < 85) {
    tips.push({
      title: "Tighten sleep efficiency",
      body: `Average efficiency is ${Math.round(avgEfficiencyPct)}%. Cooler room (65-68°F), dimming screens 60 min before bed, and consistent wake time usually move this fastest.`,
    });
  }

  if (avgRecovery != null && avgRecovery < 60) {
    tips.push({
      title: "Recovery is running low",
      body: `Your 30-day recovery average is ${Math.round(avgRecovery)}. Stack a lighter training day after two reds, and prioritize hydration + protein on those mornings.`,
    });
  }

  if (goalRate < 0.5 && windowDays >= 7) {
    tips.push({
      title: "Build the 7-hour streak",
      body: `Only ${nightsMeetingGoal} of ${windowDays} nights hit 7h. Pick a target bedtime, set a wind-down alarm 45 min before, and treat it like any other appointment.`,
    });
  }

  if (tips.length === 0) {
    tips.push({
      title: "You're in a great groove",
      body: `Your sleep is consistent across the window — keep your wake time steady on weekends to lock it in.`,
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-3.5 space-y-2.5">
      <div className="text-[13px] font-semibold text-slate-900 flex items-center gap-1.5">
        <Sparkles size={13} className="text-indigo-500" /> Next steps
      </div>
      {tips.slice(0, 3).map((t, i) => (
        <div key={i} className="bg-slate-50 rounded-lg p-2.5">
          <div className="text-[12px] font-semibold text-slate-900">{t.title}</div>
          <div className="text-[11px] text-slate-600 leading-snug mt-0.5">{t.body}</div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dayLetter(iso: string): string {
  // iso is YYYY-MM-DD in UTC; render in local tz at noon UTC to avoid tz edges.
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 1);
}

function formatDateLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function todayLocalIsoDate(): string {
  // Local-timezone YYYY-MM-DD — the journal is keyed on the patient's
  // wake-up date so we want their local calendar.
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
