// Pure helpers — no server imports. Safe to use in client components.

export type AppointmentType = {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  defaultDurationMinutes: number;
  sortOrder: number;
  active: boolean;
};

export type Appointment = {
  id: string;
  scheduledAt: string;
  durationMinutes: number;
  type: string;
  title: string | null;
  location: string | null;
  status: "scheduled" | "completed" | "cancelled";
  preAppointmentInstructions: string | null;
  prepNoticeHours: number;
  notes: string | null;
  clinicianId: string | null;
  clinicianName: string | null;
};

export type AppointmentWithPrep = Appointment & {
  showPrepSignal: boolean;
};

export function apptTypeLabel(type: string): string {
  const map: Record<string, string> = {
    initial_consultation: "Initial consultation",
    follow_up: "Follow-up",
    lab_work: "Lab work",
    body_composition: "Body composition",
    nutrition_review: "Nutrition review",
    exercise_assessment: "Exercise assessment",
    telehealth: "Telehealth",
    other: "Other",
  };
  return map[type] ?? type;
}

export const APPT_TYPES = [
  { value: "follow_up",            label: "Follow-up" },
  { value: "initial_consultation", label: "Initial consultation" },
  { value: "lab_work",             label: "Lab work" },
  { value: "body_composition",     label: "Body composition" },
  { value: "nutrition_review",     label: "Nutrition review" },
  { value: "exercise_assessment",  label: "Exercise assessment" },
  { value: "telehealth",           label: "Telehealth" },
  { value: "other",                label: "Other" },
] as const;
