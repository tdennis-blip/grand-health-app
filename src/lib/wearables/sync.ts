// Shared sync helpers for wearable connections + daily metrics.
//
// All functions use serviceRoleSql directly — they run in OAuth callbacks,
// webhook handlers, and cron jobs that bypass RLS by design.
import { serviceRoleSql } from "@/lib/db/connection";
import { recordAudit } from "@/lib/audit";
import { getClient } from "./registry";
import type { DailyMetric, TokenSet, WearableProvider } from "./types";

export type ConnectionRow = {
  id: string;
  clinic_id: string;
  patient_id: string;
  provider: WearableProvider;
  provider_user_id: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  scope: string | null;
  status: "active" | "revoked" | "error";
};

// ---------------------------------------------------------------------------
// Connection lookup + token refresh
// ---------------------------------------------------------------------------

export async function getConnectionByProviderUserId(
  provider: WearableProvider,
  providerUserId: string
): Promise<ConnectionRow | null> {
  const [row] = await serviceRoleSql<ConnectionRow[]>`
    SELECT id, clinic_id, patient_id, provider, provider_user_id,
           access_token, refresh_token, token_expires_at, scope, status
    FROM wearable_connections
    WHERE provider = ${provider}
      AND provider_user_id = ${providerUserId}
    LIMIT 1
  `;
  return row ?? null;
}

export async function listActiveConnections(): Promise<ConnectionRow[]> {
  return serviceRoleSql<ConnectionRow[]>`
    SELECT id, clinic_id, patient_id, provider, provider_user_id,
           access_token, refresh_token, token_expires_at, scope, status
    FROM wearable_connections
    WHERE status = 'active'
  `;
}

// Active connections for one patient, with last_synced_at so callers can
// rate-limit on-demand (app-open) refreshes.
export type ConnectionWithSync = ConnectionRow & { last_synced_at: string | null };

export async function listActiveConnectionsForPatient(
  patientId: string
): Promise<ConnectionWithSync[]> {
  return serviceRoleSql<ConnectionWithSync[]>`
    SELECT id, clinic_id, patient_id, provider, provider_user_id,
           access_token, refresh_token, token_expires_at, scope, status, last_synced_at
    FROM wearable_connections
    WHERE status = 'active' AND patient_id = ${patientId}
  `;
}

/**
 * Ensure the connection's access token is fresh; if expiry is within 60s,
 * exchange the refresh token and persist the new pair.
 */
export async function ensureFreshToken(conn: ConnectionRow): Promise<ConnectionRow> {
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at) : null;
  const expiringSoon =
    expiresAt != null && expiresAt.getTime() - Date.now() < 60_000;
  if (!expiringSoon || !conn.refresh_token) return conn;

  const client = getClient(conn.provider);
  let refreshed: TokenSet;
  try {
    refreshed = await client.refreshToken(conn.refresh_token);
  } catch (err) {
    await markConnectionError(
      conn.id,
      err instanceof Error ? err.message : "refresh failed"
    );
    throw err;
  }

  const newRefresh = refreshed.refreshToken ?? conn.refresh_token;
  const newExpiry = refreshed.expiresAt?.toISOString() ?? null;
  const newScope = refreshed.scope ?? conn.scope;

  await serviceRoleSql`
    UPDATE wearable_connections
    SET access_token     = ${refreshed.accessToken},
        refresh_token    = ${newRefresh},
        token_expires_at = ${newExpiry},
        scope            = ${newScope},
        status           = 'active',
        last_error       = NULL
    WHERE id = ${conn.id}
  `;

  return {
    ...conn,
    access_token: refreshed.accessToken,
    refresh_token: newRefresh,
    token_expires_at: newExpiry,
    scope: newScope,
    status: "active",
  };
}

// ---------------------------------------------------------------------------
// Upsert helpers
// ---------------------------------------------------------------------------

export async function upsertConnection(args: {
  clinicId: string;
  patientId: string;
  provider: WearableProvider;
  token: TokenSet;
}): Promise<string> {
  const [row] = await serviceRoleSql<{ id: string }[]>`
    INSERT INTO wearable_connections
      (clinic_id, patient_id, provider, provider_user_id,
       access_token, refresh_token, token_expires_at, scope, status, last_error)
    VALUES
      (${args.clinicId}, ${args.patientId}, ${args.provider},
       ${args.token.providerUserId ?? null},
       ${args.token.accessToken},
       ${args.token.refreshToken ?? null},
       ${args.token.expiresAt?.toISOString() ?? null},
       ${args.token.scope ?? null},
       'active', NULL)
    ON CONFLICT (patient_id, provider) DO UPDATE SET
      provider_user_id = EXCLUDED.provider_user_id,
      access_token     = EXCLUDED.access_token,
      refresh_token    = EXCLUDED.refresh_token,
      token_expires_at = EXCLUDED.token_expires_at,
      scope            = EXCLUDED.scope,
      status           = 'active',
      last_error       = NULL
    RETURNING id
  `;
  if (!row) throw new Error("upsertConnection: no row returned");
  return row.id;
}

export async function revokeConnection(connectionId: string): Promise<void> {
  await serviceRoleSql`
    UPDATE wearable_connections
    SET status        = 'revoked',
        access_token  = NULL,
        refresh_token = NULL,
        token_expires_at = NULL
    WHERE id = ${connectionId}
  `;
}

export async function markConnectionError(
  connectionId: string,
  message: string
): Promise<void> {
  const truncated = message.slice(0, 500);
  await serviceRoleSql`
    UPDATE wearable_connections
    SET status = 'error', last_error = ${truncated}
    WHERE id = ${connectionId}
  `;
}

export async function upsertDailyMetrics(
  conn: ConnectionRow,
  metrics: DailyMetric[]
): Promise<number> {
  if (metrics.length === 0) return 0;

  // Build values for a multi-row INSERT ... ON CONFLICT upsert.
  // postgres-js handles arrays of objects natively via sql(...).
  const rows = metrics.map((m) => ({
    clinic_id:            conn.clinic_id,
    patient_id:           conn.patient_id,
    provider:             conn.provider,
    metric_date:          m.metricDate,
    sleep_total_minutes:  m.sleepTotalMinutes ?? null,
    sleep_efficiency_pct: m.sleepEfficiencyPct ?? null,
    sleep_score:          m.sleepScore ?? null,
    hrv_rmssd_ms:         m.hrvRmssdMs ?? null,
    resting_hr_bpm:       m.restingHrBpm ?? null,
    recovery_score:       m.recoveryScore ?? null,
    readiness_score:      m.readinessScore ?? null,
    strain_score:         m.strainScore ?? null,
    activity_score:       m.activityScore ?? null,
    active_kcal:          m.activeKcal ?? null,
    total_kcal:           m.totalKcal ?? null,
    bedtime_start:        m.bedtimeStart ?? null,
    bedtime_end:          m.bedtimeEnd ?? null,
    raw:                  m.raw ?? null,
    fetched_at:           new Date().toISOString(),
  }));

  await serviceRoleSql`
    INSERT INTO wearable_daily_metrics ${serviceRoleSql(rows as any)}
    ON CONFLICT (patient_id, provider, metric_date) DO UPDATE SET
      sleep_total_minutes  = EXCLUDED.sleep_total_minutes,
      sleep_efficiency_pct = EXCLUDED.sleep_efficiency_pct,
      sleep_score          = EXCLUDED.sleep_score,
      hrv_rmssd_ms         = EXCLUDED.hrv_rmssd_ms,
      resting_hr_bpm       = EXCLUDED.resting_hr_bpm,
      recovery_score       = EXCLUDED.recovery_score,
      readiness_score      = EXCLUDED.readiness_score,
      strain_score         = EXCLUDED.strain_score,
      activity_score       = EXCLUDED.activity_score,
      active_kcal          = EXCLUDED.active_kcal,
      total_kcal           = EXCLUDED.total_kcal,
      bedtime_start        = EXCLUDED.bedtime_start,
      bedtime_end          = EXCLUDED.bedtime_end,
      raw                  = EXCLUDED.raw,
      fetched_at           = EXCLUDED.fetched_at
  `;

  await serviceRoleSql`
    UPDATE wearable_connections
    SET last_synced_at = ${new Date().toISOString()},
        status         = 'active',
        last_error     = NULL
    WHERE id = ${conn.id}
  `;

  return rows.length;
}

// ---------------------------------------------------------------------------
// Top-level sync: fetch + upsert + audit.
// ---------------------------------------------------------------------------

export async function syncConnectionRange(
  conn: ConnectionRow,
  startDate: string,
  endDate: string
): Promise<number> {
  const fresh = await ensureFreshToken(conn);
  if (!fresh.access_token) throw new Error("missing access token");

  const client = getClient(fresh.provider);
  const metrics = await client.fetchDailyRange({
    accessToken: fresh.access_token,
    startDate,
    endDate,
  });
  const n = await upsertDailyMetrics(fresh, metrics);

  await recordAudit({
    action: "create",
    entityType: "wearable_daily_metrics",
    patientId: fresh.patient_id,
    meta: { provider: fresh.provider, start_date: startDate, end_date: endDate, rows: n },
  }).catch(() => undefined); // audit failures shouldn't kill the sync

  return n;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

export function ymd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return ymd(d);
}
