"use client";

import { useMemo, useState } from "react";
import { Check, X, Dumbbell, Activity, Flame, Sparkles } from "lucide-react";
import type { MonitorDay, MonitorItem, ModalityKind, Exercise1RM } from "@/lib/training-analytics";

const MODALITY: Record<ModalityKind, { label: string; color: string; Icon: typeof Dumbbell }> = {
  strength: { label: "Strength", color: "#0d9488", Icon: Dumbbell },
  zone2:    { label: "Zone 2",   color: "#0284c7", Icon: Activity },
  vo2max:   { label: "VO₂ max",  color: "#e11d48", Icon: Flame },
  mobility: { label: "Movement", color: "#7c3aed", Icon: Sparkles },
};

const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long", month: "short", day: "numeric", year: "numeric",
  });
}

// One colored dot per modality: filled = done, hollow = prescribed-but-missed.
function ModalityDot({ item, active, onClick }: { item: MonitorItem; active: boolean; onClick: () => void }) {
  const { color, label } = MODALITY[item.kind];
  const title = `${item.sessionName} · ${label} · ${item.done ? "completed" : item.prescribed ? "missed" : "logged"}`;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`w-3.5 h-3.5 rounded-full border-2 transition-transform hover:scale-110 ${active ? "ring-2 ring-offset-1 ring-slate-400" : ""}`}
      style={{
        borderColor: color,
        backgroundColor: item.done ? color : "transparent",
      }}
    />
  );
}

export function TrainingMonitor({
  days,
  hasProgram,
  exercises,
}: {
  days: MonitorDay[];
  hasProgram: boolean;
  exercises: Exercise1RM[];
}) {
  const weeks = useMemo(() => {
    const out: MonitorDay[][] = [];
    for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7));
    return out;
  }, [days]);

  const [selected, setSelected] = useState<{ date: string; item: MonitorItem } | null>(null);

  return (
    <div className="space-y-6">
      {/* Calendar */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="text-sm font-semibold text-slate-900">Prescribed training calendar</div>
        <div className="text-[11px] text-slate-500 mb-3">
          {hasProgram
            ? "Last 4 weeks. Each dot is a session — filled = completed, hollow = prescribed but missed. Click a dot for details."
            : "No active program — showing any logged sessions. Click a dot for details."}
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {DOW_LABELS.map((d) => (
            <div key={d} className="text-[10px] uppercase tracking-wide text-slate-400 text-center">{d}</div>
          ))}
        </div>

        <div className="space-y-1">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-1">
              {week.map((day) => {
                const dayNum = new Date(`${day.date}T00:00:00Z`).getUTCDate();
                return (
                  <div key={day.date} className="min-h-[52px] rounded-lg border border-slate-100 bg-slate-50/50 p-1">
                    <div className="text-[9px] text-slate-400 leading-none mb-1">{dayNum}</div>
                    <div className="flex flex-wrap gap-1">
                      {day.items.map((item) => (
                        <ModalityDot
                          key={item.sessionId}
                          item={item}
                          active={selected?.date === day.date && selected?.item.sessionId === item.sessionId}
                          onClick={() => setSelected({ date: day.date, item })}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 pt-3 border-t border-slate-100">
          {(Object.keys(MODALITY) as ModalityKind[]).map((k) => (
            <span key={k} className="text-[10px] text-slate-500 inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full border-2" style={{ borderColor: MODALITY[k].color, backgroundColor: MODALITY[k].color }} />
              {MODALITY[k].label}
            </span>
          ))}
          <span className="text-[10px] text-slate-400 inline-flex items-center gap-1 ml-auto">
            <span className="w-2.5 h-2.5 rounded-full border-2 border-slate-400 bg-transparent" /> missed
          </span>
        </div>
      </section>

      {/* Detail panel */}
      {selected && <SessionDetail date={selected.date} item={selected.item} onClose={() => setSelected(null)} />}

      {/* 1RM dropdown */}
      <OneRmExplorer exercises={exercises} />
    </div>
  );
}

function SessionDetail({ date, item, onClose }: { date: string; item: MonitorItem; onClose: () => void }) {
  const { label, color, Icon } = MODALITY[item.kind];
  const statusLabel = item.done ? "Completed" : item.prescribed ? "Missed" : "Logged";
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <Icon size={15} style={{ color }} /> {item.sessionName}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">{fmtDate(date)} · {label}</div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
              item.done ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
            }`}
          >
            {item.done ? <Check size={12} /> : <X size={12} />} {statusLabel}
          </span>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" title="Close">
            <X size={16} />
          </button>
        </div>
      </div>

      {item.minutes != null && (
        <div className="text-[13px] text-slate-700 mb-3">
          <span className="font-semibold">{item.minutes}</span> min logged
        </div>
      )}

      {(item.rpe != null || item.comment) && (
        <div className="mb-3 rounded-xl bg-teal-50 border border-teal-100 p-3">
          <div className="text-[10px] uppercase tracking-wide text-teal-700 font-semibold mb-1">
            Patient notes{item.rpe != null ? ` · RPE ${item.rpe}/10` : ""}
          </div>
          {item.comment
            ? <div className="text-[13px] text-slate-700 leading-snug">{item.comment}</div>
            : <div className="text-[13px] text-slate-400 italic">No comment</div>}
        </div>
      )}

      {item.sets.length > 0 ? (
        <div className="space-y-1">
          <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
            <div className="col-span-5">Exercise</div>
            <div className="col-span-2 text-center">Set</div>
            <div className="col-span-2 text-center">Prescribed</div>
            <div className="col-span-2 text-center">Actual</div>
            <div className="col-span-1 text-center">Done</div>
          </div>
          {item.sets.map((s, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 text-[13px] py-1 border-t border-slate-100 items-center">
              <div className="col-span-5 text-slate-700 truncate">{s.exercise}</div>
              <div className="col-span-2 text-center font-medium text-slate-600">#{s.setNumber}</div>
              <div className="col-span-2 text-center tabular-nums text-slate-400">{s.target}</div>
              <div className="col-span-2 text-center tabular-nums text-slate-900 font-semibold">{s.actual}</div>
              <div className="col-span-1 flex justify-center">
                {s.done ? <Check size={14} className="text-teal-600" /> : <span className="text-slate-300">–</span>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        item.minutes == null && (
          <div className="text-[13px] text-slate-400 italic">
            {item.prescribed ? "Nothing logged for this session." : "No set detail."}
          </div>
        )
      )}
    </section>
  );
}

function OneRmExplorer({ exercises }: { exercises: Exercise1RM[] }) {
  const withData = useMemo(() => exercises.filter((e) => e.points.length > 0), [exercises]);
  const [selectedId, setSelectedId] = useState<string>(withData[0]?.exerciseId ?? "");
  const ex = withData.find((e) => e.exerciseId === selectedId) ?? withData[0];

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">Estimated 1-rep max</div>
          <div className="text-[11px] text-slate-500">Heaviest set per session (≤12 reps), Epley: weight × (1 + reps/30)</div>
        </div>
        {withData.length > 0 && (
          <select
            value={ex?.exerciseId ?? ""}
            onChange={(e) => setSelectedId(e.target.value)}
            className="text-[13px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-200"
          >
            {withData.map((e) => (
              <option key={e.exerciseId} value={e.exerciseId}>{e.name}</option>
            ))}
          </select>
        )}
      </div>

      {!ex ? (
        <div className="text-[12px] text-slate-400 italic py-6 text-center">No weighted sets logged yet.</div>
      ) : (
        <OneRmChart points={ex.points} name={ex.name} />
      )}
    </section>
  );
}

function OneRmChart({ points, name }: { points: { date: string; oneRm: number }[]; name: string }) {
  const W = 520, H = 170, padL = 34, padR = 10, padT = 10, padB = 22;
  const vals = points.map((p) => p.oneRm);
  const maxV = vals.length ? Math.max(...vals) : 1;
  const max = maxV <= 0 ? 1 : maxV * 1.1;
  const n = points.length;
  const xAt = (i: number) => padL + (n <= 1 ? 0 : (i * (W - padL - padR)) / (n - 1));
  const yAt = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  const short = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  const latest = points[points.length - 1]?.oneRm;
  const first = points[0]?.oneRm;
  const delta = latest != null && first != null ? latest - first : null;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <div className="text-[12px] font-semibold text-slate-700">{name}</div>
        <div className="text-[11px] text-slate-500 tabular-nums">
          {latest} lb est.
          {delta != null && delta !== 0 && (
            <span className={delta > 0 ? "text-emerald-600" : "text-rose-600"}>
              {" "}({delta > 0 ? "+" : ""}{delta})
            </span>
          )}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        {[0, max / 2, max].map((gv, i) => (
          <g key={i}>
            <line x1={padL} y1={yAt(gv)} x2={W - padR} y2={yAt(gv)} stroke="#e2e8f0" strokeWidth="0.6" />
            <text x={padL - 4} y={yAt(gv) + 3} textAnchor="end" fontSize="8" fill="#94a3b8">{Math.round(gv)}</text>
          </g>
        ))}
        {n > 1 && (
          <polyline
            points={points.map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.oneRm).toFixed(1)}`).join(" ")}
            fill="none" stroke="#2563eb" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round"
          />
        )}
        {points.map((p, i) => (
          <circle key={i} cx={xAt(i)} cy={yAt(p.oneRm)} r="2.2" fill="#2563eb" />
        ))}
        {n > 0 && (
          <>
            <text x={xAt(0)} y={H - 6} textAnchor="start" fontSize="8" fill="#94a3b8">{short(points[0].date)}</text>
            {n > 1 && <text x={xAt(n - 1)} y={H - 6} textAnchor="end" fontSize="8" fill="#94a3b8">{short(points[n - 1].date)}</text>}
          </>
        )}
      </svg>
      <div className="text-[10px] text-slate-400 text-right">lb (est. 1RM)</div>
    </div>
  );
}
