/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Optimize for cost — disable image optimization for self-hosting
  images: {
    unoptimized: true,
  },
  // Server-side SQLite requires serverExternalPackages
  serverExternalPackages: ['better-sqlite3'],
};

module.exports = nextConfig;
