// Builds the phone-app version (plain files in app-build/) for Capacitor. Usage:  npm run build:app
// The app needs to know where the backend is:  set NEXT_PUBLIC_API_BASE=https://your-backend-address  (in frontend/.env.production or the shell)
import { spawnSync } from 'node:child_process';

if (!process.env.NEXT_PUBLIC_API_BASE) {
  console.warn('Note: NEXT_PUBLIC_API_BASE is not set, so the app will look for the backend on its own address. Set it before building a real APK.');
}
const r = spawnSync('npx', ['next', 'build'], { stdio: 'inherit', shell: true, env: { ...process.env, BUILD_TARGET: 'app' } });
process.exit(r.status ?? 1);
