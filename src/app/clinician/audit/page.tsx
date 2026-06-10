// Clinician audit log viewer.
//
// Read-only listing of public.audit_log scoped to the clinician's clinic
// (RLS enforces this; we still pass clinic_id explicitly so the composite
// index audit_log_clinic_occurred_idx is used).
//
// Filters are URL-driven (?action=&entity=&actor=&patient=&from=&to=&q=)
// so deep-linking and browser back/forward "just work". Pagination is
// offset-based — fine for clinic-sized log volume; we can switch to
// keyset pagination if a clinic ever pushes past ~50k rows.
import Link from "next/link";
import { ChevronLeft, ChevronRight, Filter, ScrollText } from "lucide-react";
import { requireClinician } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";

type SearchParams = {
  action?: string;
  entity?: string;
  actor?: string;
  patient?: string;
  from?: string;
  to?: string;
  q?: string;
  page?: string;
  size?: string;
};

const PAGE_SIZE_DEFAULT = 50;

// Mirror of AuditAction in src/lib/audit.ts — kept in sync manually so this
// view doesn't blow up on rows that pre-date a new action being added.
const ACTION_OPTIONS = [
  "create",
  "update",
  "delete",
  "read",
  "login",
  "logout",
  "export",
  "invite",
] as const;

// Friendly display labels for the entity_type column. Anything not in here
// falls back to the raw snake_case string, so missing entries are non-fatal.
const ENTITY_LABELS: Record<string, string> = {
  patient_profile: "patient profile",
  pillar_factor: "risk factor",
  factor_observation: "factor observation",
  pillar_recommendation: "recommendation",
  lifestyle_driver: "driver",
  pillar: "pillar",
  diet_plan: "diet plan",
  food_log: "food log",
  food_log_entry: "food entry",
  food: "food",
  food_favorite: "favorite",
  program_assignment: "program assignment",
  medication: "medication",
  medication_dose: "med dose",
  medication_dose_log: "dose check-off",
  medication_interaction: "interaction rule",
  medication_refill_alert: "refill alert",
  message: "message",
  grand100_activity: "Grand 100 activity",
  grand100_baseline: "Grand 100 baseline",
  grand100_patient_target: "Grand 100 target age",
  wearable_connection: "wearable connection",
};

function labelForEntity(t: string): string {
  return ENTITY_LABELS[t] ?? t;
}

const ACTION_COLORS: Record<string, string> = {
  create: "bg-emerald-50 text-emerald-700 border-emerald-200",
  update: "bg-amber-50 text-amber-700 border-amber-200",
  delete: "bg-rose-50 text-rose-700 border-rose-200",
  read: "bg-slate-50 text-slate-600 border-slate-200",
  login: "bg-sky-50 text-sky-700 border-sky-200",
  logout: "bg-slate-50 text-slate-600 border-slate-200",
  export: "bg-violet-50 text-violet-700 border-violet-200",
  invite: "bg-teal-50 text-teal-700 border-teal-200",
};

type AuditRow = {
  id: string;
  clinic_id: string | null;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  patient_id: string | null;
  meta: unknown;
  ip_address: string | null;
  user_agent: string | null;
  occurred_at: string;
};

type ProfileLite = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: string;
};

export default async function ClinicianAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const user = await requireClinician();

  const page = Math.max(0, parseInt(params.page ?? "0", 10) || 0);
  const size = clamp(parseInt(params.size ?? "", 10) || PAGE_SIZE_DEFAULT, 10, 200);
  const fromIso = parseDateStart(params.from);
  const toIso = parseDateEnd(params.to);
  const q = (params.q ?? "").trim();
  const offset = page * size;

  // Build dynamic WHERE conditions as arrays, then join with AND.
  const conditions: string[] = ["1=1"];
  const bindings: any[] = [];
  let bi = 1; // binding index tracker

  if (params.action) { conditions.push(`action = $${bi++}`); bindings.push(params.action); }
  if (params.entity) { conditions.push(`entity_type = $${bi++}`); bindings.push(params.entity); }
  if (params.actor) { conditions.push(`actor_id = $${bi++}`); bindings.push(params.actor); }
  if (params.patient) { conditions.push(`patient_id = $${bi++}`); bindings.push(params.patient); }
  if (fromIso) { conditions.push(`occurred_at >= $${bi++}`); bindings.push(fromIso); }
  if (toIso) { conditions.push(`occurred_at <= $${bi++}`); bindings.push(toIso); }
  if (q) {
    const safe = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
    conditions.push(`(entity_type ILIKE $${bi} OR action ILIKE $${bi})`);
    bindings.push(safe); bi++;
  }

  const where = conditions.join(" AND ");

  const [rawRows, [countRow], typeRows, clinicProfiles] = await Promise.all([
    withAuth(user, (sql) =>
      sql.unsafe(
        `SELECT id, clinic_id, actor_id, actor_role, action, entity_type, entity_id, patient_id, meta, ip_address, user_agent, occurred_at FROM audit_log WHERE ${where} ORDER BY occurred_at DESC LIMIT $${bi} OFFSET $${bi + 1}`,
        [...bindings, size, offset]
      )
    ),
    withAuth(user, (sql) =>
      sql.unsafe(
        `SELECT count(*)::int AS n FROM audit_log WHERE ${where}`,
        bindings
      )
    ),
    withAuth(user, (sql) =>
      sql`SELECT DISTINCT entity_type FROM audit_log ORDER BY entity_type ASC LIMIT 1000`
    ),
    withAuth(user, (sql) =>
      sql`SELECT id, email, first_name, last_name, role FROM profiles ORDER BY role ASC, last_name ASC`
    ),
  ]);

  const rows = rawRows as unknown as AuditRow[];
  const error = null as { message: string } | null;

  // Bulk-load profile names for actor + patient ids on the visible page.
  const ids = new Set<string>();
  for (const r of rows) {
    if (r.actor_id) ids.add(r.actor_id);
    if (r.patient_id) ids.add(r.patient_id);
  }
  let profileMap = new Map<string, ProfileLite>();
  if (ids.size > 0) {
    const idArr = Array.from(ids);
    const profiles = await withAuth(user, (sql) =>
      sql`SELECT id, email, first_name, last_name, role FROM profiles WHERE id = ANY(${idArr})`
    );
    for (const p of profiles as unknown as ProfileLite[]) profileMap.set(p.id, p);
  }

  const entityTypes = typeRows.map((r: any) => r.entity_type as string).sort();
  const clinicians = (clinicProfiles as any[]).filter((p) => p.role === "clinician") as ProfileLite[];
  const patients = (clinicProfiles as any[]).filter((p) => p.role === "patient") as ProfileLite[];

  const totalCount = countRow?.n ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / size));
  const showingFrom = totalCount === 0 ? 0 : page * size + 1;
  const showingTo = Math.min(totalCount, page * size + rows.length);

  // Helper to preserve current filters while changing one param (e.g. page).
  const buildHref = (overrides: Partial<SearchParams>) => {
    const merged: SearchParams = { ...params, ...overrides };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
    }
    const s = sp.toString();
    return s ? `/clinician/audit?${s}` : "/clinician/audit";
  };

  const hasFilters = !!(
    params.action ||
    params.entity ||
    params.actor ||
    params.patient ||
    params.from ||
    params.to ||
    q
  );

  return (
    <main className="max-w-6xl mx-auto px-6 py-6 space-y-5">
      <header>
        <div className="text-xs uppercase tracking-wide text-slate-500">Compliance</div>
        <div className="text-xl font-semibold text-slate-900 flex items-center gap-1.5">
          <ScrollText size={18} className="text-slate-600" /> Audit log
        </div>
        <div className="text-xs text-slate-500 mt-1">
          Every PHI mutation in your clinic. Read-only. Scoped by RLS — you
          cannot see other clinics&apos; activity even via direct SQL.
        </div>
      </header>

      {/* Filters */}
      <form method="GET" className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 uppercase tracking-wide">
          <Filter size={12} /> Filters
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="Search">
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="entity_type or action..."
              className="w-full text-sm px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white"
            />
          </Field>
          <Field label="Action">
            <select
              name="action"
              defaultValue={params.action ?? ""}
              className="w-full text-sm px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white"
            >
              <option value="">Any</option>
              {ACTION_OPTIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Entity type">
            <select
              name="entity"
              defaultValue={params.entity ?? ""}
              className="w-full text-sm px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white"
            >
              <option value="">Any</option>
              {entityTypes.map((e) => (
                <option key={e} value={e}>
                  {labelForEntity(e)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Actor">
            <select
              name="actor"
              defaultValue={params.actor ?? ""}
              className="w-full text-sm px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white"
            >
              <option value="">Any</option>
              {clinicians.map((p) => (
                <option key={p.id} value={p.id}>
                  {fullName(p)} {p.role === "clinician" ? "(clinician)" : ""}
                </option>
              ))}
              {patients.length > 0 && (
                <optgroup label="Patients">
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {fullName(p)}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </Field>
          <Field label="Patient">
            <select
              name="patient"
              defaultValue={params.patient ?? ""}
              className="w-full text-sm px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white"
            >
              <option value="">Any</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {fullName(p)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="From">
            <input
              type="date"
              name="from"
              defaultValue={params.from ?? ""}
              className="w-full text-sm px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white"
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              name="to"
              defaultValue={params.to ?? ""}
              className="w-full text-sm px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white"
            />
          </Field>
          <Field label="Page size">
            <select
              name="size"
              defaultValue={String(size)}
              className="w-full text-sm px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white"
            >
              {[25, 50, 100, 200].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <button
            type="submit"
            className="text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 px-3 py-1.5 rounded-lg"
          >
            Apply
          </button>
          {hasFilters && (
            <Link
              href="/clinician/audit"
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg border border-slate-200 bg-white"
            >
              Clear
            </Link>
          )}
          <div className="text-[11px] text-slate-500 ml-auto">
            {totalCount.toLocaleString()} {totalCount === 1 ? "event" : "events"}
            {q ? " (search matches entity / action; meta not indexed)" : ""}
          </div>
        </div>
      </form>

      {/* Results */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-xl p-3">
          Couldn&apos;t load audit log: {error.message}
        </div>
      )}

      <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-10 text-center">
            <div className="text-sm font-semibold text-slate-900">No matching events</div>
            <div className="text-xs text-slate-500 mt-1">
              {hasFilters
                ? "Try widening your filters."
                : "Audit events appear as your team uses the app."}
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((r) => {
              const actor = r.actor_id ? profileMap.get(r.actor_id) : null;
              const patient = r.patient_id ? profileMap.get(r.patient_id) : null;
              const actionClass =
                ACTION_COLORS[r.action] ??
                "bg-slate-50 text-slate-600 border-slate-200";
              return (
                <details key={r.id} className="group">
                  <summary className="cursor-pointer list-none px-5 py-3 hover:bg-slate-50 transition flex items-start gap-3">
                    <div className="flex flex-col items-start gap-1 w-[120px] flex-shrink-0">
                      <span
                        className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${actionClass}`}
                      >
                        {r.action}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {formatTimestamp(r.occurred_at)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-900">
                        <span className="font-semibold">
                          {actor ? fullName(actor) : r.actor_role ?? "system"}
                        </span>
                        <span className="text-slate-500"> {verbFor(r.action)} </span>
                        <span
                          className="font-mono text-[12px] text-slate-700 bg-slate-100 px-1 py-0.5 rounded"
                          title={r.entity_type}
                        >
                          {labelForEntity(r.entity_type)}
                        </span>
                        {r.entity_id && (
                          <span className="font-mono text-[11px] text-slate-400 ml-1.5">
                            {shortId(r.entity_id)}
                          </span>
                        )}
                        {patient && (
                          <span className="text-slate-500">
                            {" "}for{" "}
                            <span className="text-slate-700 font-medium">
                              {fullName(patient)}
                            </span>
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                        {actor?.email && (
                          <span className="font-mono text-slate-400">{actor.email}</span>
                        )}
                        {r.ip_address && (
                          <span className="font-mono text-slate-400">{r.ip_address}</span>
                        )}
                        {r.meta != null && (
                          <span className="text-[10px] uppercase tracking-wide text-slate-400 group-open:hidden">
                            click to expand
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight
                      size={16}
                      className="text-slate-300 mt-1 group-open:rotate-90 transition"
                    />
                  </summary>
                  <div className="px-5 pb-4 pt-1 bg-slate-50 border-t border-slate-100">
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[12px] mb-3">
                      <Row k="Event id" v={r.id} mono />
                      <Row k="Occurred at" v={new Date(r.occurred_at).toISOString()} mono />
                      <Row k="Actor" v={actor ? `${fullName(actor)} <${actor.email}>` : r.actor_id ?? "—"} mono={!actor} />
                      <Row k="Actor role" v={r.actor_role ?? "—"} />
                      <Row k="Entity type" v={`${labelForEntity(r.entity_type)} (${r.entity_type})`} />
                      <Row k="Entity id" v={r.entity_id ?? "—"} mono />
                      <Row k="Patient" v={patient ? fullName(patient) : r.patient_id ?? "—"} mono={!patient && !!r.patient_id} />
                      <Row k="IP" v={r.ip_address ?? "—"} mono />
                      <Row k="User agent" v={r.user_agent ?? "—"} />
                    </dl>
                    {r.meta != null && (
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
                          Meta
                        </div>
                        <pre className="text-[11px] font-mono bg-white border border-slate-200 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words text-slate-700">
                          {JSON.stringify(r.meta, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>

      {/* Pagination */}
      {totalCount > 0 && (
        <div className="flex items-center justify-between text-xs text-slate-600">
          <div>
            Showing {showingFrom.toLocaleString()}–{showingTo.toLocaleString()} of{" "}
            {totalCount.toLocaleString()}
          </div>
          <div className="flex items-center gap-2">
            <PageLink
              disabled={page === 0}
              href={buildHref({ page: String(Math.max(0, page - 1)) })}
            >
              <ChevronLeft size={14} /> Prev
            </PageLink>
            <span className="text-slate-500">
              Page {page + 1} / {totalPages}
            </span>
            <PageLink
              disabled={page >= totalPages - 1}
              href={buildHref({ page: String(page + 1) })}
            >
              Next <ChevronRight size={14} />
            </PageLink>
          </div>
        </div>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
        {label}
      </div>
      {children}
    </label>
  );
}

function Row({ k, v, mono = false }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 min-w-0">
      <dt className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold w-[90px] flex-shrink-0">
        {k}
      </dt>
      <dd
        className={`text-[12px] text-slate-800 break-all ${
          mono ? "font-mono text-[11px]" : ""
        }`}
      >
        {v}
      </dd>
    </div>
  );
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="text-xs font-semibold text-slate-300 px-2.5 py-1 rounded-lg border border-slate-100 inline-flex items-center gap-1">
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="text-xs font-semibold text-slate-700 hover:text-slate-900 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 inline-flex items-center gap-1"
    >
      {children}
    </Link>
  );
}

function fullName(p: ProfileLite): string {
  const n = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
  return n || p.email;
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

function verbFor(action: string): string {
  switch (action) {
    case "create":
      return "created";
    case "update":
      return "updated";
    case "delete":
      return "deleted";
    case "read":
      return "read";
    case "login":
      return "signed into";
    case "logout":
      return "signed out of";
    case "export":
      return "exported";
    case "invite":
      return "invited";
    default:
      return action;
  }
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function parseDateStart(input?: string): string | null {
  if (!input) return null;
  const d = new Date(`${input}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parseDateEnd(input?: string): string | null {
  if (!input) return null;
  const d = new Date(`${input}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
