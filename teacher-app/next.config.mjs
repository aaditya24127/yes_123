/** @type {import('next').NextConfig} */
// The browser app talks to the backend through this same address: /api/... is forwarded to BACKEND_URL (on Vercel, set BACKEND_URL
// to the Render address). No cross-site calls, so no extra CORS setup.
const BACKEND = process.env.BACKEND_URL || 'http://127.0.0.1:8000';

export default {
  reactStrictMode: true,
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${BACKEND}/api/:path*` }];
  },
};
