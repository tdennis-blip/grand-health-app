// Shared types for wearable integrations.
//
// Every provider client returns a normalized DailyMetric so the upsert
// logic in src/lib/wearables/sync.ts doesn't need to know which vendor
// produced the row.

export type WearableProvider = "oura" | "whoop" | "apple_health" | "eight_sleep";

export type DailyMetric = {
  metricDate: string; // YYYY-MM-DD
  sleepTotalMinutes?: number | null;
  sleepEfficiencyPct?: number | null;
  sleepScore?: number | null;
  hrvRmssdMs?: number | null;
  restingHrBpm?: number | null;
  recoveryScore?: number | null;
  readinessScore?: number | null;
  strainScore?: number | null;
  activityScore?: number | null;
  activeKcal?: number | null;   // exercise/movement calories
  totalKcal?: number | null;    // active + resting (provider total)
  raw: unknown;
};

export type TokenSet = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scope: string | null;
  providerUserId: string | null;
};

export type ProviderClient = {
  authorizeUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<TokenSet>;
  refreshToken(refreshToken: string): Promise<TokenSet>;
  fetchDailyRange(opts: {
    accessToken: string;
    startDate: string; // YYYY-MM-DD inclusive
    endDate: string;   // YYYY-MM-DD inclusive
  }): Promise<DailyMetric[]>;
  fetchProviderUserId?(accessToken: string): Promise<string | null>;
};
