/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // BullMQ / ioredis are server-only; keep them out of the client bundle.
    // (Next 14 key; becomes top-level `serverExternalPackages` in Next 15.)
    serverComponentsExternalPackages: ['bullmq', 'ioredis', 'firecrawl', 'undici'],
  },
};

export default nextConfig;
