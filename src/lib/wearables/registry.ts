// Central registry of wearable providers we can OAuth into.
//
// Adding a new provider means: write the client (ProviderClient interface),
// add an entry here, and add a tile in the integrations page UI. The OAuth
// route handler is generic.
import type { ProviderClient, WearableProvider } from "./types";
import { ouraClient } from "./oura";
import { whoopClient } from "./whoop";

export type ProviderMeta = {
  id: WearableProvider;
  label: string;
  description: string;
  brandFrom: string; // tailwind gradient stops
  brandTo: string;
  available: boolean;
  unavailableReason?: string;
};

export const PROVIDER_META: Record<WearableProvider, ProviderMeta> = {
  oura: {
    id: "oura",
    label: "Oura Ring",
    description: "Sleep stages, HRV, readiness, activity score.",
    brandFrom: "from-slate-700",
    brandTo: "to-slate-900",
    available: true,
  },
  whoop: {
    id: "whoop",
    label: "Whoop",
    description: "Recovery, strain, HRV, sleep performance.",
    brandFrom: "from-zinc-800",
    brandTo: "to-black",
    available: true,
  },
  apple_health: {
    id: "apple_health",
    label: "Apple Health",
    description: "Requires the iOS app shell (coming soon).",
    brandFrom: "from-rose-500",
    brandTo: "to-rose-700",
    available: false,
    unavailableReason: "Apple Health requires the Capacitor iOS shell — coming in a later release.",
  },
  eight_sleep: {
    id: "eight_sleep",
    label: "Eight Sleep",
    description: "Bed temperature, sleep stages, HRV.",
    brandFrom: "from-blue-700",
    brandTo: "to-indigo-900",
    available: false,
    unavailableReason: "Eight Sleep has no public OAuth API. We'll integrate once they publish one.",
  },
};

const CLIENTS: Partial<Record<WearableProvider, ProviderClient>> = {
  oura: ouraClient,
  whoop: whoopClient,
};

export function getClient(provider: WearableProvider): ProviderClient {
  const c = CLIENTS[provider];
  if (!c) throw new Error(`No client wired for provider: ${provider}`);
  return c;
}

export function isProviderEnabled(provider: WearableProvider): boolean {
  return PROVIDER_META[provider]?.available === true;
}
