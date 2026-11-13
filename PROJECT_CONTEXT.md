# CRP Mentor Copilot: project context (read this first)

This file is the single starting point for anyone (person or AI assistant) working on the project. Give it to your AI
before your own prompt. It explains what the product is, how the code is organised, how to run it, the rules every change
must follow, and what is still to do in each area (security, frontend, backend, AI, mobile app, data).

Last updated: 1 November 2026.

---

## 1. What the product is

A **Cluster Resource Person (CRP)** in India mentors the teachers of about 10-15 government and low-fee private schools
(Classes 1-10). They cannot visit everyone often, so this app tells them **whom to visit first and why**, helps them run
the visit, and keeps teachers in touch between visits.

Main users: CRPs (main app), teachers (the separate `teacher-app/`: sign in with email + password, tasks, uploads, concerns), later block / district officials.

What it does:
1. **Priority list**: ranks schools and teachers 0-100 from 25 factors (learning gaps, unresolved issues, overdue
   follow-ups, time since last visit, attendance, girls enrolled, ...). Every score links to the exact file and row it
   came from. The CRP chooses factor weights, creates their own factors, and can pin / move / hold an entry by hand.
   **Reset** in the priorities panel goes back to the 5 main priorities we started with (`engine.DEFAULT_WEIGHTS`: learning gap 30,
   unresolved issue 25, overdue follow-up 20, time since visit 15, recurring need 10; everything else off; kept only after Save).
   A priority the CRP created can be **deleted** (trash icon; `DELETE /api/factors/{code}`); the 5 main and the ready-made ones can only be set to 0%.
2. **Upload**: drop many files (Excel, CSV, Word, PDF, scans, photos of handwritten notes, audio). Each is sorted to a
   school / teacher / type / date, checked for duplicates and conflicting numbers, confirmed by the CRP, then imported.
3. **Visit (4 steps)**: before class (history and brief) -> in class (record lesson, notes) -> students (4-5 suggested
   questions, record answers) -> results (evaluation against a teaching-research file, shown as short points, saved as
   observations and follow-ups that feed the ranking). The school / teacher header is shown on every step. In Results the CRP
   picks the follow-up time (default 14 days) and can make a **PDF report for the teacher** (what went well, where to improve,
   which questions to ask and how many, what was agreed) and send it: always into the teacher app (with an alert), and by email
   when SMTP is set up (`SMTP_*` in `.env.example`). Every school / teacher card has a **Visit** button.
4. **Teachers**: requests (send marks, plans, student work...; teachers cannot send or record audio), visit notices, messages, and a private teacher page.
5. **Textbooks**: search official sites and link a book to a teacher; the PDF is downloaded and remembered.
6. **Ask the copilot**: questions answered from the latest data.
7. **Sign in** (`/login`): every CRP signs in with email + password. A demo account (`DEMO_CRP_EMAIL`, default `crp1@gmail.com`) is made
   when the API starts and the sign-in page can fill it in; people can also make their own account. Demo and own accounts use the
   same table (`crp_accounts`), hashing, tokens and checks (`backend/app/services/crp_auth.py`, `backend/app/api/auth.py`). All
   accounts work on the one demo cluster today.
   **Show allocation** (Upload page, every file card): a table of which priority each part of the file feeds (data taken, number of records,
   an example, counted or not). Before Import it says what that kind of file feeds; after Import it reads the records the file really
   produced (`backend/app/services/ingest/allocation.py`, `GET /api/uploads/items/{id}/allocation`).
   **Speed between pages:** `frontend/lib/api.ts` keeps recent lookups for a few seconds (`keep()`; cleared by any save / upload / sign-in or
   sign-out; polled lists are never kept) and `api.warm()` fetches the next pages' data right after sign-in; `useLoad(..., lastKey)` shows the
   last list at once while a fresh one loads.
8. **Tutorial mode** (the graduation-cap button at the top): a guide walks through the whole app like a game: a strip of text, a glowing
   ring around the thing it talks about, a tapping hand when the person must tap, and a recorded voice. 51 steps, 11 languages
   (text for all; voice for 10, Odia has no voice file yet). Steps: `frontend/lib/tutorial/steps.ts`; words: `frontend/lib/tutorial/lang/*.json`
   (`t` = shown, `v` = spoken); voice files: `frontend/public/tutorial/voice/<lang>/<step>.mp3`, made by `tools/make_tutorial_voice.py`;
   screen: `frontend/components/tutorial/`. Things the guide points at carry a `data-tour="..."` marker. It greets "sir" / "ma'am" from the
   account's title.

Demo data: a fictional Pune-district cluster, 10 schools (S01-S10), 52 teachers, 48 files with planted problems
(duplicates, conflicts, invalid rows, missing data). See `docs/DATASET.md`. `evaluation/ground_truth` holds the answer
keys and must never be read by the app.

Final goal: an **Android / iOS app** for CRPs (the website wrapped with Capacitor). People who install it set up
nothing; everything technical runs on a server. See `docs/MOBILE_APP.md`.

---

## 2. Architecture

```
frontend (Next.js 15, React 19, Tailwind)  --HTTP JSON-->  backend (FastAPI, Python 3.12+)  -->  PostgreSQL
  website now; Android/iOS app later                          |-- background job workers (same DB table)
                                                              |-- AI layer: config/ai.json -> providers
                                                              '-- file storage (local folder or Supabase Storage)
```

- **Ranking engine** (`backend/app/services/prioritization/`): pure Python, deterministic (same data + weights + date =
  same result). Factors are rows in `priority_categories`; each points to a scorer function (`scorers.py`, `factors.py`)
  or the generic `fact_rule` (a number per school: higher / lower / below target / yes = visit sooner). Weights are
  versioned and frozen once active.
- **Ingest** (`backend/app/services/ingest/`): `readers.py` (free text/table extraction), `sorter.py` (school / type /
  date rules, AI only when unsure), `importer.py` (table parsers + AI extraction + validation), `pipeline.py`
  (batches, confirm, import jobs).
- **AI layer** (`backend/app/ai/`): the only place that talks to any AI. Each job is a named task with a fixed input
  and JSON output schema (`tasks.py`). `config/ai.json` lists, per task, providers to try in order (Claude, Gemini,
  Ollama, your own model over HTTP, local Whisper, Groq Whisper, free web search, `rules`). Answers are checked against
  the schema; `rules` (free, no AI) is always the last fallback so the app works with no keys. Current order for most
  jobs: Claude -> Gemini free tier -> Ollama -> rules. Every call is logged with cost in `llm_calls`; `AI_BUDGET_USD`
  caps paid AI. Gemini models are a list tried in order because Google retires models often. Speed: short jobs (briefing, student questions, factor ideas, ask) use `claude_quick` (Haiku, hidden thinking off, a few seconds); the lesson evaluation (a background job) uses `claude_mid` (Sonnet); Opus (`claude_smart`) is for scans. The research the AI must follow: `backend/app/knowledge/teaching_practices.md`.
- **Database connections** (`prioritization/data.py`): `get_conn()` hands out connections from a small pool (`DB_POOL_MAX`, default 8) and `Data` reads all tables in one batched round trip. A hosted database is far from the server, so every extra round trip or new connection costs real time. The free Render server sleeps after 15 minutes idle (first request can take up to a minute); the apps wake it on open (`ServerWake`) and retry lookups. To avoid it, ping `/api/health` every 5 minutes from a free uptime monitor, or use a paid instance.
- **Jobs** (`backend/app/jobs.py`, `job_handlers.py`): queue in `processing_jobs`; workers use
  `FOR UPDATE SKIP LOCKED`, so you can run many (`python -m app.jobs`).
- **Frontend**: all pages are client components. Menu and feature switches in `frontend/lib/app.config.ts`; every
  backend call in `frontend/lib/api.ts`; shared UI in `frontend/components/ui/`; web vs app differences in
  `frontend/lib/platform.ts`; text in `frontend/lib/lang/en.ts` (10 other Indian languages fall back to English).

---

## 3. Folder map

| Path | What |
|---|---|
| `backend/app/main.py` | FastAPI app: ranking, config, files; includes routers from `backend/app/api/` |
| `backend/app/api/` | `factors.py` (factors, facts, overrides), `uploads.py`, `visits.py` (visit steps + textbooks), `connect.py` (CRP <-> teacher), `assistant.py` (directory, ask, AI status / test / usage) |
| `backend/app/services/` | `prioritization/` (engine), `ingest/` (upload pipeline), `visit.py`, `textbooks.py` |
| `backend/app/ai/` | `tasks.py`, `registry.py`, `providers/` |
| `backend/app/core/storage.py` | local folder or Supabase Storage, same keys |
| `backend/requirements.txt`, `backend/Dockerfile` | dependencies; server image (not yet test-built) |
| `config/ai.json` | who does each AI task |
| `database/migrations/` | SQL, applied in order by `database/cli.py migrate` (0001-0019; `*.supabase.sql` = row-level security, Supabase only) |
| `backend/app/core/settings.py` | `TARGET=local|supabase` picks the database (`DATABASE_URL` / `SUPABASE_DATABASE_URL`) and storage |
| `database/seed_data/` | demo records (CSV) |
| `data/schools/` | demo source files (the uploads the records came from) |
| `frontend/app/` | pages: `/login` (sign in / new account), `/` priorities, `/upload` (add files), `/visit`, `/connect` (teachers), `/ask`, `/settings` (colours, layout, language, log out; nothing technical) |
| `teacher-app/` | the teachers' browser app (Next.js 15, same Evergreen look, port 3001): `cd teacher-app && npm install --legacy-peer-deps && npm run dev`. Sign in, tasks from the CRP, upload answers, send concerns, own visits. Backend: `backend/app/api/teacher_app.py`, `services/teacher_auth.py` |
| `landing/` | public landing page (separate Vite + React 19 + Tailwind 4 site): `cd landing && npm install && npm run dev` (port 5173). Every "Open the app" button goes to the app (`VITE_APP_URL`, default localhost:3000), and the app's logo goes back here (`NEXT_PUBLIC_LANDING_URL`, default localhost:5173) |
| `frontend/components/` | page parts; `ui/` shared kit; `shell/` menu and page frame |
| `docs/` | `REAL_WORLD_V2.md` (features), `SETUP_KEYS.md`, `MOBILE_APP.md`, `DATABASE.md`, `DATASET.md`, `SUPABASE.md` |
| `evaluation/` | tests and answer keys |
| `generator/` | rebuilds the demo dataset |

---

## 4. Run it from a fresh clone

Needs: Python 3.12+, Node 20+, and PostgreSQL 17 (easiest: Docker).

```
git clone https://github.com/janhavideshmukh860-svg/yes_123.git
cd yes_123
git checkout real-world-v2
copy .env.example .env                        (Mac/Linux: cp)
docker compose up -d db                       (or install PostgreSQL yourself; Windows portable option: docs/DATABASE.md)
python -m venv backend/.venv
backend/.venv/Scripts/python -m pip install -r backend/requirements.txt     (Mac/Linux: backend/.venv/bin/python)
backend/.venv/Scripts/python database/cli.py setup                          (tables + demo data)
cd backend && .venv/Scripts/python -m uvicorn app.main:app --port 8000      (API at http://localhost:8000/docs)
cd frontend && npm install && npm run dev                                    (website at http://localhost:3000)
```

On Windows, `powershell -File start.ps1` starts database (portable), API and website together once set up.
Online database: `docs/SUPABASE.md` (create a Mumbai project, paste 3 values, set `TARGET=supabase`, run
`database/cli.py setup`). AI keys are optional: `docs/SETUP_KEYS.md`. Without keys everything still works using the free rules and local Whisper
(the Whisper "base" model downloads about 145 MB the first time audio is transcribed).

---

## 5. Rules for every change (people and AIs)

1. **Never commit secrets**: `.env`, API keys, database dumps, real student data. Keys live only in `.env` or the host's
   environment settings, never in the frontend or the app.
2. **AI only through `ai.run('<task>', input)`**. Never call a provider or name a model in feature code. New AI job =
   new task in `backend/app/ai/tasks.py` (+ schema) + a rule-based fallback in `providers/rules.py` + an entry in
   `config/ai.json`.
3. **Factors are data, not code paths**: add a scorer function and a row (migration) in `priority_categories`; never
   hard-code factor lists in the frontend.
4. **Keep the ranking deterministic** and explainable: every score has an explanation and links to its records. After
   engine changes run `evaluation/prioritization_tests/run_engine.py` and check the original 5-factor ranking is unchanged
   unless that is intended.
5. **Database changes = a new numbered migration** in `database/migrations/` (never edit an applied one).
6. **Frontend**: backend calls only in `lib/api.ts`; menu / features in `lib/app.config.ts`; reuse `components/ui`;
   new text in `lib/lang/en.ts`; web-vs-app differences only in `lib/platform.ts`.
7. **App-ready frontend**: no Next.js server features (no server actions, API routes, middleware, `cookies()`),
   no dynamic route folders like `[id]` (use `?id=` query parameters), links outside the app via `openExternal`. Check
   with `npm run build:app`.
8. **Plain language** in the UI: users are CRPs and teachers, not engineers.
9. **Windows note**: do not run uvicorn with `--reload` on Windows (reloading hangs); restart after backend edits.
10. **Work on a branch** named for your area (e.g. `security/auth`, `frontend/translations`) and open a pull request into
    `real-world-v2` (or `main` once merged). Do not push to `main` directly.

---

## 6. Status and what each area should pick up

### Done (real-world-v2)
25 factors + custom factors + manual overrides; bulk upload with sorting / validation / background import; 4-step visit
evaluation; CRP <-> teacher requests and messages; numbered tasks per request (Task 1, 2, 3) with per-task uploads, accept / reject (remarks) and add-to-records, teacher app (`teacher-app/`, browser version) with logins and phone/browser alerts (Web Push, VAPID keys in `.env`: `python database/cli.py vapid-keys`; no Firebase needed for the browser app; Firebase would only be needed for a native Android build); textbook search + PDF download; replaceable AI layer with
cost log and free connection test; job queue; app-ready frontend (single API address, static export build, phone layout,
bottom menu); free local speech-to-text verified (99% word match on a demo recording).

Not yet checked: real AI answers with a Claude key (no key was set while building; the rule-based fallbacks were tested);
`backend/Dockerfile` build; `npm run build:app` (it stalled downloading Google fonts on a slow network; consider self-hosted
fonts).

### Security (highest priority before any real use)
- **CRP login exists** (bearer token on every call; a read-only cookie only so the browser can open recordings / PDFs by itself; everything
  under `/api` except health, auth, the teacher app and the signed report link needs it: `require_crp` in `backend/app/main.py`).
  **Still missing:** data is not yet limited per CRP (every account sees the one cluster), no email check or password reset, anyone can
  make an account. Next: Supabase Auth or the same tokens with per-cluster checks. Roles: CRP, teacher, admin, viewer
  (`app_users.role` exists). Every API route must check the user and limit data to their cluster / schools
  (`school_assignments`). Supabase row-level security draft: `database/migrations/0005_rls.supabase.sql`.
- Teacher app logins: demo accounts are `firstname.lastname@crp.com` with the shared demo password (`DEMO_TEACHER_PASSWORD`, default `pass123`). Before real use: set a strong `TEACHER_AUTH_SECRET`, give each teacher their own password (they can change it in the app), and move to Supabase Auth if wanted. Teacher tokens last 30 days; wrong-password attempts are rate limited per email (in memory only).
- File uploads: size limits exist (500 MB batch, 200 MB per file); add file-type checks by content, a virus scan, limits
  on zip contents (zip bombs), and safe file names.
- `ALLOWED_ORIGINS` (CORS) must list only real domains in production; HTTPS everywhere.
- Rate limiting on AI-backed endpoints (`/api/ask`, `/api/factors/suggest`, `/api/sessions/*/questions|evaluate`,
  `/api/textbooks/search`) so the API budget cannot be drained.
- Textbook download (`services/textbooks.py`) fetches any URL the user gives: restrict to http(s), block internal
  addresses (SSRF), keep the 80 MB cap.
- Privacy (India DPDP Act 2023): consent for recordings of children, data stored in India (Supabase Mumbai), retention
  and deletion, no student names in records (current design: class-level data, "Student A" labels). Free AI tiers
  (Gemini free) must never receive real student data.
- Audit log exists (`audit_logs`) for factor and override changes; extend to logins and data exports.

### Frontend
- Translate the new screens (Upload, Visit, Teachers, Settings, factor panels) into the 10 other languages in
  `frontend/lib/lang/*.ts` (move page text into `en.ts` keys first).
- Self-host fonts (replace `next/font/google` downloads) so builds work offline and the app needs no network for fonts.
- Mobile polish: test every page at phone width; offline-friendly states; large touch targets.
- Accessibility: labels, focus order, colour contrast.
- Then: Capacitor app (`docs/MOBILE_APP.md`).

### Backend / AI
- Test the Claude path end to end once a key is added (`POST /api/ai/test`, then a real upload and a visit
  evaluation); tune prompts in `backend/app/ai/tasks.py`.
- Evaluation set for extraction: compare AI-extracted records with `evaluation/ground_truth/file_to_records.json`.
- Real-classroom audio (noise, Marathi / Hindi): try Whisper `small`/`medium` or an Indian-language speech service via a
  new provider.
- Deploy: host the backend (Dockerfile), database + storage on Supabase (Mumbai), workers as a second process.

---

## 7. Key API endpoints (all under `/api`)

Ranking: `GET config`, `POST ranking`, `POST evidence`, `POST config/apply`, `GET schools/{id}/files`, `GET files/{id}/preview|raw|page/{n}`.
Factors: `GET factors`, `GET factors/{code}/preview`, `POST factors/suggest`, `POST factors`, `PATCH|DELETE factors/{code}`,
`GET|POST facts/{key}`, `POST facts/{key}/upload`, `GET|POST overrides`, `DELETE overrides/{id}`.
Uploads: `POST uploads` (multipart files), `GET uploads`, `GET uploads/{id}`, `PATCH uploads/items/{id}`, `POST uploads/{id}/import`.
Visits: `GET brief`, `POST sessions`, `GET|PATCH sessions/{id}`, `POST sessions/{id}/media|questions|evaluate|save`, `DELETE sessions/{id}/media/{mid}`, `GET sessions/{id}/report.pdf` (teacher report), `POST sessions/{id}/report/send` (teacher app + email), `GET report/{id}.pdf?sig=` (signed link used inside the teacher app).
Textbooks: `GET textbooks/search`, `POST|GET resources`, `DELETE resources/{id}`.
Connect (CRP side): `GET connect/overview`, `GET task-options`, `POST|GET requests` (a request holds numbered tasks = `task_items`), `PATCH requests/{id}`, `POST task-items/{id}/review` (accept, optionally adding the files to the records, or reject with remarks), `GET uploads/items/{id}/raw` (open a teacher's file), `GET|POST teachers/{id}/messages`, `GET notifications`, `POST notifications/read`.
Teacher app (`/api/teacher/...`, bearer token): `POST login`, `GET home`, `POST submit` (per `item_id`), `POST messages` (concern), `GET visits`, `POST password`, `POST notifications/read`, `GET push/key`, `POST push/subscribe|unsubscribe|test`.
Sign in: `GET auth/demo`, `POST auth/login|signup|logout|password`, `GET auth/me`.
AI: `GET ai/status`, `POST ai/test`, `GET ai/usage`, `POST ask`. Full interactive list: `http://localhost:8000/docs`.

## Upload: new school / no school detected
- `ingest/newschool.py` (free rules, no AI) runs in `pipeline.create_batch` when no known school matches: stores `upload_items.detected` (migration 0020: `{kind:'new_school', school, teachers, data}` or `{kind:'no_school'}`). The Add files page shows a panel under the file: View details / Add school and data / Remove data (skip), or for no school: choose a school / Remove data.
- `POST /api/uploads/items/{id}/add-school` creates the school (next code S##, assigned to the first CRP), the ticked teachers, and files the upload under it. `refreshDirectory()` now notifies every `useDirectory()` user. New schools have empty village/taluka (the ranking handles that).
- Migration 0020 must be applied to Supabase before deploying this.
- View details reads the file with the same extraction Import uses (`newschool.read_data`, AI only if the free rules find nothing). It runs in a background thread right after upload and is kept in `detected.data.found` (`GET /api/uploads/items/{id}/found`), so upload stays fast. Import reads the file again.
- Settings has a temporary "AI credits by key" card (`/api/ai/usage` -> `by_key`: Claude, Gemini, Groq; each shows key connected, cost, calls, tokens). "Left" uses the credit the CRP types per key (kept in the browser): provider balances cannot be read. Remove the card when no longer needed.
