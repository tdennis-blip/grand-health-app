/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Server Components by default; we use them for any PHI-reading view.
  },
};

export default nextConfig;
