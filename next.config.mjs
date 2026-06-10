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
};

export default nextConfig;
