import type { CapacitorConfig } from "@capacitor/cli";

// Capacitor shell config. The web app continues to live in Next.js; this
// only matters when building the iOS / Android shell that wraps the
// deployed web build to gain access to native APIs (camera-based barcode
// scanning, HealthKit later, push, etc.).
//
// Two modes:
//  - dev:  set CAPACITOR_SERVER_URL to your tunnel (ngrok / cloudflared)
//          and the shell hot-loads from your local Next.js dev server.
//  - prod: leave it unset; the shell loads the deployed site at
//          NEXT_PUBLIC_SITE_URL (Amplify origin).
const SERVER_URL =
  process.env.CAPACITOR_SERVER_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  undefined;

const config: CapacitorConfig = {
  appId: "com.mygrandhealth.app",
  appName: "Grand Health",
  // We don't bundle a static web build — the shell points at the live site.
  // `webDir` is required by the CLI; "public" is a harmless placeholder.
  webDir: "public",
  server: SERVER_URL
    ? {
        url: SERVER_URL,
        cleartext: SERVER_URL.startsWith("http://"),
      }
    : undefined,
  ios: {
    contentInset: "always",
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    BarcodeScanning: {
      // Use Google's barcode-scanning module; no MLKit binary in app.
      // (Default behavior — listed here for clarity.)
    },
  },
};

export default config;
