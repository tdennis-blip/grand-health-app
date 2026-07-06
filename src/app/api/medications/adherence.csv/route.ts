// Adherence report as CSV. Auth via the caller's Supabase session — RLS
// blocks anyone who isn't the patient or a clinician in the patient's
// clinic, so we don't need a custom permission check here.
//
// Output layout: a small summary block (one row per med + overall total),
// a blank separator row, then per-med per-day rows. Excel handles it fine.
import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { recordAudit } from "@/lib/audit";
import {
  getAdherenceReport,
  type MedAdherenceWindow,
} from "@/lib/medications-adherence";

const ALLOWED: MedAdherenceWindow[] = [7, 14, 30, 90];

function csvEscape(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function row(...cells: Array<string | number | null | undefined>): string {
  return cells.map(csvEscape).join(",");
}

export async function GET(req: NextRequest) {
  const patientId = req.nextUrl.searchParams.get("patient");
  const winParam = req.nextUrl.searchParams.get("window");
  if (!patientId) return NextResponse.json({ error: "missing patient" }, { status: 400 });

  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const windowDays: MedAdherenceWindow =
    (ALLOWED.find((n) => String(n) === winParam) ?? 30) as MedAdherenceWindow;

  const [profile] = await withAuth(user, (sql) =>
    sql`SELECT first_name, last_name FROM profiles WHERE id = ${patientId} LIMIT 1`
  );
  if (!profile) return NextResponse.json({ error: "patient not visible" }, { status: 403 });

  const report = await getAdherenceReport(patientId, windowDays, user);

  // HIPAA audit: PHI export to a file leaving the system.
  recordAudit({
    action: "export",
    entityType: "medication_adherence_csv",
    patientId,
    meta: { windowDays, medCount: report.perMed.length },
  }).catch(() => {});

  const lines: string[] = [];
  lines.push(row("Section", "patient", "window_days", "from", "to"));
  lines.push(row(
    "Header",
    `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim(),
    report.windowDays,
    report.fromDate,
    report.toDate,
  ));
  lines.push("");
  lines.push(row("Section", "medication", "kind", "dose", "scheduled", "taken", "pct", "longest_missed_streak"));
  for (const m of report.perMed) {
    lines.push(row(
      "Summary",
      m.name,
      m.kind,
      m.dose ?? "",
      m.scheduled,
      m.taken,
      m.pct ?? "",
      m.longestMissedStreak,
    ));
  }
  lines.push(row(
    "SummaryTotal",
    "ALL",
    "",
    "",
    report.totalScheduled,
    report.totalTaken,
    report.overallPct ?? "",
    "",
  ));
  lines.push("");
  lines.push(row("Section", "date", "medication", "kind", "scheduled", "taken"));
  for (const m of report.perMed) {
    for (const d of m.days) {
      lines.push(row("Daily", d.date, m.name, m.kind, d.scheduled, d.taken));
    }
  }

  const body = lines.join("\n") + "\n";
  const fname = `adherence_${(profile.last_name ?? "patient").toLowerCase()}_${report.fromDate}_${report.toDate}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fname}"`,
      "Cache-Control": "no-store",
    },
  });
}
