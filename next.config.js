/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Optimize for cost — disable image optimization for self-hosting
  images: {
    unoptimized: true,
  },
  experimental: {
    // Server-side SQLite requires the native package to stay external.
    serverComponentsExternalPackages: ['better-sqlite3'],
  },
};

module.exports = nextConfig;
