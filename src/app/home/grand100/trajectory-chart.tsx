"use client";

// Reusable SVG trajectory chart — used by the hero VO₂/mobility charts at
// the top of the Grand 100 page, and by the per-activity strength chart
// embedded inside each expanded activity card.

export function TrajectoryChart({
  title,
  icon,
  yAxisLabel,
  yMin,
  yMax,
  yTicks,
  currentValue,
  currentLabel,
  ageNow,
  targetAge,
  required,
  decline,
  activityName,
  unitSuffix,
  requiredLabel,
}: {
  title: string;
  icon: React.ReactNode;
  yAxisLabel: string;
  yMin: number;
  yMax: number;
  yTicks: number[];
  currentValue: number | null;
  currentLabel: string | null;
  ageNow: number;
  targetAge: number;
  required: number | null;
  decline: { trained: number; untrained: number };
  activityName: string;
  unitSuffix: string;
  requiredLabel?: string;
}) {
  const W = 320, H = 178;
  const padL = 36, padR = 10, padT = 14, padB = 26;
  const xMin = ageNow;
  const xMax = Math.max(targetAge + 4, 100);
  const xScale = (a: number) => padL + ((a - xMin) / (xMax - xMin)) * (W - padL - padR);

  const needToday = required != null ? requiredToday(required, ageNow, targetAge, decline.trained) : null;

  // Green line starts at needToday (where they need to be now to hit the goal).
  // Grey line starts at currentValue (where they actually are, sedentary trajectory).
  const startGreen = (required != null && needToday != null && currentValue != null) ? needToday : currentValue;
  const effectiveYMax = Math.max(yMax, startGreen ?? 0);

  const yScale = (v: number) => padT + (1 - (v - yMin) / (effectiveYMax - yMin)) * (H - padT - padB);

  // Build separate trajectories.
  // Green: goal path starting at needToday. Yellow: actual trained from current. Red: sedentary from current.
  const trainedPoints: Array<{ age: number; v: number }> = [];
  const yellowPoints: Array<{ age: number; v: number }> = [];
  const untrainedPoints: Array<{ age: number; v: number }> = [];
  if (startGreen != null) {
    for (let a = ageNow; a <= xMax; a += 1) {
      trainedPoints.push({ age: a, v: projectDecline(startGreen, ageNow, a, decline.trained) });
    }
  }
  if (currentValue != null) {
    for (let a = ageNow; a <= xMax; a += 1) {
      yellowPoints.push({ age: a, v: projectDecline(currentValue, ageNow, a, decline.trained) });
      untrainedPoints.push({ age: a, v: projectDecline(currentValue, ageNow, a, decline.untrained) });
    }
  }
  const trainedPath = trainedPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.age).toFixed(1)} ${yScale(p.v).toFixed(1)}`).join(" ");
  const yellowPath = yellowPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.age).toFixed(1)} ${yScale(p.v).toFixed(1)}`).join(" ");
  const untrainedPath = untrainedPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.age).toFixed(1)} ${yScale(p.v).toFixed(1)}`).join(" ");

  const trainedAtTarget = startGreen != null ? projectDecline(startGreen, ageNow, targetAge, decline.trained) : null;
  const yellowAtTarget = currentValue != null ? projectDecline(currentValue, ageNow, targetAge, decline.trained) : null;
  const untrainedAtTarget = currentValue != null ? projectDecline(currentValue, ageNow, targetAge, decline.untrained) : null;

  let crossAge: number | null = null;
  if (required != null && currentValue != null) {
    for (let a = ageNow + 1; a <= xMax; a += 1) {
      const v = projectDecline(currentValue, ageNow, a, decline.trained);
      if (v < required) { crossAge = a; break; }
    }
  }

  const meetsAtTarget = required != null && trainedAtTarget != null ? trainedAtTarget >= required : null;

  return (
    <div className="bg-white rounded-xl p-3 border border-slate-200">
      <div className="flex items-start justify-between gap-2 mb-0.5">
        <div className="flex items-center gap-1.5">
          {icon}
          <div className="text-[13px] font-semibold text-slate-900">{title}</div>
        </div>
        {required != null && (
          <div className={`text-[9.5px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded-full border ${
            meetsAtTarget ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200"
          }`}>
            {meetsAtTarget ? "On track" : "At risk"}
          </div>
        )}
      </div>
      <div className="text-[10.5px] text-slate-500 leading-snug mb-1.5">
        For <span className="font-semibold text-slate-700">{activityName}</span> at {targetAge}
        {required != null && <> · floor is <span className="tabular-nums font-semibold">{requiredLabel ?? `${required}${unitSuffix}`}</span></>}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {yTicks.filter((t) => t >= yMin && t <= yMax).map((v) => (
          <g key={v}>
            <line x1={padL} y1={yScale(v)} x2={W - padR} y2={yScale(v)} stroke="#e2e8f0" strokeWidth="0.5" />
            <text x={padL - 4} y={yScale(v) + 3} textAnchor="end" fontSize="9" fill="#94a3b8">{v}</text>
          </g>
        ))}
        <text x={padL - 4} y={padT - 4} textAnchor="end" fontSize="8" fill="#94a3b8" fontStyle="italic">{yAxisLabel}</text>

        {Array.from(new Set([xMin, ageNow, 50, 70, 90, targetAge].filter((v) => v >= xMin && v <= xMax))).sort((a, b) => a - b).map((a) => (
          <g key={a}>
            <line x1={xScale(a)} y1={H - padB} x2={xScale(a)} y2={H - padB + 3} stroke="#94a3b8" strokeWidth="0.5" />
            <text x={xScale(a)} y={H - padB + 13} textAnchor="middle" fontSize="9" fill={a === targetAge ? "#0f172a" : "#94a3b8"} fontWeight={a === targetAge ? 700 : 400}>{a}</text>
          </g>
        ))}
        <text x={W - padR} y={H - 4} textAnchor="end" fontSize="8" fill="#94a3b8" fontStyle="italic">age</text>

        {required != null && (
          <g>
            <line
              x1={padL}
              y1={yScale(required)}
              x2={W - padR}
              y2={yScale(required)}
              stroke="#94a3b8"
              strokeWidth="1"
              strokeDasharray="4 3"
              opacity="0.6"
            />
            <text
              x={padL + 4}
              y={yScale(required) - 3}
              fontSize="9"
              fill="#64748b"
              fontWeight="600"
            >
              {requiredLabel ?? `${required}${unitSuffix}`}
            </text>
          </g>
        )}


        {currentValue != null && (
          <>
            <path d={untrainedPath} fill="none" stroke="#ef4444" strokeWidth="2" strokeDasharray="5 4" />
            <path d={yellowPath} fill="none" stroke="#eab308" strokeWidth="2" strokeDasharray="5 4" />
            <path d={trainedPath} fill="none" stroke="#0d9488" strokeWidth="2.4" />
          </>
        )}

        {startGreen != null && startGreen !== currentValue && (
          <g>
            <circle cx={xScale(ageNow)} cy={yScale(startGreen)} r="4.5" fill="#0d9488" stroke="#fff" strokeWidth="1.8" />
            <text x={xScale(ageNow) + 6} y={yScale(startGreen) - 6} fontSize="9" fill="#0f766e" fontWeight="700">
              Goal · {Math.round(startGreen)}{unitSuffix}
            </text>
          </g>
        )}

        {currentValue != null && (
          <g>
            <line x1={xScale(ageNow)} y1={padT} x2={xScale(ageNow)} y2={H - padB} stroke="#475569" strokeWidth="0.7" strokeDasharray="2 3" />
            <circle cx={xScale(ageNow)} cy={yScale(currentValue)} r="4.5" fill="#eab308" stroke="#fff" strokeWidth="1.8" />
          </g>
        )}

        {currentValue != null && (
          <g>
            <text x={W / 2} y={padT + 2} textAnchor="middle" fontSize="15" fill="#0f172a" fontWeight="700">{currentLabel}{unitSuffix}</text>
            <text x={W / 2} y={padT + 12} textAnchor="middle" fontSize="8" fill="#94a3b8">current</text>
          </g>
        )}

        <line x1={xScale(targetAge)} y1={padT} x2={xScale(targetAge)} y2={H - padB} stroke="#0f172a" strokeWidth="0.8" />
        <text x={xScale(targetAge)} y={padT + 8} textAnchor={targetAge > (xMin + xMax) / 2 ? "end" : "start"} fontSize="9" fill="#0f172a" fontWeight="700" dx={targetAge > (xMin + xMax) / 2 ? -4 : 4}>
          target {targetAge}
        </text>

        {trainedAtTarget != null && (
          <circle cx={xScale(targetAge)} cy={yScale(trainedAtTarget)} r="3.5" fill="#10b981" stroke="#fff" strokeWidth="1.5" />
        )}
        {yellowAtTarget != null && (
          <circle cx={xScale(targetAge)} cy={yScale(yellowAtTarget)} r="3.5" fill="#eab308" stroke="#fff" strokeWidth="1.5" />
        )}
        {untrainedAtTarget != null && (
          <circle cx={xScale(targetAge)} cy={yScale(untrainedAtTarget)} r="3" fill="#ef4444" stroke="#fff" strokeWidth="1.2" />
        )}

      </svg>

      <div className="mt-1.5 flex items-center gap-x-2.5 gap-y-0.5 text-[10px] text-slate-600 flex-wrap">
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-teal-600" /> Goal path</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-yellow-400" /> If you train</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-red-400" /> If sedentary</span>
        {required != null && <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-slate-400" /> Floor</span>}
      </div>

      {currentValue != null && required != null && (
        <div className={`mt-1.5 text-[10.5px] leading-snug ${meetsAtTarget ? "text-emerald-700" : "text-rose-700"}`}>
          {meetsAtTarget
            ? <>You&apos;re at or above the goal path. Keep training and you&apos;ll project to <span className="tabular-nums font-semibold">{Math.round(trainedAtTarget!)}{unitSuffix}</span> at {targetAge} — above the {required}{unitSuffix} floor.</>
            : <>The green line shows where you need to be today (<span className="tabular-nums font-semibold">{Math.round(needToday ?? required)}{unitSuffix}</span>) to hit this goal. You&apos;re currently {Math.round(needToday! - (currentValue ?? 0))} points below that path.</>
          }
        </div>
      )}
      {currentValue == null && (
        <div className="mt-1.5 text-[10.5px] leading-snug text-slate-500">
          No baseline measurement yet — your clinician will record this on your next visit.
        </div>
      )}
    </div>
  );
}

export function projectDecline(current: number, currentAge: number, targetAge: number, pctPerDecade: number): number {
  const decades = (targetAge - currentAge) / 10;
  return current * Math.pow(1 - pctPerDecade / 100, decades);
}
export function requiredToday(target: number, currentAge: number, targetAge: number, pctPerDecade: number): number {
  const decades = (targetAge - currentAge) / 10;
  const factor = Math.pow(1 - pctPerDecade / 100, decades);
  if (factor <= 0) return target;
  return target / factor;
}
