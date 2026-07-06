// Security headers applied to every response. Deliberately conservative —
// no Content-Security-Policy yet (needs an inline-script audit first; add
// with report-only mode when ready).
const securityHeaders = [
  // Force HTTPS for 2 years incl. subdomains (only meaningful behind TLS,
  // which staging/prod always are).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // PHI-bearing app must never be framed (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Don't leak PHI-bearing URLs (e.g. /clinician/patient/<id>) to third parties.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Only the features we actually use: camera for barcode scanning.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Harmless with `next start` (our App Runner run command); also lets the
  // optional Dockerfile build a slim container if we ever switch to image-based.
  output: "standalone",
  experimental: {
    // Server Components by default; we use them for any PHI-reading view.
  },
  eslint: {
    // No ESLint config is set up in this project yet, so linting was never
    // enforced. Skip it during `next build` so the Amplify CI build is
    // deterministic and doesn't hang on the interactive setup prompt.
    // (Type-checking still runs and WILL fail the build on type errors.)
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
