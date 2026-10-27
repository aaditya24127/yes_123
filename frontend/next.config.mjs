/** @type {import('next').NextConfig} */
// Two ways to build the same code:
//   website (default)       npm run dev / npm run build   -> /api/... is forwarded to the backend below
//   phone app (Capacitor)   npm run build:app             -> plain files in app-build/ for Android / iOS;
//                                                            set NEXT_PUBLIC_API_BASE to the backend's public address
const isApp = process.env.BUILD_TARGET === 'app';
const BACKEND = process.env.BACKEND_URL || 'http://127.0.0.1:8000';

const nextConfig = isApp
  ? { reactStrictMode: true, output: 'export', distDir: 'app-build', trailingSlash: true, images: { unoptimized: true } }
  : {
      reactStrictMode: true,
      async rewrites() {
        return [{ source: '/api/:path*', destination: `${BACKEND}/api/:path*` }];
      },
    };
export default nextConfig;
