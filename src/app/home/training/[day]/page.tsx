import Link from "next/link";
import { notFound } from "next/navigation";
import { Dumbbell, Activity, Flame, Sparkles, Video, ChevronLeft } from "lucide-react";
import {
  getActiveAssignment,
  getWeekSchedule,
  getSessionDetail,
  getSetLogsForSession,
  DAY_KEYS,
  DAY_LABELS,
  type DayKey,
} from "@/lib/training";
import { SetLogger } from "./set-logger";

const KIND_ICON = {
  strength: Dumbbell, zone2: Activity, vo2max: Flame, mobility: Sparkles,
} as const;
const KIND_LABEL = {
  strength: "Strength", zone2: "Zone 2", vo2max: "VO₂ max", mobility: "Mobility",
} as const;
const KIND_TILE = {
  strength: "from-blue-600 to-cyan-600",
  zone2:    "from-teal-500 to-cyan-600",
  vo2max:   "from-rose-500 to-red-600",
  mobility: "from-amber-500 to-orange-500",
} as const;

export default async function PatientSessionDetail({
  params,
  searchParams,
}: {
  params: Promise<{ day: string }>;
  searchParams: Promise<{ s?: string }>;
}) {
  const { day: dayParam } = await params;
  const { s } = await searchParams;
  const day = dayParam as DayKey;
  if (!DAY_KEYS.includes(day)) notFound();

  const assignment = await getActiveAssignment();
  if (!assignment) {
    return (
      <main className="max-w-md mx-auto px-5 py-5 space-y-4">
        <Link href="/home/training" className="text-sm text-teal-700 inline-flex items-center gap-1">
          <ChevronLeft size={14} /> Back to week
        </Link>
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-5 text-center">
          <div className="text-sm font-semibold text-slate-900">No training program yet</div>
          <div className="text-[12px] text-slate-500 leading-snug mt-1">
            Your clinician hasn&apos;t assigned a program. Check back after your next visit.
          </div>
        </div>
      </main>
    );
  }

  const week = await getWeekSchedule(assignment.programId);
  const slot = week.find((w) => w.day === day);
  const daySessions = slot?.sessions ?? [];

  if (daySessions.length === 0) {
    return (
      <main className="max-w-md mx-auto px-5 py-5 space-y-4">
        <Link href="/home/training" className="text-sm text-teal-700 inline-flex items-center gap-1">
          <ChevronLeft size={14} /> Back to week
        </Link>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="text-xs uppercase tracking-wide text-slate-500">{DAY_LABELS[day]}</div>
          <div className="text-base font-semibold text-slate-900 mt-1">Rest day</div>
          <div className="text-[12px] text-slate-500 leading-snug mt-1">
            Nothing scheduled. Recovery is part of the plan.
          </div>
        </div>
      </main>
    );
  }

  // Choose which session to show: explicit ?s=, otherwise the only one.
  let picked = s ? daySessions.find((x) => x.id === s) : undefined;
  if (!picked && daySessions.length === 1) picked = daySessions[0];

  // Multiple sessions and none specified — let the patient pick.
  if (!picked) {
    return (
      <main className="max-w-md mx-auto px-5 py-5 space-y-4">
        <Link href="/home/training" className="text-sm text-teal-700 inline-flex items-center gap-1">
          <ChevronLeft size={14} /> Back to week
        </Link>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">{DAY_LABELS[day]}</div>
          <div className="text-base font-semibold text-slate-900">{daySessions.length} sessions today</div>
        </div>
        <div className="space-y-2">
          {daySessions.map((sx) => {
            const Icon = KIND_ICON[sx.kind];
            const gradient = sx.accent || KIND_TILE[sx.kind];
            return (
              <Link
                key={sx.id}
                href={`/home/training/${day}?s=${sx.id}`}
                className="block rounded-2xl border border-slate-200 bg-white p-3 flex items-center gap-3 hover:border-teal-300"
              >
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${gradient} text-white flex items-center justify-center flex-shrink-0`}>
                  <Icon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-900 truncate">{sx.name}</div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {KIND_LABEL[sx.kind]} · {sx.focus || `~${sx.estMinutes}m`}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    );
  }

  const session = await getSessionDetail(picked.id);
  if (!session) notFound();

  // Patient's logged actuals for today (strength/mobility only).
  const logDate = new Date().toISOString().slice(0, 10);
  const setLogs =
    session.kind === "strength" || session.kind === "mobility"
      ? await getSetLogsForSession(session.id, logDate)
      : {};

  const Icon = KIND_ICON[session.kind];
  const gradient = session.accent || KIND_TILE[session.kind];

  return (
    <main className="max-w-md mx-auto px-5 py-5 space-y-4 pb-12">
      <Link href="/home/training" className="text-sm text-teal-700 inline-flex items-center gap-1">
        <ChevronLeft size={14} /> Back to week
      </Link>

      {/* Hero */}
      <div className={`rounded-3xl p-5 text-white bg-gradient-to-br ${gradient}`}>
        <div className="text-[10px] uppercase tracking-wide opacity-90">{DAY_LABELS[day]}</div>
        <div className="flex items-center gap-3 mt-2">
          <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <Icon size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xl font-semibold leading-tight">{session.name}</div>
            <div className="text-[12px] opacity-90 mt-0.5">
              {KIND_LABEL[session.kind]} · {session.focus || `~${session.estMinutes}m`}
            </div>
          </div>
        </div>
        <div className="text-[11px] opacity-80 mt-3">Est. {session.estMinutes} minutes</div>
      </div>

      {session.coachNote && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 text-[13px] text-slate-700 leading-snug">
          <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Coach note</div>
          {session.coachNote}
        </div>
      )}

      {/* Zone 2 body */}
      {session.kind === "zone2" && (
        <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Steady aerobic block</div>
          <KV label="Modality" value={session.modality || "Cardio"} />
          <KV label="Duration" value={`${session.durationMin ?? session.estMinutes} min`} />
          {session.targetZone && (
            <KV
              label="Target HR"
              value={`${session.targetZone.shortName} · ${session.targetZone.lowBpm}–${session.targetZone.highBpm} bpm`}
            />
          )}
        </section>
      )}

      {/* VO2 max body */}
      {session.kind === "vo2max" && (
        <section className="space-y-2">
          <ProtoBlock title="Warm-up" minutes={session.warmupMin ?? 0} zone={session.recoverZone} />
          <div className="bg-rose-50/60 border border-rose-200 rounded-2xl p-3 space-y-2">
            <div className="text-[10px] uppercase tracking-wide text-rose-700 font-semibold">Work intervals</div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="Rounds" value={`${session.rounds ?? 0}`} />
              <Stat label="Work" value={`${session.workMin ?? 0}m`} />
              <Stat label="Recovery" value={`${session.recoverMin ?? 0}m`} />
            </div>
            {session.workZone && (
              <div className="text-[12px] text-rose-800">
                Work zone: <span className="font-semibold">{session.workZone.shortName} · {session.workZone.lowBpm}–{session.workZone.highBpm} bpm</span>
              </div>
            )}
            {session.recoverZone && (
              <div className="text-[12px] text-slate-700">
                Recovery zone: <span className="font-semibold">{session.recoverZone.shortName} · {session.recoverZone.lowBpm}–{session.recoverZone.highBpm} bpm</span>
              </div>
            )}
          </div>
          <ProtoBlock title="Cool-down" minutes={session.cooldownMin ?? 0} zone={session.recoverZone} />
        </section>
      )}

      {/* Strength / mobility body */}
      {(session.kind === "strength" || session.kind === "mobility") && (
        <section className="space-y-2">
          <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold px-1">
            {session.kind === "mobility" ? "Mobility moves" : "Exercises"}
          </div>
          {session.exercises.length === 0 && (
            <div className="text-sm text-slate-500 italic py-6 text-center bg-white rounded-xl border border-dashed border-slate-200">
              Nothing scheduled.
            </div>
          )}
          {session.exercises.map((ex, idx) => {
            const accent = session.kind === "mobility" ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200";
            return (
              <div key={ex.id} className={`rounded-2xl border p-3 ${accent}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0 ${
                    session.kind === "mobility" ? "bg-amber-200 text-amber-800" : "bg-slate-200 text-slate-700"
                  }`}>
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">{ex.name}</div>
                    <div className="text-[11px] text-slate-500 truncate flex items-center gap-2">
                      {ex.primaryArea && <span>{ex.primaryArea}</span>}
                      {ex.videoTitle && (
                        <span className="flex items-center gap-1 text-violet-700">
                          <Video size={11} /> {ex.videoLength || "video"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {ex.coachNote && (
                  <div className="text-[12px] text-slate-600 mb-2 leading-snug">
                    {ex.coachNote}
                  </div>
                )}

                {ex.sets.length > 0 && (
                  <SetLogger
                    kind={session.kind === "mobility" ? "mobility" : "strength"}
                    sessionId={session.id}
                    day={day}
                    logDate={logDate}
                    sets={ex.sets}
                    logs={setLogs}
                  />
                )}
              </div>
            );
          })}
        </section>
      )}
    </main>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 last:border-0 pb-2 last:pb-0">
      <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">{label}</div>
      <div className="text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/60 rounded-lg py-1.5">
      <div className="text-base font-semibold text-slate-900 tabular-nums leading-tight">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-600 font-semibold">{label}</div>
    </div>
  );
}

function ProtoBlock({ title, minutes, zone }: { title: string; minutes: number; zone: { shortName: string; lowBpm: number; highBpm: number } | null }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 flex items-center gap-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold flex-1">{title}</div>
      <div className="text-sm font-semibold text-slate-800 tabular-nums">{minutes}m</div>
      {zone && (
        <div className="text-[11px] text-slate-500">{zone.shortName}</div>
      )}
    </div>
  );
}
