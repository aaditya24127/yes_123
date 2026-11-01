# From this website to an Android / iOS app (zero setup for the people who install it)

## How it fits together

```
 CRP's / teacher's phone                        Your server (set up once, by you)
 ┌──────────────────────┐   internet (https)   ┌───────────────────────────────────────────┐
 │  CRP Mentor Copilot  │ ───────────────────▶ │  Backend (API + background workers)        │
 │  app (APK / iOS)     │                      │  AI keys, AI choice (config/ai.json)        │
 │  = the website files │ ◀─────────────────── │  Whisper speech-to-text                     │
 │  + server address    │                      │  Database (Postgres / Supabase, India)      │
 └──────────────────────┘                      │  File storage (Supabase Storage)            │
                                               └───────────────────────────────────────────┘
```

People who install the app only install the app. They never see Python, databases, keys or AI settings. The app knows
one thing: the server's address (built in). AI keys stay on the server, because anything inside an APK can be extracted.

## What is already done in the code (October 2026)

- **One switch for the server address**: `NEXT_PUBLIC_API_BASE` (`frontend/lib/platform.ts`). Every backend call goes
  through it (`frontend/lib/api.ts`).
- **Builds as plain files** (what an app needs): `npm run build:app` makes `frontend/app-build/`. Not yet confirmed: on
  27 Oct 2026 the build stalled while downloading the 11 Google fonts over a slow network. Fix before the APK: self-host
  the fonts (download them once into the project) so the build needs no internet for fonts.
- **No page needs a web server**: the teacher page moved from `/t/<code>` to `/teacher?k=<code>`.
- **Phone layout**: bottom menu bar on small screens, space for the notch and home bar, no zoom jump when typing on iPhone.
- **Links to outside pages** go through one helper (`openExternal`), ready to use the phone's browser in the app.
- **Microphone recording** uses the standard browser recorder, which works inside Android and iOS app views (needs the
  microphone permission below).
- **End-user build switch**: `NEXT_PUBLIC_END_USER=1` hides admin screens (AI settings, key test, AI cost).
- **Server allows the app**: `ALLOWED_ORIGINS` includes `capacitor://localhost` (iOS) and `https://localhost` (Android).
- **Server package**: `backend/Dockerfile` (backend + Whisper model) for any cloud host. Not yet test-built.

## Steps when you are ready (not done yet)

1. **Put the backend online** (once): a host such as Railway, Render or AWS Mumbai (keeps data in India), using
   `backend/Dockerfile`. Use Supabase (Mumbai region) for the database and files (`docs/SUPABASE.md`). Put the keys in the
   host's environment settings. Note the address, e.g. `https://api.crpcopilot.in`.
2. **Add logins first.** Today anyone with the address sees all data. Before giving the app to anyone, add sign-in
   (for an app, token-based login such as Supabase Auth works best).
3. **Build the app files**: in `frontend`, set `NEXT_PUBLIC_API_BASE=https://api.crpcopilot.in` and
   `NEXT_PUBLIC_END_USER=1`, then `npm run build:app`.
4. **Wrap them with Capacitor** (free, by the Ionic team):
   ```
   npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios @capacitor/browser
   npx cap init "CRP Mentor Copilot" in.crpcopilot.app --web-dir app-build
   npx cap add android
   npx cap add ios
   npx cap sync
   ```
5. **Permissions**: Android `RECORD_AUDIO` (in `android/app/src/main/AndroidManifest.xml`); iOS
   `NSMicrophoneUsageDescription` and `NSPhotoLibraryUsageDescription` (in `ios/App/App/Info.plist`).
6. **Build**: Android Studio makes the APK / Play Store bundle (on Windows). The iOS app needs a Mac with Xcode and an
   Apple Developer account (99 USD per year).
7. **Updates**: changing pages means rebuilding the app files and running `npx cap sync`; server changes (AI, factors,
   data) need no app update at all.

## Teachers

Teachers use the teacher app (`teacher-app/`), which opens in any phone browser and can later be wrapped the same way. If teachers get the app later, the same
`/teacher?k=...` page works inside it.
