// Patient home — the daily landing surface.
//
// Layout:
//   1. Greeting strip (Hi <name>, weekday · date)
//   2. "Path to longevity" hero: progress ring of today's overall score,
//      today vs 7-day avg, 7-bar mini history.
//   3. "What to do today" grid: Diet, Training, Sleep, Supplements, Appointments.
//   4. Latest clinician message snippet (if any).
//
// Everything is driven from real data via @/lib/today-score. Domains with
// no data show neutral states and the hero adapts when nothing is set up
// yet (no diet plan, no wearable connection).
import Link from "next/link";
import {
  Apple,
  CalendarDays,
  ChevronRight,
  Dumbbell,
  MessageSquare,
  Moon,
  Pill,
  Sparkles,
} from "lucide-react";
import { requirePatient } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { DAY_LABELS, todayKey } from "@/lib/training";
import { ProgressRing } from "@/components/progress-ring";
import { getTodayScore, scoreColor, type DomainScore } from "@/lib/today-score";
import { getDosesForDate, isoDate as isoDateMed } from "@/lib/medications";
import { getNextAppointmentWithPrep, apptTypeLabel } from "@/lib/appointments";

export default async function PatientHome() {
  const user = await requirePatient();
  const [[profile], score, [todayDoses, nextAppt]] = await Promise.all([
    withAuth(user, (sql) =>
      sql`SELECT first_name FROM profiles WHERE id = ${user.id} LIMIT 1`
    ),
    getTodayScore(),
    Promise.all([
      getDosesForDate(user.id, isoDateMed(new Date()), user),
      getNextAppointmentWithPrep(user.id, user),
    ]),
  ]);

  const takenToday = todayDoses.filter((d) => d.taken).length;
  const totalDoses = todayDoses.length;
  const stackSubtitle =
    totalDoses === 0
      ? "Nothing scheduled today"
      : takenToday >= totalDoses
      ? "All doses taken today"
      : `${takenToday} of ${totalDoses} doses taken`;
  const stackScore: DomainScore = {
    value: totalDoses === 0 ? null : Math.round((takenToday / totalDoses) * 100),
    caption: stackSubtitle,
  };

  // Latest message from the clinic for the bottom note card.
  const [latestClinicianMsg] = await withAuth(user, (sql) =>
    sql`SELECT body, created_at, sender_id FROM messages WHERE patient_id = ${user.id} AND sender_role = 'clinician' ORDER BY created_at DESC LIMIT 1`
  );
  let clinicianName: string | null = null;
  if (latestClinicianMsg?.sender_id) {
    const [sender] = await withAuth(user, (sql) =>
      sql`SELECT first_name, last_name FROM profiles WHERE id = ${latestClinicianMsg.sender_id} LIMIT 1`
    );
    if (sender) {
      clinicianName = `${sender.first_name ?? ""} ${sender.last_name ?? ""}`.trim() || null;
    }
  }

  const tKey = todayKey();
  const todayDateLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  const rolling7d = average(score.history.map((d) => d.value));

  return (
    <main className="max-w-md mx-auto px-5 py-5 space-y-5 pb-6">
      <div>
        <div className="text-xs text-slate-500">Hi {profile?.first_name ?? "there"}</div>
        <div className="text-lg font-semibold text-slate-900">{todayDateLabel}</div>
      </div>

      <HeroCard
        overall={score.overall}
        rolling7d={rolling7d}
        history={score.history}
        dayLabel={DAY_LABELS[tKey]}
      />

      <div>
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-sm font-semibold text-slate-900">What to do today</div>
          <div className="text-xs text-slate-500">Tap to open</div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <SectionCard
            href="/home/diet"
            title="Diet"
            subtitle={score.diet.caption}
            score={score.diet}
            icon={<Apple size={18} />}
            iconClass="bg-orange-100 text-orange-700"
          />
          <SectionCard
            href={`/home/training/${tKey}`}
            title="Training"
            subtitle={score.training.caption}
            score={score.training}
            icon={<Dumbbell size={18} />}
            iconClass="bg-blue-100 text-blue-700"
          />
          <SectionCard
            href="/home/sleep"
            title="Sleep"
            subtitle={score.sleep.caption}
            score={score.sleep}
            icon={<Moon size={18} />}
            iconClass="bg-indigo-100 text-indigo-700"
          />
          <SectionCard
            href="/home/stack"
            title="Meds & Supplements"
            subtitle={stackScore.caption}
            score={stackScore}
            icon={<Pill size={18} />}
            iconClass="bg-violet-100 text-violet-700"
          />
          <AppointmentCard appt={nextAppt} />
        </div>
      </div>

      {latestClinicianMsg && (
        <Link
          href="/home/chat"
          className="block bg-white rounded-2xl border border-slate-200 p-4 hover:border-teal-300 transition"
        >
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-600 to-emerald-500 text-white font-semibold flex items-center justify-center text-xs flex-shrink-0">
              {initials(clinicianName)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-slate-500 flex items-center gap-1">
                  <MessageSquare size={11} /> {clinicianName ?? "Care team"} ·{" "}
                  {timeAgo(latestClinicianMsg.created_at)}
                </div>
                <ChevronRight size={14} className="text-slate-300" />
              </div>
              <div className="text-sm text-slate-800 mt-0.5 line-clamp-3">
                {latestClinicianMsg.body}
              </div>
            </div>
          </div>
        </Link>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function HeroCard({
  overall,
  rolling7d,
  history,
  dayLabel,
}: {
  overall: number | null;
  rolling7d: number | null;
  history: Array<{ date: string; value: number | null }>;
  dayLabel: string;
}) {
  const hasAnyHistory = history.some((d) => d.value != null);
  const showingNumbers = overall != null;
  const headline = pickHeadline(overall, rolling7d);

  return (
    <div className="bg-gradient-to-br from-teal-700 via-emerald-700 to-emerald-600 text-white rounded-3xl p-5 relative overflow-hidden">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-xs opacity-90">
          <Sparkles size={12} /> Your path to longevity
        </div>
        <div className="text-[10px] uppercase tracking-wide opacity-80">{dayLabel}</div>
      </div>

      {showingNumbers ? (
        <>
          <div className="mt-3 flex items-center gap-4">
            <ProgressRing
              value={overall}
              size={120}
              stroke={10}
              color="#ffffff"
              trackColor="rgba(255,255,255,0.18)"
            >
              <div className="text-4xl font-semibold text-white leading-none">{overall}</div>
              <div className="text-[10px] uppercase tracking-wide opacity-80 mt-1">Today</div>
            </ProgressRing>
            <div className="flex-1">
              <div className="text-xs opacity-80">7-day average</div>
              <div className="text-2xl font-semibold">
                {rolling7d ?? "—"}
                <span className="text-sm opacity-70"> / 100</span>
              </div>
              <div className="mt-2 text-xs opacity-90 leading-snug">{headline}</div>
            </div>
          </div>
          {hasAnyHistory && (
            <div className="mt-4 flex items-end gap-1.5 h-10">
              {history.map((d, i) => {
                const isToday = i === history.length - 1;
                const v = d.value ?? 0;
                const heightPx = (v / 100) * 28 + 4;
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className={`w-full rounded-sm ${
                        d.value == null
                          ? "bg-white/15"
                          : isToday
                          ? "bg-white"
                          : "bg-white/70"
                      }`}
                      style={{ height: `${d.value == null ? 4 : heightPx}px` }}
                    />
                    <div className={`text-[9px] ${isToday ? "font-semibold" : "opacity-70"}`}>
                      {dayLetter(d.date, isToday)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div className="mt-3">
          <div className="text-base font-semibold">Let&apos;s set up your plan.</div>
          <div className="mt-1 text-xs opacity-90 leading-snug">
            Your scoring will turn on once your clinician sets up your diet plan or you connect a tracker. Keep exploring the sections below.
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section card
// ---------------------------------------------------------------------------

function SectionCard({
  href,
  title,
  subtitle,
  score,
  icon,
  iconClass,
}: {
  href: string;
  title: string;
  subtitle: string;
  score: DomainScore;
  icon: React.ReactNode;
  iconClass: string;
}) {
  const palette = scoreColor(score.value);
  return (
    <Link
      href={href}
      className="text-left bg-white rounded-2xl p-4 border border-slate-200 hover:shadow-md transition-shadow block"
    >
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconClass}`}>
          {icon}
        </div>
        {score.value != null ? (
          <ProgressRing
            value={score.value}
            size={44}
            stroke={5}
            color={palette.ring}
            trackColor="#f1f5f9"
          >
            <div className="text-[11px] font-semibold text-slate-700">{score.value}</div>
          </ProgressRing>
        ) : (
          <ChevronRight size={16} className="text-slate-300 mt-1" />
        )}
      </div>
      <div className="mt-3 text-sm font-semibold text-slate-900">{title}</div>
      <div className="text-[11px] text-slate-500 leading-snug line-clamp-2">{subtitle}</div>
    </Link>
  );
}

function AppointmentCard({ appt }: { appt: Awaited<ReturnType<typeof getNextAppointmentWithPrep>> }) {
  if (!appt) {
    return (
      <Link
        href="/home/appointments"
        className="col-span-2 text-left bg-white rounded-2xl p-4 border border-slate-200 hover:shadow-md transition-shadow block"
      >
        <div className="flex items-start justify-between">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-teal-100 text-teal-700">
            <CalendarDays size={18} />
          </div>
          <ChevronRight size={16} className="text-slate-300 mt-1" />
        </div>
        <div className="mt-3 text-sm font-semibold text-slate-900">Appointments</div>
        <div className="text-[11px] text-slate-500 leading-snug">No upcoming appointments</div>
      </Link>
    );
  }

  const dt = new Date(appt.scheduledAt);
  const dateStr = dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const timeStr = dt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const diffMs = dt.getTime() - Date.now();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const daysLabel = diffDays === 0 ? "Today" : diffDays === 1 ? "Tomorrow" : `In ${diffDays}d`;

  return (
    <Link
      href="/home/appointments"
      className={`col-span-2 text-left bg-white rounded-2xl p-4 border hover:shadow-md transition-shadow block ${
        appt.showPrepSignal ? "border-amber-300" : "border-teal-200"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-teal-100 text-teal-700">
          <CalendarDays size={18} />
        </div>
        <div className="flex items-center gap-1.5">
          {appt.showPrepSignal && (
            <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
              Prep required
            </span>
          )}
          <span className="text-[10px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded-full">
            {daysLabel}
          </span>
        </div>
      </div>
      <div className="mt-3 text-sm font-semibold text-slate-900">
        {appt.title || apptTypeLabel(appt.type)}
      </div>
      <div className="text-[11px] text-slate-500 leading-snug">
        {dateStr} · {timeStr} · {appt.durationMinutes} min
        {appt.location ? ` · ${appt.location}` : ""}
      </div>
    </Link>
  );
}

function ComingSoonCard({
  title,
  subtitle,
  icon,
  iconClass,
  fullWidth,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  iconClass: string;
  fullWidth?: boolean;
}) {
  return (
    <div
      className={`bg-white rounded-2xl p-4 border border-dashed border-slate-200 opacity-80 ${
        fullWidth ? "col-span-2" : ""
      }`}
    >
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconClass}`}>
          {icon}
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-full">
          Coming soon
        </span>
      </div>
      <div className="mt-3 text-sm font-semibold text-slate-900">{title}</div>
      <div className="text-[11px] text-slate-500 leading-snug">{subtitle}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickHeadline(overall: number | null, rolling: number | null): string {
  const ref = rolling ?? overall;
  if (ref == null) return "Set up your plan to start tracking.";
  if (ref >= 85) return "Excellent week. Keep the streak going.";
  if (ref >= 70) return "Solid. Small wins today compound.";
  if (ref >= 50) return "Steady. A couple of quick wins lift this fast.";
  return "Let's get a few quick wins today.";
}

function dayLetter(iso: string, isToday: boolean): string {
  if (isToday) return "T";
  // iso is YYYY-MM-DD in UTC; treat at noon UTC to dodge tz edges.
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 1);
}

function average(values: Array<number | null>): number | null {
  const ns = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (ns.length === 0) return null;
  return Math.round(ns.reduce((a, b) => a + b, 0) / ns.length);
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const sec = Math.round((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  const day = Math.floor(sec / 86400);
  if (day < 7) return `${day}d`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function initials(name: string | null): string {
  if (!name) return "Dr";
  const parts = name.split(" ").filter(Boolean);
  return parts.map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}
