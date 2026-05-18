/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [],

  async rewrites() {
    return [
      // Proxy /api/* to the backend server in dev mode
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
