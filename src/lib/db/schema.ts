// Drizzle schema for the Grand Health Postgres database.
//
// Conventions:
//  - Primary keys are uuid, defaulted on the database side.
//  - Every PHI-touching table carries `clinic_id` and (where applicable)
//    `patient_id` so Row Level Security policies can do a single-column filter.
//  - Timestamps are timestamptz; created_at + updated_at on every table.
//  - The `profiles` table maps 1:1 with Supabase's `auth.users`. Foreign key
//    to auth.users is enforced in the SQL migration (drizzle doesn't see
//    schemas it doesn't own).

import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  boolean,
  timestamp,
  date,
  pgEnum,
  primaryKey,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ----------------------------------------------------------------------
// Enums
// ----------------------------------------------------------------------

export const userRole = pgEnum("user_role", ["clinician", "patient"]);
export const pillarKind = pgEnum("pillar_kind", [
  "cv",
  "metabolic",
  "neuro",
  "cancer",
  "physical",
  "endocrine",
]);
export const factorStatus = pgEnum("factor_status", [
  "on-target",
  "borderline",
  "off-target",
]);
export const factorWeight = pgEnum("factor_weight", ["low", "medium", "high"]);
export const exerciseKind = pgEnum("exercise_kind", ["strength", "mobility"]);
export const sessionKind = pgEnum("session_kind", ["strength", "zone2", "vo2max", "mobility"]);
export const dayKey = pgEnum("day_key", ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
export const wearableProvider = pgEnum("wearable_provider", [
  "oura",
  "whoop",
  "apple_health",
  "eight_sleep",
]);
export const wearableConnectionStatus = pgEnum("wearable_connection_status", [
  "active",
  "revoked",
  "error",
]);

// ----------------------------------------------------------------------
// Clinic + identity
// ----------------------------------------------------------------------

export const clinics = pgTable("clinics", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// One row per Supabase auth.users user. `id` MUST equal auth.users.id.
// FK to auth.users is enforced via raw SQL in the migration.
export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").primaryKey(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "restrict" }),
    role: userRole("role").notNull(),
    email: text("email").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    clinicIdx: index("profiles_clinic_idx").on(t.clinicId),
  })
);

export const patientProfiles = pgTable("patient_profiles", {
  profileId: uuid("profile_id")
    .primaryKey()
    .references(() => profiles.id, { onDelete: "cascade" }),
  clinicId: uuid("clinic_id")
    .notNull()
    .references(() => clinics.id, { onDelete: "restrict" }),
  // Demographics
  dateOfBirth: text("date_of_birth"), // ISO date string; we don't need time
  sex: text("sex"), // male | female | other / decline — kept loose
  heightCm: integer("height_cm"),
  weightKg: integer("weight_kg"),
  // Care metadata
  primaryClinicianId: uuid("primary_clinician_id").references(() => profiles.id),
  memberSince: timestamp("member_since", { withTimezone: true }).defaultNow().notNull(),
  // Patient-level pillar configuration (which optional pillars are on, factor flags like apoe4)
  pillarConfig: jsonb("pillar_config").default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const clinicianProfiles = pgTable("clinician_profiles", {
  profileId: uuid("profile_id")
    .primaryKey()
    .references(() => profiles.id, { onDelete: "cascade" }),
  clinicId: uuid("clinic_id")
    .notNull()
    .references(() => clinics.id, { onDelete: "restrict" }),
  title: text("title"), // "Dr.", "PA", "RN", etc.
  credentials: text("credentials"), // "MD, PhD"
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ----------------------------------------------------------------------
// Pillars (per-patient instances of the Pillars of Health)
// ----------------------------------------------------------------------

export const pillars = pgTable(
  "pillars",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "restrict" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    kind: pillarKind("kind").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    clinicianNote: text("clinician_note"),
    hidden: boolean("hidden").default(false).notNull(),
    // Display order among this patient's pillars
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    patientIdx: index("pillars_patient_idx").on(t.patientId),
  })
);

// Each row is one risk/marker (e.g. ApoB) attached to one patient's pillar.
// Time-series of observed values goes in factor_observations.
export const pillarFactors = pgTable(
  "pillar_factors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "restrict" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    pillarId: uuid("pillar_id")
      .notNull()
      .references(() => pillars.id, { onDelete: "cascade" }),
    // Optional pointer to the clinic-wide library entry this came from
    libraryFactorId: uuid("library_factor_id").references(() => riskFactorLibrary.id),
    name: text("name").notNull(),
    currentValue: text("current_value"), // text so we can hold "118/74" etc.
    unit: text("unit"),
    goal: text("goal"),
    status: factorStatus("status").default("borderline").notNull(),
    weight: factorWeight("weight").default("medium").notNull(),
    source: text("source"),
    note: text("note"),
    hidden: boolean("hidden").default(false).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pillarIdx: index("pillar_factors_pillar_idx").on(t.pillarId),
    patientIdx: index("pillar_factors_patient_idx").on(t.patientId),
  })
);

// Time-series of factor values. One row per draw / observation.
export const factorObservations = pgTable(
  "factor_observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "restrict" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    factorId: uuid("factor_id")
      .notNull()
      .references(() => pillarFactors.id, { onDelete: "cascade" }),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    value: text("value").notNull(), // text for flexibility (e.g. "118/74")
    numericValue: integer("numeric_value"), // optional parsed numeric for charts
    source: text("source"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    factorIdx: index("factor_observations_factor_idx").on(t.factorId),
  })
);

// ----------------------------------------------------------------------
// Per-pillar lifestyle drivers (modifiable behaviors)
// ----------------------------------------------------------------------

export const lifestyleDrivers = pgTable(
  "lifestyle_drivers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "restrict" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    pillarId: uuid("pillar_id")
      .notNull()
      .references(() => pillars.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    note: text("note"),
    hidden: boolean("hidden").default(false).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pillarIdx: index("lifestyle_drivers_pillar_idx").on(t.pillarId),
    patientIdx: index("lifestyle_drivers_patient_idx").on(t.patientId),
  })
);

// ----------------------------------------------------------------------
// Per-pillar recommendations (action items the patient sees)
// ----------------------------------------------------------------------

export const pillarRecommendations = pgTable(
  "pillar_recommendations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "restrict" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    pillarId: uuid("pillar_id")
      .notNull()
      .references(() => pillars.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    why: text("why"),
    cadence: text("cadence"),
    status: text("status").default("active").notNull(), // 'active' | 'review' | 'paused'
    link: text("link"),
    hidden: boolean("hidden").default(false).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pillarIdx: index("pillar_recs_pillar_idx").on(t.pillarId),
    patientIdx: index("pillar_recs_patient_idx").on(t.patientId),
  })
);

// ----------------------------------------------------------------------
// Risk-factor library (clinic-wide reusable definitions + saved sets)
// ----------------------------------------------------------------------

export const riskFactorLibrary = pgTable("risk_factor_library", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id")
    .notNull()
    .references(() => clinics.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  unit: text("unit"),
  defaultGoal: text("default_goal"),
  weight: factorWeight("weight").default("medium").notNull(),
  defaultStatus: factorStatus("default_status").default("borderline").notNull(),
  source: text("source"),
  note: text("note"),
  category: text("category"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const riskFactorSets = pgTable("risk_factor_sets", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id")
    .notNull()
    .references(() => clinics.id, { onDelete: "restrict" }),
  pillarKind: pillarKind("pillar_kind"),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// m2m between sets and library factors, ordered.
export const riskFactorSetItems = pgTable(
  "risk_factor_set_items",
  {
    setId: uuid("set_id")
      .notNull()
      .references(() => riskFactorSets.id, { onDelete: "cascade" }),
    factorId: uuid("factor_id")
      .notNull()
      .references(() => riskFactorLibrary.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.setId, t.factorId] }),
  })
);

// ----------------------------------------------------------------------
// Audit log — every PHI read/write touches this. Insert-only for app role.
// ----------------------------------------------------------------------

// ----------------------------------------------------------------------
// Training library — exercises, sessions, programs, zones, targets, assignments
// ----------------------------------------------------------------------

export const hrZones = pgTable(
  "hr_zones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "restrict" }),
    zoneKey: text("zone_key").notNull(), // 'z1'..'z5'
    name: text("name").notNull(),
    shortName: text("short_name").notNull(),
    lowBpm: integer("low_bpm").notNull(),
    highBpm: integer("high_bpm").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    clinicIdx: index("hr_zones_clinic_idx").on(t.clinicId),
  })
);

export const trainingTargets = pgTable("training_targets", {
  clinicId: uuid("clinic_id")
    .primaryKey()
    .references(() => clinics.id, { onDelete: "cascade" }),
  strengthPerWeek: integer("strength_per_week").default(3).notNull(),
  zone2MinutesPerWeek: integer("zone2_minutes_per_week").default(180).notNull(),
  vo2maxMinutesPerWeek: integer("vo2max_minutes_per_week").default(30).notNull(),
  mobilityPerWeek: integer("mobility_per_week").default(4).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const exerciseLibrary = pgTable(
  "exercise_library",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "restrict" }),
    kind: exerciseKind("kind").default("strength").notNull(),
    name: text("name").notNull(),
    primaryArea: text("primary_area"),
    coachNote: text("coach_note"),
    videoTitle: text("video_title"),
    videoLength: text("video_length"),
    videoUrl: text("video_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    clinicIdx: index("exercise_library_clinic_idx").on(t.clinicId),
    kindIdx: index("exercise_library_kind_idx").on(t.kind),
  })
);

export const sessionLibrary = pgTable(
  "session_library",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "restrict" }),
    kind: sessionKind("kind").default("strength").notNull(),
    name: text("name").notNull(),
    focus: text("focus"),
    estMinutes: integer("est_minutes").default(45).notNull(),
    met: text("met"), // numeric(3,1) override for calorie estimation; NULL = per-kind default
    accent: text("accent"),
    coachNote: text("coach_note"),
    // cardio-only fields
    modality: text("modality"),
    durationMin: integer("duration_min"),
    targetZoneId: uuid("target_zone_id").references(() => hrZones.id, { onDelete: "set null" }),
    warmupMin: integer("warmup_min"),
    rounds: integer("rounds"),
    workMin: integer("work_min"),
    workZoneId: uuid("work_zone_id").references(() => hrZones.id, { onDelete: "set null" }),
    recoverMin: integer("recover_min"),
    recoverZoneId: uuid("recover_zone_id").references(() => hrZones.id, { onDelete: "set null" }),
    cooldownMin: integer("cooldown_min"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    clinicIdx: index("session_library_clinic_idx").on(t.clinicId),
    kindIdx: index("session_library_kind_idx").on(t.kind),
  })
);

export const sessionExercises = pgTable(
  "session_exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessionLibrary.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exerciseLibrary.id, { onDelete: "restrict" }),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    sessionIdx: index("session_exercises_session_idx").on(t.sessionId),
  })
);

export const sessionSets = pgTable(
  "session_sets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionExerciseId: uuid("session_exercise_id")
      .notNull()
      .references(() => sessionExercises.id, { onDelete: "cascade" }),
    setNumber: integer("set_number").notNull(),
    reps: integer("reps").default(0).notNull(),
    weight: integer("weight").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    seIdx: index("session_sets_se_idx").on(t.sessionExerciseId),
  })
);

// Patient-logged actual performance per prescribed set (reps/weight/done),
// one row per (patient, set, date). Clinicians read; patients write own.
export const exerciseSetLogs = pgTable(
  "exercise_set_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id").notNull().references(() => clinics.id, { onDelete: "restrict" }),
    patientId: uuid("patient_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").notNull().references(() => sessionLibrary.id, { onDelete: "cascade" }),
    setId: uuid("set_id").notNull().references(() => sessionSets.id, { onDelete: "cascade" }),
    logDate: date("log_date").notNull(),
    actualReps: integer("actual_reps"),
    actualWeight: integer("actual_weight"),
    done: boolean("done").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    patientDateIdx: index("exercise_set_logs_patient_date_idx").on(t.patientId, t.logDate),
    sessionIdx: index("exercise_set_logs_session_idx").on(t.sessionId),
    uniqPatientSetDate: unique("exercise_set_logs_patient_set_date_key").on(t.patientId, t.setId, t.logDate),
  })
);

export const cardioSessionLogs = pgTable(
  "cardio_session_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id").notNull().references(() => clinics.id, { onDelete: "restrict" }),
    patientId: uuid("patient_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").notNull().references(() => sessionLibrary.id, { onDelete: "cascade" }),
    logDate: date("log_date").notNull(),
    actualMinutes: integer("actual_minutes"),
    done: boolean("done").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    patientDateIdx: index("cardio_session_logs_patient_date_idx").on(t.patientId, t.logDate),
    sessionIdx: index("cardio_session_logs_session_idx").on(t.sessionId),
    uniqPatientSessionDate: unique("cardio_session_logs_patient_session_date_key").on(t.patientId, t.sessionId, t.logDate),
  })
);

export const programLibrary = pgTable(
  "program_library",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    clinicIdx: index("program_library_clinic_idx").on(t.clinicId),
  })
);

export const programDays = pgTable(
  "program_days",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    programId: uuid("program_id")
      .notNull()
      .references(() => programLibrary.id, { onDelete: "cascade" }),
    day: dayKey("day").notNull(),
    sessionId: uuid("session_id").references(() => sessionLibrary.id, { onDelete: "set null" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => ({
    programDayIdx: index("program_days_program_day_idx").on(t.programId, t.day, t.sortOrder),
  })
);

export const programAssignments = pgTable(
  "program_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "restrict" }),
    programId: uuid("program_id")
      .notNull()
      .references(() => programLibrary.id, { onDelete: "cascade" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    patientIdx: index("program_assignments_patient_idx").on(t.patientId),
    programIdx: index("program_assignments_program_idx").on(t.programId),
  })
);

// ----------------------------------------------------------------------
// Diet plan (1:1 with patient)
// ----------------------------------------------------------------------

export const dietPlans = pgTable(
  "diet_plans",
  {
    patientId: uuid("patient_id")
      .primaryKey()
      .references(() => profiles.id, { onDelete: "cascade" }),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "restrict" }),
    rmrValue: integer("rmr_value"),
    rmrMethod: text("rmr_method"),
    rmrMeasuredOn: text("rmr_measured_on"), // stored as DATE in pg; ISO string round-trip
    rmrMeasuredBy: text("rmr_measured_by"),
    // numeric(3,2)/(3,1) — return strings from pg by default; keep as text in the type
    activityMultiplier: text("activity_multiplier").default("1.55").notNull(),
    activityMode: text("activity_mode").default("static").notNull(), // 'static' | 'dynamic'
    baseMultiplier: text("base_multiplier").default("1.20").notNull(),
    activityCreditPct: integer("activity_credit_pct").default(50).notNull(),
    deficitKcal: integer("deficit_kcal").default(0).notNull(),
    proteinPerKg: text("protein_per_kg").default("1.6").notNull(),
    carbsPct: integer("carbs_pct").default(45).notNull(),
    fatPct: integer("fat_pct").default(30).notNull(),
    fiberG: integer("fiber_g").default(35).notNull(),
    mealsPerDay: integer("meals_per_day").default(3).notNull(),
    waterL: text("water_l").default("3.0").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    clinicIdx: index("diet_plans_clinic_idx").on(t.clinicId),
  })
);

// ----------------------------------------------------------------------
// Daily food log — one row per (patient, day).
// ----------------------------------------------------------------------

export const foodLogs = pgTable(
  "food_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "restrict" }),
    logDate: text("log_date").notNull(),       // pg DATE → ISO string round-trip
    source: text("source").default("manual").notNull(),
    kcal: integer("kcal"),
    proteinG: integer("protein_g"),
    carbsG: integer("carbs_g"),
    fatG: integer("fat_g"),
    fiberG: integer("fiber_g"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    patientDateIdx: index("food_logs_patient_date_idx").on(t.patientId, t.logDate),
    clinicIdx: index("food_logs_clinic_idx").on(t.clinicId),
  })
);

// ----------------------------------------------------------------------
// Foods + per-meal food log entries (USDA-backed)
// ----------------------------------------------------------------------

export const foods = pgTable(
  "foods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").notNull(),               // 'usda' | 'custom' | 'open-food-facts'
    sourceId: text("source_id"),
    name: text("name").notNull(),
    brand: text("brand"),
    category: text("category"),
    barcode: text("barcode"),
    // Per-100g — stored as numeric, returned as string from pg
    kcalPer100: text("kcal_per_100"),
    proteinGPer100: text("protein_g_per_100"),
    carbsGPer100: text("carbs_g_per_100"),
    fatGPer100: text("fat_g_per_100"),
    fiberGPer100: text("fiber_g_per_100"),
    vitaminDIuPer100: text("vitamin_d_iu_per_100"),
    vitaminB12UgPer100: text("vitamin_b12_ug_per_100"),
    ironMgPer100: text("iron_mg_per_100"),
    magnesiumMgPer100: text("magnesium_mg_per_100"),
    calciumMgPer100: text("calcium_mg_per_100"),
    potassiumMgPer100: text("potassium_mg_per_100"),
    sodiumMgPer100: text("sodium_mg_per_100"),
    omega3MgPer100: text("omega3_mg_per_100"),
    clinicId: uuid("clinic_id"),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    clinicIdx: index("foods_clinic_idx").on(t.clinicId),
  })
);

export const foodFavorites = pgTable(
  "food_favorites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "restrict" }),
    foodId: uuid("food_id")
      .notNull()
      .references(() => foods.id, { onDelete: "cascade" }),
    defaultQuantityG: text("default_quantity_g"),
    defaultMeal: text("default_meal"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    patientIdx: index("food_favorites_patient_idx").on(t.patientId),
  })
);

export const foodLogEntries = pgTable(
  "food_log_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    foodLogId: uuid("food_log_id")
      .notNull()
      .references(() => foodLogs.id, { onDelete: "cascade" }),
    foodId: uuid("food_id")
      .notNull()
      .references(() => foods.id, { onDelete: "restrict" }),
    meal: text("meal").default("snack").notNull(),
    quantityG: text("quantity_g").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    logIdx: index("food_log_entries_log_idx").on(t.foodLogId),
  })
);

// ----------------------------------------------------------------------
// Medications / supplements stack
// ----------------------------------------------------------------------

export const medications = pgTable(
  "medications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "restrict" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    kind: text("kind").default("medication").notNull(), // 'medication' | 'supplement'
    name: text("name").notNull(),
    dose: text("dose"),
    form: text("form"),
    instructions: text("instructions"),
    notes: text("notes"),
    pillarId: uuid("pillar_id").references(() => pillars.id, { onDelete: "set null" }),
    startDate: text("start_date"),
    endDate: text("end_date"),
    active: boolean("active").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    // Refill tracking (0017). numeric -> string via supabase-js, like the diet plan numerics.
    quantityOnHand: text("quantity_on_hand"),
    quantityPerDose: text("quantity_per_dose").default("1"),
    refillThresholdDays: integer("refill_threshold_days").default(7),
    lastRefillOn: text("last_refill_on"),                // pg date
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    patientIdx: index("medications_patient_idx").on(t.patientId),
    clinicIdx: index("medications_clinic_idx").on(t.clinicId),
    pillarIdx: index("medications_pillar_idx").on(t.pillarId),
  })
);

// Clinic-scoped pairwise interaction rules library (0017).
export const medicationInteractions = pgTable(
  "medication_interactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    namePatternA: text("name_pattern_a").notNull(),
    namePatternB: text("name_pattern_b").notNull(),
    severity: text("severity").default("warn").notNull(), // 'info' | 'warn' | 'severe'
    message: text("message").notNull(),
    source: text("source"),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    clinicIdx: index("medication_interactions_clinic_idx").on(t.clinicId),
  })
);

// Per-medication history timeline (0017). Populated by a trigger on
// `medications`; app code never inserts here directly.
export const medicationChangeLog = pgTable(
  "medication_change_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    medicationId: uuid("medication_id").references(() => medications.id, { onDelete: "set null" }),
    changeType: text("change_type").notNull(), // 'create' | 'update' | 'delete' | 'refill'
    // text[] in pg; supabase-js returns array of strings.
    changedFields: jsonb("changed_fields"),
    before: jsonb("before"),
    after: jsonb("after"),
    actorId: uuid("actor_id").references(() => profiles.id, { onDelete: "set null" }),
    actorRole: text("actor_role"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    patientIdx: index("medication_change_log_patient_idx").on(t.patientId, t.createdAt),
    medIdx: index("medication_change_log_medication_idx").on(t.medicationId),
  })
);

export const medicationDoses = pgTable(
  "medication_doses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "restrict" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    medicationId: uuid("medication_id")
      .notNull()
      .references(() => medications.id, { onDelete: "cascade" }),
    timeLocal: text("time_local").notNull(),         // PG `time` returns as string
    label: text("label"),
    withFood: boolean("with_food"),
    daysOfWeek: jsonb("days_of_week")               // schema is smallint[]; drizzle stores as jsonb to avoid array typing
      .default(sql`'[0,1,2,3,4,5,6]'::jsonb`),
    amountOverride: text("amount_override"),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    medIdx: index("medication_doses_medication_idx").on(t.medicationId),
    patientIdx: index("medication_doses_patient_idx").on(t.patientId),
  })
);

export const medicationDoseLogs = pgTable(
  "medication_dose_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "restrict" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    medicationId: uuid("medication_id")
      .notNull()
      .references(() => medications.id, { onDelete: "cascade" }),
    doseId: uuid("dose_id").references(() => medicationDoses.id, { onDelete: "set null" }),
    scheduledFor: text("scheduled_for").notNull(),  // ISO date
    takenAt: timestamp("taken_at", { withTimezone: true }).defaultNow().notNull(),
    recordedBy: uuid("recorded_by").references(() => profiles.id, { onDelete: "set null" }),
    recordedRole: text("recorded_role"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    patientDayIdx: index("medication_dose_logs_patient_day_idx").on(t.patientId, t.scheduledFor),
    medIdx: index("medication_dose_logs_medication_idx").on(t.medicationId),
  })
);

// ----------------------------------------------------------------------
// Grand 100 — activities + per-patient baseline
// ----------------------------------------------------------------------

export const grand100Tier = pgEnum("grand100_tier", ["essential", "important", "stretch"]);
export const levelLabel = pgEnum("level_label", ["low", "moderate", "high"]);

export const grand100Activities = pgTable(
  "grand100_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    description: text("description"),
    icon: text("icon"),
    accent: text("accent"),
    tier: grand100Tier("tier").default("important").notNull(),
    requiredVo2: integer("required_vo2").notNull(),
    requiredStrengthLevel: levelLabel("required_strength_level").default("moderate").notNull(),
    requiredMobilityLevel: levelLabel("required_mobility_level").default("moderate").notNull(),
    requiredStrengthLb: integer("required_strength_lb"),
    sortOrder: integer("sort_order").default(0).notNull(),
    hidden: boolean("hidden").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    clinicIdx: index("grand100_activities_clinic_idx").on(t.clinicId),
  })
);

export const grand100PatientTargets = pgTable(
  "grand100_patient_targets",
  {
    patientId: uuid("patient_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => grand100Activities.id, { onDelete: "cascade" }),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "restrict" }),
    targetAge: integer("target_age").default(100).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.patientId, t.activityId] }),
    clinicIdx: index("grand100_patient_targets_clinic_idx").on(t.clinicId),
    activityIdx: index("grand100_patient_targets_activity_idx").on(t.activityId),
  })
);

export const grand100Baselines = pgTable(
  "grand100_baselines",
  {
    patientId: uuid("patient_id")
      .primaryKey()
      .references(() => profiles.id, { onDelete: "cascade" }),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "restrict" }),
    vo2Now: integer("vo2_now"),
    gripKg: integer("grip_kg"),
    squat1rmLb: integer("squat_1rm_lb"),
    strengthPercentile: integer("strength_percentile"),
    mobilityPercentile: integer("mobility_percentile"),
    measuredOn: text("measured_on"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    clinicIdx: index("grand100_baselines_clinic_idx").on(t.clinicId),
  })
);

// ----------------------------------------------------------------------
// Messaging — one implicit thread per patient. Every message names a
// specific recipient_id so threads stay legible across the clinic.
// ----------------------------------------------------------------------

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "restrict" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    senderRole: text("sender_role").notNull(), // 'patient' | 'clinician'
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    recipientReadAt: timestamp("recipient_read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    patientIdx: index("messages_patient_created_idx").on(t.patientId, t.createdAt),
    clinicIdx: index("messages_clinic_idx").on(t.clinicId),
  })
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id"),
    actorId: uuid("actor_id"), // profile id of whoever did this
    actorRole: text("actor_role"),
    action: text("action").notNull(), // 'read' | 'create' | 'update' | 'delete' | 'login' | 'export' etc.
    entityType: text("entity_type").notNull(), // 'patient_profile', 'pillar_factor', etc.
    entityId: uuid("entity_id"),
    patientId: uuid("patient_id"), // when the row pertains to a specific patient
    meta: jsonb("meta"), // free-form context (e.g. before/after diff summary)
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    patientIdx: index("audit_log_patient_idx").on(t.patientId),
    actorIdx: index("audit_log_actor_idx").on(t.actorId),
    occurredIdx: index("audit_log_occurred_idx").on(t.occurredAt),
  })
);

// ----------------------------------------------------------------------
// Wearables (Oura, Whoop, future: apple_health, eight_sleep)
// ----------------------------------------------------------------------

export const wearableConnections = pgTable(
  "wearable_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "restrict" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    provider: wearableProvider("provider").notNull(),
    providerUserId: text("provider_user_id"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    status: wearableConnectionStatus("status").default("active").notNull(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    clinicIdx: index("wearable_connections_clinic_idx").on(t.clinicId),
    providerUserIdx: index("wearable_connections_provider_user_idx").on(t.provider, t.providerUserId),
  })
);

export const wearableDailyMetrics = pgTable(
  "wearable_daily_metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "restrict" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    provider: wearableProvider("provider").notNull(),
    metricDate: text("metric_date").notNull(), // date column; text-typed because supabase-js stringifies dates
    sleepTotalMinutes: integer("sleep_total_minutes"),
    sleepEfficiencyPct: text("sleep_efficiency_pct"),
    sleepScore: integer("sleep_score"),
    hrvRmssdMs: text("hrv_rmssd_ms"),
    restingHrBpm: text("resting_hr_bpm"),
    recoveryScore: integer("recovery_score"),
    readinessScore: integer("readiness_score"),
    strainScore: text("strain_score"),
    activityScore: integer("activity_score"),
    activeKcal: integer("active_kcal"),
    totalKcal: integer("total_kcal"),
    bedtimeStart: text("bedtime_start"),
    bedtimeEnd: text("bedtime_end"),
    raw: jsonb("raw"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    patientDateIdx: index("wearable_metrics_patient_date_idx").on(t.patientId, t.metricDate),
    clinicDateIdx: index("wearable_metrics_clinic_date_idx").on(t.clinicId, t.metricDate),
  })
);

export const wearableWebhookEvents = pgTable(
  "wearable_webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: wearableProvider("provider").notNull(),
    eventType: text("event_type"),
    providerUserId: text("provider_user_id"),
    payload: jsonb("payload"),
    signature: text("signature"),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    error: text("error"),
  },
  (t) => ({
    receivedIdx: index("wearable_webhook_events_received_idx").on(t.receivedAt),
  })
);

// ---------------------------------------------------------------------------
// Sleep journal — subjective patient-entered notes about last night.
// One row per (patient_id, entry_date). entry_date = the morning the
// sleep ended on.
// ---------------------------------------------------------------------------

export const sleepJournalEntries = pgTable(
  "sleep_journal_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    entryDate: text("entry_date").notNull(), // date column
    bedTime: text("bed_time"),               // time column (HH:MM[:SS])
    wakeTime: text("wake_time"),
    timeInBedMinutes: integer("time_in_bed_minutes"),
    awakeMinutes: integer("awake_minutes"),
    interruptionCount: integer("interruption_count"),
    restedRating: integer("rested_rating"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    patientDateIdx: index("sleep_journal_entries_patient_date_idx").on(t.patientId, t.entryDate),
    clinicIdx: index("sleep_journal_entries_clinic_idx").on(t.clinicId),
  })
);
