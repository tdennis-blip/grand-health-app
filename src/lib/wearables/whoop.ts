// Whoop OAuth + API client.
//
// Docs: https://developer.whoop.com/docs (Whoop Developer Platform)
//
// Endpoints we use (v1):
//   POST  https://api.prod.whoop.com/oauth/oauth2/token
//   GET   https://api.prod.whoop.com/developer/v1/user/profile/basic
//   GET   https://api.prod.whoop.com/developer/v1/recovery?start=&end=
//   GET   https://api.prod.whoop.com/developer/v1/activity/sleep?start=&end=
//   GET   https://api.prod.whoop.com/developer/v1/cycle?start=&end=
//
// Whoop's "cycle" is the day-equivalent (sometimes longer if you wake at
// 2am). We bucket recovery + sleep + cycle by the cycle start-date.
import { z } from "zod";
import type { DailyMetric, ProviderClient, TokenSet } from "./types";

const AUTHORIZE_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";
const TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
const API_BASE = "https://api.prod.whoop.com/developer/v1";

const SCOPES = [
  "read:profile",
  "read:recovery",
  "read:sleep",
  "read:cycles",
  "read:workout",
  "offline",
].join(" ");

function clientId() {
  const id = process.env.WHOOP_CLIENT_ID;
  if (!id) throw new Error("WHOOP_CLIENT_ID not set");
  return id;
}
function clientSecret() {
  const s = process.env.WHOOP_CLIENT_SECRET;
  if (!s) throw new Error("WHOOP_CLIENT_SECRET not set");
  return s;
}

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

function authorizeUrl(state: string, redirectUri: string): string {
  const u = new URL(AUTHORIZE_URL);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", clientId());
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("scope", SCOPES);
  u.searchParams.set("state", state);
  return u.toString();
}

const TokenSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional().nullable(),
  expires_in: z.number().optional(),
  token_type: z.string().optional(),
  scope: z.string().optional(),
});

async function exchangeCode(code: string, redirectUri: string): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId(),
    client_secret: clientSecret(),
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Whoop token exchange failed: ${res.status} ${await res.text()}`);
  }
  const parsed = TokenSchema.parse(await res.json());
  const providerUserId = await fetchProviderUserId(parsed.access_token).catch(() => null);
  return {
    accessToken: parsed.access_token,
    refreshToken: parsed.refresh_token ?? null,
    expiresAt: parsed.expires_in ? new Date(Date.now() + parsed.expires_in * 1000) : null,
    scope: parsed.scope ?? SCOPES,
    providerUserId,
  };
}

async function refreshToken(refreshTok: string): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshTok,
    client_id: clientId(),
    client_secret: clientSecret(),
    scope: SCOPES,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Whoop token refresh failed: ${res.status} ${await res.text()}`);
  }
  const parsed = TokenSchema.parse(await res.json());
  return {
    accessToken: parsed.access_token,
    refreshToken: parsed.refresh_token ?? refreshTok,
    expiresAt: parsed.expires_in ? new Date(Date.now() + parsed.expires_in * 1000) : null,
    scope: parsed.scope ?? null,
    providerUserId: null,
  };
}

async function fetchProviderUserId(accessToken: string): Promise<string | null> {
  const res = await fetch(`${API_BASE}/user/profile/basic`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  const id = json?.user_id ?? json?.id;
  if (typeof id === "number" || typeof id === "string") return String(id);
  return null;
}

// ---------------------------------------------------------------------------
// Data fetch — Whoop paginates via `nextToken`; we follow until empty.
// ---------------------------------------------------------------------------

const CycleSchema = z.object({
  id: z.union([z.string(), z.number()]),
  start: z.string(),
  end: z.string().nullable().optional(),
  score: z
    .object({
      strain: z.number().nullable().optional(),
      average_heart_rate: z.number().nullable().optional(),
      kilojoule: z.number().nullable().optional(), // total energy for the cycle
    })
    .partial()
    .nullable()
    .optional(),
}).passthrough();

const RecoverySchema = z.object({
  cycle_id: z.union([z.string(), z.number()]),
  score: z
    .object({
      recovery_score: z.number().nullable().optional(),
      resting_heart_rate: z.number().nullable().optional(),
      hrv_rmssd_milli: z.number().nullable().optional(),
    })
    .partial()
    .nullable()
    .optional(),
}).passthrough();

const SleepSchema = z.object({
  id: z.union([z.string(), z.number()]),
  start: z.string(),
  end: z.string().nullable().optional(),
  nap: z.boolean().optional(),
  score: z
    .object({
      sleep_performance_percentage: z.number().nullable().optional(),
      sleep_efficiency_percentage: z.number().nullable().optional(),
      stage_summary: z
        .object({
          total_in_bed_time_milli: z.number().nullable().optional(),
          total_awake_time_milli: z.number().nullable().optional(),
        })
        .partial()
        .nullable()
        .optional(),
    })
    .partial()
    .nullable()
    .optional(),
}).passthrough();

async function paginate<T>(
  accessToken: string,
  path: string,
  start: string,
  end: string,
  schema: z.ZodType<T>
): Promise<T[]> {
  const all: T[] = [];
  let nextToken: string | undefined = undefined;
  // Cap pagination to a sane number of pages to avoid loops.
  for (let i = 0; i < 20; i++) {
    const u = new URL(`${API_BASE}/${path}`);
    u.searchParams.set("start", start);
    u.searchParams.set("end", end);
    u.searchParams.set("limit", "25");
    if (nextToken) u.searchParams.set("nextToken", nextToken);
    const res = await fetch(u.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Whoop ${path} failed: ${res.status} ${await res.text()}`);
    }
    const json: any = await res.json();
    const rows: unknown[] = Array.isArray(json?.records) ? json.records : [];
    for (const r of rows) {
      const parsed = schema.safeParse(r);
      if (parsed.success) all.push(parsed.data);
    }
    nextToken = json?.next_token ?? undefined;
    if (!nextToken) break;
  }
  return all;
}

async function fetchDailyRange(opts: {
  accessToken: string;
  startDate: string;
  endDate: string;
}): Promise<DailyMetric[]> {
  // Whoop wants ISO-8601 with seconds; we give it midnight-to-midnight UTC.
  const start = `${opts.startDate}T00:00:00.000Z`;
  const end = `${opts.endDate}T23:59:59.999Z`;

  const [cycles, recovery, sleep] = await Promise.all([
    paginate(opts.accessToken, "cycle", start, end, CycleSchema),
    paginate(opts.accessToken, "recovery", start, end, RecoverySchema),
    paginate(opts.accessToken, "activity/sleep", start, end, SleepSchema),
  ]);

  // Index recovery by cycle_id; bucket cycles by their calendar start date.
  const recoveryByCycle = new Map<string, z.infer<typeof RecoverySchema>>();
  for (const r of recovery) recoveryByCycle.set(String(r.cycle_id), r);

  type Bucket = {
    day: string;
    cycle?: z.infer<typeof CycleSchema>;
    recovery?: z.infer<typeof RecoverySchema>;
    sleep: z.infer<typeof SleepSchema>[];
  };
  const byDay = new Map<string, Bucket>();

  for (const c of cycles) {
    const day = c.start.slice(0, 10);
    const b = byDay.get(day) ?? { day, sleep: [] };
    b.cycle = c;
    b.recovery = recoveryByCycle.get(String(c.id));
    byDay.set(day, b);
  }
  for (const s of sleep) {
    if (s.nap) continue; // skip naps for "last night" semantics
    const day = s.start.slice(0, 10);
    const b = byDay.get(day) ?? { day, sleep: [] };
    b.sleep.push(s);
    byDay.set(day, b);
  }

  return Array.from(byDay.values()).map<DailyMetric>((b) => {
    const primarySleep = b.sleep[0];
    const inBedMs = primarySleep?.score?.stage_summary?.total_in_bed_time_milli ?? null;
    const awakeMs = primarySleep?.score?.stage_summary?.total_awake_time_milli ?? null;
    const sleepMinutes =
      inBedMs != null
        ? Math.round((inBedMs - (awakeMs ?? 0)) / 60_000)
        : null;
    return {
      metricDate: b.day,
      sleepTotalMinutes: sleepMinutes,
      sleepEfficiencyPct: primarySleep?.score?.sleep_efficiency_percentage ?? null,
      sleepScore: primarySleep?.score?.sleep_performance_percentage ?? null,
      hrvRmssdMs: b.recovery?.score?.hrv_rmssd_milli ?? null,
      restingHrBpm: b.recovery?.score?.resting_heart_rate ?? null,
      recoveryScore: b.recovery?.score?.recovery_score ?? null,
      readinessScore: null,
      strainScore: b.cycle?.score?.strain ?? null,
      activityScore: null,
      // Whoop reports total energy (incl. BMR), not active-only. Store as
      // total_kcal; leave active_kcal null so the diet engine doesn't
      // double-count the resting base (it falls back to the MET estimate).
      activeKcal: null,
      totalKcal:
        b.cycle?.score?.kilojoule != null
          ? Math.round(b.cycle.score.kilojoule * 0.239006)
          : null,
      raw: { cycle: b.cycle, recovery: b.recovery, sleep: b.sleep },
    };
  });
}

export const whoopClient: ProviderClient = {
  authorizeUrl,
  exchangeCode,
  refreshToken,
  fetchDailyRange,
  fetchProviderUserId,
};
