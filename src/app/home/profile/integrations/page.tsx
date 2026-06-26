// Patient → Me → Integrations.
//
// One tile per provider. Active ones show last-synced timestamp + a
// Disconnect button. Available-but-unconnected providers show a Connect
// link that kicks the OAuth flow. Disabled providers (Apple Health,
// Eight Sleep) render a greyed tile with the reason.
import Link from "next/link";
import { ChevronLeft, Plug, CheckCircle2, AlertTriangle } from "lucide-react";
import { requirePatient } from "@/lib/auth/server";
import { withAuth } from "@/lib/db/connection";
import { PROVIDER_META } from "@/lib/wearables/registry";
import type { WearableProvider } from "@/lib/wearables/types";
import { DisconnectButton } from "./disconnect-button";
import { SyncNowButton } from "./sync-now-button";

const ORDER: WearableProvider[] = ["oura", "whoop", "apple_health", "eight_sleep"];

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const params = await searchParams;
  const user = await requirePatient();

  const rows = await withAuth(user, (sql) =>
    sql`SELECT id, provider, status, last_synced_at, has_token, last_error FROM wearable_connections_public WHERE patient_id = ${user.id}`
  );

  const byProvider = new Map<string, {
    id: string;
    status: "active" | "revoked" | "error";
    last_synced_at: string | null;
    has_token: boolean;
    last_error: string | null;
  }>();
  for (const r of rows as any[]) byProvider.set(r.provider, r);

  return (
    <div className="p-5 space-y-4">
      <div>
        <Link
          href="/home/profile"
          className="text-[12px] text-slate-500 inline-flex items-center gap-1 hover:text-slate-700"
        >
          <ChevronLeft size={12} /> Me
        </Link>
        <div className="text-xs uppercase tracking-wide text-slate-500 mt-2">Wearables</div>
        <div className="text-xl font-semibold text-slate-900 flex items-center gap-1.5">
          <Plug size={18} className="text-slate-600" /> Integrations
        </div>
        <div className="text-xs text-slate-500 mt-1">
          Connect a tracker to send sleep, HRV, and recovery to your care team.
        </div>
        <div className="mt-3">
          <SyncNowButton />
          <div className="text-[10.5px] text-slate-400 mt-1 leading-snug">
            Today&apos;s numbers fill in after your ring syncs to the Oura app; tap to pull the latest.
          </div>
        </div>
      </div>

      {params.connected && (
        <Banner kind="ok">
          <CheckCircle2 size={14} className="flex-shrink-0" />
          <span>Connected {labelFor(params.connected)}. Pulling the last 14 days now…</span>
        </Banner>
      )}
      {params.error && (
        <Banner kind="err">
          <AlertTriangle size={14} className="flex-shrink-0" />
          <span>Couldn&apos;t complete connection: {params.error}</span>
        </Banner>
      )}

      <div className="space-y-3">
        {ORDER.map((id) => {
          const meta = PROVIDER_META[id];
          const conn = byProvider.get(id);
          const connected = conn?.status === "active" && conn.has_token;
          const errored = conn?.status === "error";
          return (
            <div
              key={id}
              className={`bg-white rounded-2xl border border-slate-200 p-4 flex items-start gap-3 ${
                !meta.available ? "opacity-70" : ""
              }`}
            >
              <div
                className={`w-11 h-11 rounded-xl bg-gradient-to-br ${meta.brandFrom} ${meta.brandTo} text-white flex items-center justify-center flex-shrink-0 text-[11px] font-bold tracking-wide`}
              >
                {abbrev(id)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-sm font-semibold text-slate-900">{meta.label}</div>
                  {connected && (
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                      Connected
                    </span>
                  )}
                  {errored && (
                    <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded-full">
                      Reconnect needed
                    </span>
                  )}
                  {!meta.available && (
                    <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                      Coming soon
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 leading-snug mt-0.5">
                  {!meta.available && meta.unavailableReason
                    ? meta.unavailableReason
                    : meta.description}
                </div>
                {connected && conn?.last_synced_at && (
                  <div className="text-[11px] text-slate-400 mt-1">
                    Last synced {timeAgo(conn.last_synced_at)}
                  </div>
                )}
                {errored && conn?.last_error && (
                  <div className="text-[11px] text-rose-600 mt-1 break-all">{conn.last_error}</div>
                )}
              </div>
              <div className="flex-shrink-0">
                {!meta.available ? (
                  <button
                    disabled
                    className="text-xs font-semibold text-slate-400 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg cursor-not-allowed"
                  >
                    Coming soon
                  </button>
                ) : connected ? (
                  <DisconnectButton provider={id} label={meta.label} />
                ) : (
                  <a
                    href={`/api/wearables/${id}/start`}
                    className="text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 px-3 py-1.5 rounded-lg"
                  >
                    Connect
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function abbrev(p: WearableProvider): string {
  switch (p) {
    case "oura":
      return "OURA";
    case "whoop":
      return "WHOOP";
    case "apple_health":
      return "";
    case "eight_sleep":
      return "8";
  }
}

function labelFor(provider: string): string {
  const meta = (PROVIDER_META as any)[provider];
  return meta?.label ?? provider;
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const sec = Math.round((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  const day = Math.floor(sec / 86400);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function Banner({
  kind,
  children,
}: {
  kind: "ok" | "err";
  children: React.ReactNode;
}) {
  const cls =
    kind === "ok"
      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
      : "bg-rose-50 border-rose-200 text-rose-800";
  return (
    <div className={`text-[12px] rounded-xl border p-2.5 flex items-start gap-2 ${cls}`}>
      {children}
    </div>
  );
}
