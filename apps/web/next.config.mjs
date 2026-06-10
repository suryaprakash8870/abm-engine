/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@abm/shared'],
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
