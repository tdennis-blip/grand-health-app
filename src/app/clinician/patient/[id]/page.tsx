import Link from "next/link";
import { requireClinician } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { ProgramAssignments } from "./program-assignments";
import { DietPlanCard } from "./diet/diet-plan-card";
import { AdherencePanel } from "./diet/adherence-panel";
import { getRecentFoodLogs, buildDaySlots, deriveTargets } from "@/lib/diet";
import { PillarVisibilityToggle } from "./pillar/pillar-visibility-toggle";
import { Grand100BaselineCard } from "./grand100/grand100-baseline-card";
import { TargetAgesCard, type TargetRow } from "./grand100/target-ages-card";
import { ageFromDob } from "@/lib/grand100";
import { WearableTrendCard } from "./wearable-trend-card";
import { StackSummaryCard } from "./stack/stack-summary-card";
import { AppointmentsCard } from "./appointments/appointments-card";
import { getPatientAppointmentsForClinician, getClinicAppointmentTypes } from "@/lib/appointments";

export default async function PatientDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireClinician();
  const [patientRaw] = await withAuth(user, (sql) =>
    sql`
      SELECT pp.profile_id, pp.date_of_birth, pp.sex, pp.height_cm, pp.weight_kg,
             p.email, p.first_name, p.last_name
      FROM patient_profiles pp
      JOIN profiles p ON p.id = pp.profile_id
      WHERE pp.profile_id = ${id}
      LIMIT 1
    `
  );
  const patient = patientRaw ? {
    profile_id: patientRaw.profile_id,
    date_of_birth: patientRaw.date_of_birth,
    sex: patientRaw.sex,
    height_cm: patientRaw.height_cm,
    weight_kg: patientRaw.weight_kg,
  } : null;

  if (!patient) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-6">
        <Link href="/clinician/dashboard" className="text-sm text-teal-700">&larr; Back</Link>
        <div className="mt-4 text-sm text-slate-600">Patient not found, or you don&apos;t have access.</div>
      </main>
    );
  }

  const [pillars, dietPlanRows, grand100Baseline_rows, g100Activities, g100Targets,
         recentLogs, patientAppointments, customApptTypes] = await Promise.all([
    withAuth(user, (sql) =>
      sql`SELECT id, name, kind, description, hidden FROM pillars WHERE patient_id = ${id} ORDER BY sort_order ASC`
    ),
    withAuth(user, (sql) =>
      sql`SELECT * FROM diet_plans WHERE patient_id = ${id} LIMIT 1`
    ),
    withAuth(user, (sql) =>
      sql`SELECT vo2_now, grip_kg, squat_1rm_lb, strength_percentile, mobility_percentile, measured_on FROM grand100_baselines WHERE patient_id = ${id} LIMIT 1`
    ),
    withAuth(user, (sql) =>
      sql`SELECT id, name, tier, required_vo2, required_strength_lb, sort_order FROM grand100_activities WHERE hidden = false ORDER BY sort_order ASC`
    ),
    withAuth(user, (sql) =>
      sql`SELECT activity_id, target_age FROM grand100_patient_targets WHERE patient_id = ${id}`
    ),
    getRecentFoodLogs(id, 7, user),
    getPatientAppointmentsForClinician(id, user),
    getClinicAppointmentTypes(user),
  ]);

  const grand100Baseline = grand100Baseline_rows[0] ?? null;
  const dietPlan = dietPlanRows[0] ?? null;

  const targetAgeByActivity = new Map<string, number>(
    g100Targets.map((t: any) => [t.activity_id, t.target_age])
  );
  const targetRows: TargetRow[] = g100Activities.map((a: any) => ({
    activityId: a.id,
    activityName: a.name,
    tier: a.tier,
    targetAge: targetAgeByActivity.get(a.id) ?? 100,
    isExplicit: targetAgeByActivity.has(a.id),
  }));

  const baselineActivities = g100Activities.map((a: any) => ({
    id: a.id,
    name: a.name,
    requiredVo2: a.required_vo2,
    requiredStrengthLb: a.required_strength_lb ?? null,
    targetAge: targetAgeByActivity.get(a.id) ?? 100,
  }));
  const adherenceSlots = buildDaySlots(recentLogs, 7);
  const adherenceTargets = dietPlan
    ? (() => {
        const t = deriveTargets({
          rmrValue: dietPlan.rmr_value,
          rmrMethod: dietPlan.rmr_method,
          rmrMeasuredOn: dietPlan.rmr_measured_on,
          rmrMeasuredBy: dietPlan.rmr_measured_by,
          activityMultiplier: Number(dietPlan.activity_multiplier),
          deficitKcal: dietPlan.deficit_kcal,
          proteinPerKg: Number(dietPlan.protein_per_kg),
          carbsPct: dietPlan.carbs_pct,
          fatPct: dietPlan.fat_pct,
          fiberG: dietPlan.fiber_g,
          mealsPerDay: dietPlan.meals_per_day,
          waterL: Number(dietPlan.water_l),
          notes: dietPlan.notes,
        }, patient.weight_kg);
        return {
          goalKcal: t.goalKcal,
          proteinG: t.proteinG,
          carbsG: t.carbsG,
          fatG: t.fatG,
          fiberG: t.fiberG,
        };
      })()
    : null;

  const [assignments, programs] = await Promise.all([
    withAuth(user, (sql) =>
      sql`
        SELECT pa.id, pa.assigned_at, pa.ended_at,
               pl.id AS program_id, pl.name AS program_name, pl.description AS program_description
        FROM program_assignments pa
        JOIN program_library pl ON pl.id = pa.program_id
        WHERE pa.patient_id = ${id}
        ORDER BY pa.assigned_at DESC
      `
    ),
    withAuth(user, (sql) =>
      sql`SELECT id, name FROM program_library ORDER BY name ASC`
    ),
  ]);

  const profile = patientRaw;
  return (
    <main className="max-w-3xl mx-auto px-6 py-6 space-y-5">
      <Link href="/clinician/dashboard" className="text-sm text-teal-700">&larr; Back to panel</Link>
      <div>
        <div className="text-xs uppercase tracking-wide text-slate-500">Patient</div>
        <div className="text-xl font-semibold text-slate-900">
          {profile?.first_name} {profile?.last_name}
        </div>
        <div className="text-xs text-slate-500">{profile?.email}</div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Kv k="DOB"    v={patient.date_of_birth ?? "—"} />
        <Kv k="Sex"    v={patient.sex ?? "—"} />
        <Kv k="Height" v={patient.height_cm ? `${patient.height_cm} cm` : "—"} />
        <Kv k="Weight" v={patient.weight_kg ? `${patient.weight_kg} kg` : "—"} />
      </div>

      <WearableTrendCard patientId={id} />

      <AdherencePanel slots={adherenceSlots} targets={adherenceTargets} />

      <DietPlanCard
        patientId={id}
        weightKg={patient.weight_kg}
        initial={dietPlan ? {
          rmrValue: dietPlan.rmr_value,
          rmrMethod: dietPlan.rmr_method,
          rmrMeasuredOn: dietPlan.rmr_measured_on,
          rmrMeasuredBy: dietPlan.rmr_measured_by,
          activityMultiplier: Number(dietPlan.activity_multiplier),
          deficitKcal: dietPlan.deficit_kcal,
          proteinPerKg: Number(dietPlan.protein_per_kg),
          carbsPct: dietPlan.carbs_pct,
          fatPct: dietPlan.fat_pct,
          fiberG: dietPlan.fiber_g,
          mealsPerDay: dietPlan.meals_per_day,
          waterL: Number(dietPlan.water_l),
          notes: dietPlan.notes,
        } : null}
      />

      <Grand100BaselineCard
        patientId={id}
        initial={grand100Baseline ? {
          vo2Now: grand100Baseline.vo2_now,
          gripKg: grand100Baseline.grip_kg,
          squat1rmLb: grand100Baseline.squat_1rm_lb,
          strengthPercentile: grand100Baseline.strength_percentile,
          mobilityPercentile: grand100Baseline.mobility_percentile,
          measuredOn: grand100Baseline.measured_on,
        } : null}
        ageNow={ageFromDob(patient.date_of_birth)}
        activities={baselineActivities}
      />

      <TargetAgesCard patientId={id} initial={targetRows} />

      <StackSummaryCard patientId={id} />

      <AppointmentsCard patientId={id} initial={patientAppointments} customTypes={customApptTypes} />

      <ProgramAssignments
        patientId={id}
        assignments={assignments.map((a: any) => ({
          id: a.id,
          assignedAt: a.assigned_at,
          endedAt: a.ended_at,
          program: a.program_id ? { id: a.program_id, name: a.program_name, description: a.program_description } : null,
        }))}
        programs={programs.map((p: any) => ({ id: p.id, name: p.name }))}
      />

      <div>
        <div className="text-sm font-semibold text-slate-900 mb-2">Pillars</div>
        <div className="text-[11px] text-slate-500 mb-2">
          Click any pillar to edit. Toggle visibility to show or hide a pillar in the patient&apos;s app.
        </div>
        <div className="space-y-2">
          {(pillars || []).map((p: any) => (
            <div
              key={p.id}
              className={`rounded-xl border p-3 transition ${
                p.hidden ? "bg-slate-50 border-slate-200 opacity-70" : "bg-white border-slate-200 hover:border-teal-300"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <Link
                  href={`/clinician/patient/${id}/pillar/${p.id}`}
                  className="flex-1 min-w-0"
                >
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold text-slate-900 truncate">{p.name}</div>
                    {p.hidden && (
                      <span className="text-[10px] uppercase tracking-wide font-semibold text-slate-500 bg-slate-200 border border-slate-300 px-1.5 py-0.5 rounded-full">
                        Hidden
                      </span>
                    )}
                  </div>
                  {p.description && <div className="text-[11px] text-slate-500 line-clamp-2">{p.description}</div>}
                </Link>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <PillarVisibilityToggle
                    pillarId={p.id}
                    patientId={id}
                    hidden={p.hidden}
                  />
                  <Link
                    href={`/clinician/patient/${id}/pillar/${p.id}`}
                    className="text-teal-700 text-xs"
                  >
                    Edit →
                  </Link>
                </div>
              </div>
            </div>
          ))}
          {(!pillars || pillars.length === 0) && (
            <div className="text-sm text-slate-500 italic">No pillars yet for this patient.</div>
          )}
        </div>
      </div>
    </main>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{k}</div>
      <div className="text-sm font-semibold text-slate-900 mt-0.5">{v}</div>
    </div>
  );
}
