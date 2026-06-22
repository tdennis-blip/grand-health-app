// Oura Ring v2 OAuth + API client.
//
// Docs: https://cloud.ouraring.com/v2/docs (developer portal:
//       https://cloud.ouraring.com/oauth/applications).
//
// Endpoints we use:
//   POST https://api.ouraring.com/oauth/token              (token exchange + refresh)
//   GET  https://api.ouraring.com/v2/usercollection/personal_info
//   GET  https://api.ouraring.com/v2/usercollection/sleep?start_date=&end_date=
//   GET  https://api.ouraring.com/v2/usercollection/daily_readiness?start_date=&end_date=
//   GET  https://api.ouraring.com/v2/usercollection/daily_activity?start_date=&end_date=
//
// Day join strategy: Oura returns one row per period; we collapse all sleep
// rows whose `day` field matches into a single DailyMetric, summing minutes
// and taking the highest score (Oura's "long sleep" record).
import { z } from "zod";
import type { DailyMetric, ProviderClient, TokenSet } from "./types";

const AUTHORIZE_URL = "https://cloud.ouraring.com/oauth/authorize";
const TOKEN_URL = "https://api.ouraring.com/oauth/token";
const API_BASE = "https://api.ouraring.com/v2/usercollection";

// Scopes — readiness + sleep give us everything we surface today. We also
// request `email` and `personal` so we can capture the user's Oura user_id.
const SCOPES = ["email", "personal", "daily", "heartrate"].join(" ");

function clientId() {
  const id = process.env.OURA_CLIENT_ID;
  if (!id) throw new Error("OURA_CLIENT_ID not set");
  return id;
}
function clientSecret() {
  const s = process.env.OURA_CLIENT_SECRET;
  if (!s) throw new Error("OURA_CLIENT_SECRET not set");
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
    throw new Error(`Oura token exchange failed: ${res.status} ${await res.text()}`);
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
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Oura token refresh failed: ${res.status} ${await res.text()}`);
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
  const res = await fetch(`${API_BASE}/personal_info`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  const id = json?.id ?? json?.user_id;
  return typeof id === "string" ? id : null;
}

// ---------------------------------------------------------------------------
// Data fetch
// ---------------------------------------------------------------------------

const SleepRowSchema = z.object({
  id: z.string(),
  day: z.string(), // YYYY-MM-DD; the calendar day the sleep is attributed to
  type: z.string().optional(), // 'long_sleep', 'late_nap', etc.
  total_sleep_duration: z.number().nullable().optional(), // seconds
  efficiency: z.number().nullable().optional(),           // 0-100
  average_hrv: z.number().nullable().optional(),          // ms
  lowest_heart_rate: z.number().nullable().optional(),
}).passthrough();

const ReadinessRowSchema = z.object({
  day: z.string(),
  score: z.number().nullable().optional(),
}).passthrough();

const ActivityRowSchema = z.object({
  day: z.string(),
  score: z.number().nullable().optional(),
  active_calories: z.number().nullable().optional(), // kcal from movement
  total_calories: z.number().nullable().optional(),  // active + resting
}).passthrough();

async function ouraGet<T>(
  accessToken: string,
  path: string,
  params: Record<string, string>,
  schema: z.ZodType<T>
): Promise<T[]> {
  const u = new URL(`${API_BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Oura ${path} failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  const data = Array.isArray(json?.data) ? json.data : [];
  return data
    .map((row: unknown) => schema.safeParse(row))
    .filter((r: any) => r.success)
    .map((r: any) => r.data);
}

async function fetchDailyRange(opts: {
  accessToken: string;
  startDate: string;
  endDate: string;
}): Promise<DailyMetric[]> {
  const params = { start_date: opts.startDate, end_date: opts.endDate };
  const [sleep, readiness, activity] = await Promise.all([
    ouraGet(opts.accessToken, "sleep", params, SleepRowSchema),
    ouraGet(opts.accessToken, "daily_readiness", params, ReadinessRowSchema),
    ouraGet(opts.accessToken, "daily_activity", params, ActivityRowSchema),
  ]);

  // Merge by day. Multiple sleep rows per day (e.g. nap + long sleep) get
  // summed for duration; we take the long_sleep row's HRV / efficiency as
  // the primary signal.
  type Bucket = {
    day: string;
    sleepMinutes: number;
    sleepEfficiency: number | null;
    hrv: number | null;
    restingHr: number | null;
    raw: { sleep: unknown[]; readiness?: unknown; activity?: unknown };
  };
  const byDay = new Map<string, Bucket>();
  for (const s of sleep) {
    const b = byDay.get(s.day) ?? {
      day: s.day,
      sleepMinutes: 0,
      sleepEfficiency: null,
      hrv: null,
      restingHr: null,
      raw: { sleep: [] as unknown[] },
    };
    b.sleepMinutes += Math.round((s.total_sleep_duration ?? 0) / 60);
    const isPrimary = s.type === "long_sleep" || b.sleepEfficiency == null;
    if (isPrimary) {
      b.sleepEfficiency = s.efficiency ?? b.sleepEfficiency;
      b.hrv = s.average_hrv ?? b.hrv;
      b.restingHr = s.lowest_heart_rate ?? b.restingHr;
    }
    b.raw.sleep.push(s);
    byDay.set(s.day, b);
  }
  for (const r of readiness) {
    const b = byDay.get(r.day) ?? {
      day: r.day,
      sleepMinutes: 0,
      sleepEfficiency: null,
      hrv: null,
      restingHr: null,
      raw: { sleep: [] as unknown[] },
    };
    b.raw.readiness = r;
    byDay.set(r.day, b);
  }
  for (const a of activity) {
    const b = byDay.get(a.day) ?? {
      day: a.day,
      sleepMinutes: 0,
      sleepEfficiency: null,
      hrv: null,
      restingHr: null,
      raw: { sleep: [] as unknown[] },
    };
    b.raw.activity = a;
    byDay.set(a.day, b);
  }

  const readinessByDay = new Map(readiness.map((r) => [r.day, r.score ?? null]));
  const activityByDay = new Map(activity.map((a) => [a.day, a.score ?? null]));
  const activeKcalByDay = new Map(activity.map((a) => [a.day, a.active_calories ?? null]));
  const totalKcalByDay = new Map(activity.map((a) => [a.day, a.total_calories ?? null]));

  return Array.from(byDay.values()).map<DailyMetric>((b) => ({
    metricDate: b.day,
    sleepTotalMinutes: b.sleepMinutes || null,
    sleepEfficiencyPct: b.sleepEfficiency,
    sleepScore: null, // Oura no longer exposes "sleep score" in v2 directly
    hrvRmssdMs: b.hrv,
    restingHrBpm: b.restingHr,
    recoveryScore: null,
    readinessScore: readinessByDay.get(b.day) ?? null,
    strainScore: null,
    activityScore: activityByDay.get(b.day) ?? null,
    activeKcal: activeKcalByDay.get(b.day) ?? null,
    totalKcal: totalKcalByDay.get(b.day) ?? null,
    raw: b.raw,
  }));
}

export const ouraClient: ProviderClient = {
  authorizeUrl,
  exchangeCode,
  refreshToken,
  fetchDailyRange,
  fetchProviderUserId,
};
