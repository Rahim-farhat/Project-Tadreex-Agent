/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained server bundle for the Docker image
  output: 'standalone',
  poweredByHeader: false,

  // Forward /api to the Express server. In production the reverse proxy routes
  // /api before it reaches Next.js; this keeps `npm run dev` working.
  // Evaluated at build time.
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
