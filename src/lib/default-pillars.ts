// Default pillars + starter factors applied to a new patient. Editable per
// patient afterward (rename/hide/reorder pillars, add/edit/remove factors).
// To change what every new patient starts with, edit this list.
import { serviceRoleSql } from "@/lib/db/connection";

type FactorWeight = "low" | "medium" | "high";

type DefaultFactor = {
  name: string;
  unit?: string;
  goal?: string;
  weight?: FactorWeight;
};

type DefaultPillar = {
  kind: "cv" | "metabolic" | "neuro" | "cancer" | "physical" | "endocrine";
  name: string;
  description: string;
  factors: DefaultFactor[];
};

export const DEFAULT_PILLARS: DefaultPillar[] = [
  {
    kind: "cv",
    name: "Cardiovascular",
    description: "Risk for heart attack, stroke, and vascular disease.",
    factors: [
      { name: "ApoB", unit: "mg/dL", goal: "<60", weight: "high" },
      { name: "Lp(a)", unit: "nmol/L", goal: "<75", weight: "high" },
      { name: "LDL-C", unit: "mg/dL", goal: "<70", weight: "medium" },
      { name: "Triglycerides", unit: "mg/dL", goal: "<100", weight: "medium" },
      { name: "Blood pressure (systolic)", unit: "mmHg", goal: "<120", weight: "medium" },
    ],
  },
  {
    kind: "metabolic",
    name: "Metabolic",
    description: "Risk for type 2 diabetes, NAFLD, and metabolic syndrome.",
    factors: [
      { name: "HbA1c", unit: "%", goal: "<5.4", weight: "high" },
      { name: "Fasting glucose", unit: "mg/dL", goal: "<90", weight: "medium" },
      { name: "Fasting insulin", unit: "µIU/mL", goal: "<6", weight: "high" },
      { name: "HOMA-IR", goal: "<1.5", weight: "medium" },
      { name: "Waist circumference", unit: "in", weight: "medium" },
    ],
  },
  {
    kind: "neuro",
    name: "Neurodegenerative",
    description: "Risk for Alzheimer's disease and related dementias.",
    factors: [
      { name: "ApoE genotype", weight: "high" },
      { name: "Homocysteine", unit: "µmol/L", goal: "<9", weight: "medium" },
      { name: "Omega-3 index", unit: "%", goal: ">8", weight: "medium" },
      { name: "Vitamin B12", unit: "pg/mL", goal: ">500", weight: "low" },
      { name: "Sleep quality", weight: "medium" },
    ],
  },
  {
    kind: "cancer",
    name: "Cancer",
    description: "Risk for the most common cancers — lifestyle, screening, family history.",
    factors: [
      { name: "Colon cancer screening", weight: "high" },
      { name: "Family history", weight: "medium" },
      { name: "Skin exam", weight: "low" },
      { name: "Smoking status", weight: "medium" },
    ],
  },
  {
    kind: "physical",
    name: "Physical",
    description: "VO₂ max, strength, proprioception, and bone health.",
    factors: [
      { name: "VO₂ max", unit: "mL/kg/min", weight: "high" },
      { name: "Grip strength", unit: "kg", weight: "medium" },
      { name: "Bone density (DEXA T-score)", weight: "medium" },
      { name: "Leg strength", weight: "medium" },
      { name: "Body fat", unit: "%", weight: "low" },
    ],
  },
  {
    kind: "endocrine",
    name: "Endocrine",
    description: "Hormone balance — thyroid, sex hormones, cortisol, IGF-1.",
    factors: [
      { name: "TSH", unit: "µIU/mL", goal: "1–2", weight: "medium" },
      { name: "Free T4", unit: "ng/dL", weight: "low" },
      { name: "Testosterone", unit: "ng/dL", weight: "medium" },
      { name: "Vitamin D", unit: "ng/mL", goal: "40–60", weight: "medium" },
      { name: "IGF-1", unit: "ng/mL", weight: "low" },
    ],
  },
];

// Create the default pillars + starter factors for a patient. No-op if the
// patient already has any pillars. Uses the service role (bypasses RLS) —
// callers are trusted server actions that resolved the clinic themselves.
export async function seedDefaultPillars(clinicId: string, patientId: string): Promise<number> {
  const [existing] = await serviceRoleSql<{ n: string }[]>`
    SELECT count(*)::text AS n FROM public.pillars WHERE patient_id = ${patientId}
  `;
  if (parseInt(existing?.n ?? "0", 10) > 0) return 0;

  let created = 0;
  for (let i = 0; i < DEFAULT_PILLARS.length; i++) {
    const p = DEFAULT_PILLARS[i];
    const [pillar] = await serviceRoleSql<{ id: string }[]>`
      INSERT INTO public.pillars (clinic_id, patient_id, kind, name, description, sort_order)
      VALUES (${clinicId}, ${patientId}, ${p.kind}, ${p.name}, ${p.description}, ${i})
      RETURNING id
    `;
    created++;
    for (let j = 0; j < p.factors.length; j++) {
      const f = p.factors[j];
      await serviceRoleSql`
        INSERT INTO public.pillar_factors
          (clinic_id, patient_id, pillar_id, name, unit, goal, status, weight, sort_order)
        VALUES (${clinicId}, ${patientId}, ${pillar.id}, ${f.name}, ${f.unit ?? null}, ${f.goal ?? null},
                'borderline', ${f.weight ?? "medium"}, ${j})
      `;
    }
  }
  return created;
}
