import Link from "next/link";
import { notFound } from "next/navigation";
import { Dumbbell, Activity, Flame, Sparkles, Video, ChevronLeft } from "lucide-react";
import {
  getActiveAssignment,
  getWeekSchedule,
  getSessionDetail,
  DAY_KEYS,
  DAY_LABELS,
  type DayKey,
} from "@/lib/training";

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

export default async function PatientSessionDetail({ params }: { params: Promise<{ day: string }> }) {
  const { day: dayParam } = await params;
  const day = dayParam as DayKey;
  if (!DAY_KEYS.includes(day)) notFound();

  const assignment = await getActiveAssignment();
  if (!assignment) notFound();

  const week = await getWeekSchedule(assignment.programId);
  const todaysSlot = week.find((w) => w.day === day);
  if (!todaysSlot?.session) {
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

  const session = await getSessionDetail(todaysSlot.session.id);
  if (!session) notFound();

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
            const labels = session.kind === "mobility"
              ? { round: "Round", reps: "Hold (sec)", weight: "Reps / sides" }
              : { round: "Set", reps: "Reps", weight: "Weight (lb)" };
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

                <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                  <div className="col-span-3">{labels.round}</div>
                  <div className="col-span-4 text-center">{labels.reps}</div>
                  <div className="col-span-5 text-center">{labels.weight}</div>
                </div>
                {ex.sets.map((s) => (
                  <div key={s.id} className="grid grid-cols-12 gap-2 text-sm py-1 border-t border-slate-100">
                    <div className="col-span-3 font-medium text-slate-700">#{s.setNumber}</div>
                    <div className="col-span-4 tabular-nums text-center text-slate-800">{s.reps}</div>
                    <div className="col-span-5 tabular-nums text-center text-slate-800">{s.weight}</div>
                  </div>
                ))}
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
