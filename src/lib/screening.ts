// Shared helpers for the Cancer pillar "Screening" tab (clinician editor +
// patient read-only view). Pure — safe to import on client or server.

// Common cancer screenings offered as quick-pick presets (clinicians can also
// type any free-text test name).
export const SCREENING_PRESETS: string[] = [
  "Colonoscopy",
  "FIT / stool DNA (Cologuard)",
  "Mammogram",
  "Pap smear / HPV test",
  "Low-dose CT (lung)",
  "PSA (prostate)",
  "Skin / dermatology exam",
  "Upper endoscopy",
  "Liver ultrasound",
  "Breast MRI",
];

export type DueStatus = "overdue" | "due-soon" | "ok" | "none";

// Days from today within which a "next due" date counts as due-soon (amber).
const DUE_SOON_DAYS = 60;

// Classifies a next-due date string (YYYY-MM-DD) relative to today.
export function dueStatus(nextDue: string | null | undefined): DueStatus {
  if (!nextDue) return "none";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${nextDue}T00:00:00`);
  if (isNaN(due.getTime())) return "none";
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0) return "overdue";
  if (diffDays <= DUE_SOON_DAYS) return "due-soon";
  return "ok";
}

export const DUE_STATUS_CHIP: Record<DueStatus, string> = {
  overdue:   "bg-rose-50 text-rose-700 border-rose-200",
  "due-soon":"bg-amber-50 text-amber-700 border-amber-200",
  ok:        "bg-emerald-50 text-emerald-700 border-emerald-200",
  none:      "bg-slate-100 text-slate-600 border-slate-200",
};

export const DUE_STATUS_LABEL: Record<DueStatus, string> = {
  overdue:   "Overdue",
  "due-soon":"Due soon",
  ok:        "Up to date",
  none:      "Not scheduled",
};

// e.g. "2026-03-01" -> "Mar 1, 2026"; null -> "—"
export function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(`${d}T00:00:00`);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
