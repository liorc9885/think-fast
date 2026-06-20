/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the existing Canvas game reachable at the deployed root so the live
  // game URL does not break during the transition. The game itself lives as a
  // STATIC asset under public/game/ and is never ported to React/Next.
  async rewrites() {
    return {
      beforeFiles: [
        { source: '/', destination: '/game/index.html' },
      ],
    };
  },
};

module.exports = nextConfig;
