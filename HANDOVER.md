# HANDOVER CAPSULE: CRP Mentor Copilot (read this first, then PROJECT_CONTEXT.md)

Purpose: anyone (a person, or an AI assistant on a different account or computer) who opens this folder must be able to understand the
whole project and continue exactly where the last session stopped. `PROJECT_CONTEXT.md` explains the **product and the code**; this file
explains **the state, the accounts, the deployments, the way we work and what is next**.

> **Secrets are never written here.** This repository is public. Passwords, API keys and database addresses live only in `.env` on the
> owner's computer and in the Render / Vercel settings (names are listed in section 2). If you need a value, ask the owner or read it there.

**RULE FOR EVERY SESSION (important):** when you change anything that matters (a feature, a deployment, an account, a rule, a decision),
add a line to section 10 (change log) and fix any section that is no longer true, in the same pull request. Update the "Last updated" line.

Last updated: 14 November 2026 (after PR #30).

---

## 1. The project in plain words

**CRP Mentor Copilot** helps a *Cluster Resource Person* (CRP, a mentor of about 10-15 government / low-fee private schools in India,
Classes 1-10) decide **whom to visit first and why**, run the visit, keep records per school, and stay in touch with teachers.
Main aim of the hackathon entry ("AI for Foundational Learning"): good, simple, trustworthy decision support, not a dashboard of numbers.

What it does (details: `PROJECT_CONTEXT.md` section 1):
1. **Priority list** of schools and teachers (0-100, 25 factors, every score links to the file and row it came from; the CRP can change weights and add factors; Reset / Delete priorities).
2. **Upload**: drop many files (Excel, CSV, Word, PDF, scans, photos, audio, zip). Sorted to school / teacher / kind / date, duplicates found, the CRP checks, then Import. Shows a **new school** panel (add school + teachers + data) or **no school found**; **Show allocation** table.
3. **Visit (4 steps)**: before class (brief, history, tabs) -> in class (record lesson, notes by typing / voice / photo / quick notes / translate to English) -> students (questions, record each answer as Student A, B...) -> results (AI evaluation; the mentor can check or change each AI verdict on a student answer). Saved into the records. A **teacher report PDF** (8-9 pages) can be made and sent.
4. **Teachers**: requests/tasks, notices, messages (the teacher app is separate).
5. **Textbooks** search/link, **Ask the copilot**, **Settings** (colours, layout, language, temporary "AI credits by key" card, log out), **Tutorial** (guided tour, text + voice).
6. Records belong to the **school**, not to the mentor: a new mentor sees the whole history; each visit stores who made it (`mentor_name`).

Owner / main user: the account that owns the GitHub repo (section 2). Final goal: an Android / iOS app (Capacitor) later (`docs/MOBILE_APP.md`).

## 2. Accounts, links and where things live (no secrets)

| Thing | Value / how it is used |
|---|---|
| GitHub repo (canonical) | `https://github.com/aaditya24127/yes_123` : public, MIT licence, default branch `main`. The old address `janhavideshmukh860-svg/yes_123` redirects here (it was the original owner's name; early PRs #1-#4 and `origin` in old clones still use it). |
| Who owns / merges | `aaditya24127` merges **every** PR on GitHub. Two early PRs were merged by a teammate, `rohanol`. Collaborator `csfEvaluation` was invited (accepted or pending: check Settings > Collaborators). |
| Who pushes | The assistant pushes **feature branches only** (never `main`) using the GitHub login saved on the owner's Windows PC (git `user.name` = `aaditya24127`). On a different computer / account, sign in to GitHub there (or use a personal access token) and run `tools/push_branch.py`. Then give the owner the "create pull request" link. The owner merges. |
| Live website (frontend) | **Vercel** project `crp-mentor-copilot` -> `https://crp-mentor-copilot.vercel.app` (auto-deploys on merge to `main`, about 2 minutes). Setting `BACKEND_URL` = the Render address; `/api/*` is forwarded to it by `frontend/next.config.mjs`. |
| Live API (backend) | **Render** web service `crp-mentor-backend` -> `https://crp-mentor-backend.onrender.com` (Docker, built from `backend/Dockerfile`, auto-deploys on merge, a few minutes). On every start it runs `database/cli.py migrate`, so **new migrations reach the live database automatically when a PR is merged**. Free plan: sleeps after 15 min idle. |
| Keep-awake | **UptimeRobot** monitor pings `https://crp-mentor-backend.onrender.com/api/health` (set up by the owner; check the interval in the UptimeRobot dashboard, 5 minutes is intended). The app also wakes the server on open (`ServerWake`) and retries busy lookups. |
| Database + files | **Supabase** (Postgres + Storage; the docs advise a Mumbai project). Variables: `SUPABASE_DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_BUCKET`, `STORAGE_BACKEND=supabase`. `TARGET=supabase` selects it. Row-level security files are `*.supabase.sql`. |
| AI keys | `ANTHROPIC_API_KEY` (Claude, paid), `GEMINI_API_KEY` (free tier), `GROQ_API_KEY` (Whisper speech-to-text, free tier), `AI_BUDGET_USD` (cap on paid AI). Settings > "AI credits by key" shows what the app has spent per key. Real balances are only on each provider's billing page. |
| Other settings | `ALLOWED_ORIGINS` (must list the Vercel address), `WORKERS_IN_API=4`, `TEACHER_AUTH_SECRET`, `DEMO_TEACHER_PASSWORD`, `DEMO_CRP_LOGIN/EMAIL/PASSWORD`, `VAPID_*` (web push), `SMTP_*` (optional email). Full list: `.env.example`. |
| Where the real values are | Owner's `D:\CRP\yes_123-main\.env` (git-ignored) and the **Render > Environment** and **Vercel > Settings > Environment Variables** pages. |
| Demo sign-in (CRP app) | `crp1@gmail.com` / `pass123` (the login page has a "Fill in the demo account" link). Teachers' demo accounts: `firstname.lastname@crp.com` / `pass123`. Anyone can also create an own CRP account. |
| Not verified / unknown | Whether `landing/` (public landing page) and `teacher-app/` are deployed anywhere, and under which account. Ask the owner before assuming. |

## 3. Look and feel (do not change without being asked: the owner is strict about "no disturbing the UI")

- **Default theme "Evergreen"**: page `#EDF6EE`, surface `#FBFEFB`, brand 600 `#235347`, dark text `#051F20`. Eight themes in the sun switcher (`frontend/lib/theme.ts`): Royal blue, Evergreen, Deep teal, Plum, Crimson dusk, Fiery ocean, Burgundy sand, Papyrus.
- Priority bands: Critical red, High orange, Medium (brand colour), Low green. Soft rounded cards (`rounded-3xl`), serif headings, calm, little text, big touch targets, phone-first (bottom menu on phones).
- Layout options for the priority list: Cards, One by one, Sideways.
- **Languages (11)**: English, Hindi, Bengali, Marathi, Telugu, Tamil, Gujarati, Urdu, Kannada, Odia, Malayalam. Menus use `frontend/lib/lang/*`; new screens (Upload, Visit, Teachers, Settings, factor panels) are mostly **English only** so far.
- **Tutorial** (graduation-cap button): 51 steps, text in 11 languages, recorded voice in 10 (Odia text only). It does **not yet** cover the newest Upload / Visit buttons.
- Report PDF colours: deep green `#235347`, teal `#2f8f7a`, sand `#f4f1e8`, amber `#e3a73b` and coral `#d8674f` only for "needs attention". Plain, short, human sentences.
- Pages: `/login`, `/` (priorities), `/upload` (Add files), `/visit`, `/connect` (Teachers), `/ask`, `/settings`.

## 4. Tech stack

Next.js 15 + React 19 + Tailwind (frontend, client components only, app-ready) | FastAPI + psycopg + PostgreSQL | background jobs in the same DB table
(`processing_jobs`, 4 worker threads inside the API) | AI layer with provider chains (`config/ai.json`, `backend/app/ai/`) | file storage local or Supabase |
reportlab + matplotlib for the teacher report | Groq Whisper for speech-to-text (ffmpeg via `imageio-ffmpeg` re-packs recordings over 24 MB) |
Playwright (Python) used by the assistant for browser tests. AI models: Claude Haiku 5.5 (quick jobs), Sonnet 5.5 (lesson evaluation, photo reading), Opus 5.5 (scans).
Which AI does which task: `config/ai.json` (the `tasks` list); the free `rules` fallback is always last.

## 5. Database

Migrations `database/migrations/0001` ... `0021` (never edit an applied one; add a new number). Recent ones: `0018_crp_accounts` (logins),
`0019` (its RLS), `0020_upload_detected` (`upload_items.detected` = new school / no school found), `0021_mentor_name_and_review`
(`visit_sessions.mentor_name`, `visits.mentor_name`). The mentor's check of an AI verdict is stored **inside** `visit_sessions.result`
(no column). Demo data: fictional Pune cluster, schools S01-S10, 52 teachers (`docs/DATASET.md`).
`database/cli.py migrate|seed|setup|status|verify`.

## 6. Run it on the owner's Windows PC (and the traps)

- Folder layout: the outer folder `D:\CRP` is an old git repo (ignore it). **The project is `D:\CRP\yes_123-main`** (a plain folder, *not* a git checkout of the GitHub repo; it has no `.git`). The working local PostgreSQL is portable: start it with `powershell -File D:\CRP\tools\pg.ps1 start` (data in `D:\CRP\database\pgdata`; if Windows restarted it recovers on start). Check `Get-NetTCPConnection -LocalPort 5432`.
- **DANGER: `.env` has `TARGET=supabase`**, so any script that imports the app without overriding it talks to the **LIVE database**. For local work always set `TARGET=local` **and** `DATABASE_URL` (the local one, same `.env` file) in the same command before running Python or the API. Never run cleanup scripts against live.
- API (port 8000), from PowerShell: set `$env:TARGET='local'` and `$env:DATABASE_URL` (value of `DATABASE_URL` in `.env`), then `backend\.venv\Scripts\python.exe -W ignore -m uvicorn app.main:app --port 8000` from the `backend` folder. No `--reload` on Windows: restart after backend edits (stop with `Get-CimInstance Win32_Process | ? CommandLine -match uvicorn | Stop-Process`). If the API hangs at "Waiting for application startup", the local database is not running.
- Frontend (port 3000): `cd frontend; npm run dev`, or in Claude's desktop app use `preview_start crp-app` (`.claude/launch.json`). Teacher app port 3001, landing port 5173.
- Local demo sign-in is the same demo account. First request after start compiles pages (slow once).
- Browser tests: Python 3.13 (`C:\Users\aadit\AppData\Local\Programs\Python\Python313\python.exe`) with Playwright and `channel='chrome'`; edge-tts (Python 3.12 Scripts) made the test voices.
- Windows quirks: use `python -W ignore`; Python on Windows cannot see `/tmp` of Git Bash (use real Windows paths); mp3 / images must never go through line-ending changes.
- Local-only files that are **not** in the repo: `docs/CRP_Mentor_Copilot_Deck.pptx` (8-slide deck), `D:\CRP\stepguide\` (Step Guide PDF), `D:\CRP\test_audio\` (40-minute Pythagoras lesson mp3 for load tests, a sample visit report PDF). Ask the owner before publishing them.

## 7. How we deliver changes (follow this every time)

1. Never push to `main`. Never change the **live** database or Render / Vercel settings without the owner saying yes (migrations still reach Supabase automatically when a PR is merged, because Render runs them on start).
2. Work, test locally (desktop **and** phone width, and the live demo account where it matters), keep the UI style unchanged unless asked.
3. When done, **ask the owner what the commit message should be** (they like short, plain, not-too-revealing names such as "Polish intake flow 2", "Tidy screens and system use", "Faster report"; suggest 2-3 if asked). One pull request per batch.
4. Push a branch with `python tools/push_branch.py "Commit message"` (see the script's header: it clones the repo into a temp folder, branches from `origin/main`, copies the changed files from this folder, keeps each file's line endings, scans for secrets, commits with the trailer, pushes and prints the pull-request link). Commit ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; a PR description ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
5. Give the owner the link `https://github.com/aaditya24127/yes_123/pull/new/<branch>` and a ready PR description. The owner merges. Vercel (about 2 min) and Render (a few minutes) deploy.
6. After the owner says "merged": verify on the live site: `/api/health`, demo sign-in, the pages, the changed feature. Report honestly what was and was not verified.
7. Update this file (section 10) and `PROJECT_CONTEXT.md` in the same PR.

## 8. Decisions already made (do not reopen without asking)

- Recordings and photos used for notes or student answers are **never stored**, only the text. (Lesson recordings and Upload-page files are stored as source files.)
- Translation is **English only** (one button: Translate to English / Show original). Notes can be spoken in any language, also mixed.
- Records belong to the school; mentors are only labels on visits. The mentor's check of an AI verdict never overwrites the AI's answer and **does not change priorities** (it shows in the PDF).
- No fake data on the live site; test visits are cancelled afterwards.
- Plain, short, human wording everywhere; no jargon; the report is written by hand (templates), only the facts of the visit come from the AI.
- Keep the Evergreen look, rounded cards, and the existing screens' structure.

## 9. Open work / remember to remind the owner

- **Hackathon guideline points 4 and 5 are deferred and must be offered again**: (4) test with people outside the team (a 5-minute task script for 2-3 testers, fix steps that need more than 3 taps); (5) personas (mentor, teacher, an optional read-only block-officer overview).
- Tutorial steps for the newest buttons (New school / Edit details / notes box / mentor check) in all languages + voice; Odia voice.
- Translate the newer screens into the other 10 languages (text moved to `lib/lang`).
- PDF report cannot draw Devanagari / other Indian scripts (DejaVu font); needs a Noto font if names must show in them.
- Security list in `PROJECT_CONTEXT.md` section 6 (per-CRP data limits, password reset / email check, rate limits on AI endpoints, upload checks, SSRF guard for textbook download, privacy / consent for recordings).
- Visit page: whole-school history is shown, but there is no "move a school to another mentor" action.
- Deployment of `teacher-app/` and `landing/` is unconfirmed (section 2).
- Optional ideas not built: tidy-my-notes button, pick actions out of speech, offline recording, share a translated summary with the teacher.

## 10. Change log (newest first; PR numbers are on GitHub)

- **Project capsule** (this PR): added `HANDOVER.md`, `tools/push_branch.py`, CLAUDE.md / AGENTS.md load the capsule, stale facts in `PROJECT_CONTEXT.md` fixed.
- **#30 Report ready sooner**: the teacher report is drawn in the background when a visit's evaluation finishes.
- **#29 Faster report**: report cache (last 12), lighter pictures.
- **#28 Better teacher report**: 8-9 page PDF (reportlab + matplotlib), 3D bar chart and pie, then-and-now tables, hand-written hands-on ideas (chalk, pencils, yard), research notes.
- **#27 Student voice fix**: student answers up to 2 minutes are turned into text at once; "Student A: Heard / Not heard" cards; silence or "you" is refused; recorders check a sound was heard.
- **#26 Faster import and voice** (includes the earlier "Tidy screens and system use"): 4 import workers (8 files 95 s -> 23 s), files of one upload sorted side by side, short AI summaries ("More notes"), voice-note silence guard + live level bar; one-line Upload rows, slim yellow bars, "Next:" line, Visit tabs, file names no longer taken as school names; recordings over 24 MB re-packed; long lessons keep start and end.
- **#25 Visit notes and records tidy-up**: mentor check of AI verdicts, mentor name on visits + "Visits to this school", notes box (speak, upload voice, photo, quick notes, translate to English). Migration 0021.
- **#22-#24 Polish intake flow 1-3**: Show allocation table, new school / no school panels (migration 0020), details read from the file, Settings "AI credits by key", faster page moves (answer cache + warm-up).
- **#21** login (`crp_accounts`) + tutorial in 11 languages + voice. **#20** MIT licence. **#19, #18** warm-up and busy-server retry. **#17** README audit. **#16** priorities Reset / Delete.
- **#1-#15** foundation: ranking engine, upload pipeline, visit flow, teacher app + web push, sample data, speed fixes, mobile layout, security upgrade of Next.js.

## 11. Quick checks (copy-paste)

- Live health: `curl https://crp-mentor-backend.onrender.com/api/health` -> `{"ok":true}`; through the website: `https://crp-mentor-copilot.vercel.app/api/health`.
- Live sign-in test: POST `/api/auth/login` with the demo account on the Vercel address returns a token.
- Teacher report on a finished visit: `GET /api/sessions/{id}/report.pdf` with `Authorization: Bearer <token>` (about 1 s warm, 6 s cold on the live server).
- Voice test files: `D:\CRP\test_audio\pythagoras_lesson_40min.mp3` (read in about 26 s, evaluated in about 19 s).
