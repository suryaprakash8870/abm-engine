/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Don't fail production builds on lint (cosmetic rules like unescaped quotes).
  // Lint locally / in CI with `npm run lint`, not at deploy time.
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // BullMQ / ioredis are server-only; keep them out of the client bundle.
    // (Next 14 key; becomes top-level `serverExternalPackages` in Next 15.)
    serverComponentsExternalPackages: ['bullmq', 'ioredis', 'firecrawl', 'undici'],
    // Enables instrumentation.ts (boots in-process BullMQ workers on free tier).
    instrumentationHook: true,
  },
};

export default nextConfig;
