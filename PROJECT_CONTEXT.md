# CRP Mentor Copilot: project context (read this first)

This file is the single starting point for anyone (person or AI assistant) working on the project. Give it to your AI
before your own prompt. It explains what the product is, how the code is organised, how to run it, the rules every change
must follow, and what is still to do in each area (security, frontend, backend, AI, mobile app, data).

Last updated: 27 October 2026 (branch `real-world-v2`).

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
2. **Upload**: drop many files (Excel, CSV, Word, PDF, scans, photos of handwritten notes, audio). Each is sorted to a
   school / teacher / type / date, checked for duplicates and conflicting numbers, confirmed by the CRP, then imported.
3. **Visit (4 steps)**: before class (history and brief) -> in class (record lesson, notes) -> students (4-5 suggested
   questions, record answers) -> results (evaluation against a teaching-research file, saved as observations and
   follow-ups that feed the ranking).
4. **Teachers**: requests (send marks, plans, a lesson recording...), visit notices, messages, and a private teacher page.
5. **Textbooks**: search official sites and link a book to a teacher; the PDF is downloaded and remembered.
6. **Ask the copilot**: questions answered from the latest data.

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
  caps paid AI. Gemini models are a list tried in order because Google retires models often. The research the AI must follow: `backend/app/knowledge/teaching_practices.md`.
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
| `database/migrations/` | SQL, applied in order by `database/cli.py migrate` (0001-0010; `*.supabase.sql` = row-level security, Supabase only) |
| `backend/app/core/settings.py` | `TARGET=local|supabase` picks the database (`DATABASE_URL` / `SUPABASE_DATABASE_URL`) and storage |
| `database/seed_data/` | demo records (CSV) |
| `data/schools/` | demo source files (the uploads the records came from) |
| `frontend/app/` | pages: `/` priorities, `/upload`, `/visit`, `/connect`, `/settings`, `/teacher?k=` |
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
evaluation; CRP <-> teacher requests and messages; teacher app (`teacher-app/`, browser version) with logins and phone/browser alerts (Web Push, VAPID keys in `.env`: `python database/cli.py vapid-keys`; no Firebase needed for the browser app; Firebase would only be needed for a native Android build); textbook search + PDF download; replaceable AI layer with
cost log and free connection test; job queue; app-ready frontend (single API address, static export build, phone layout,
bottom menu); free local speech-to-text verified (99% word match on a demo recording).

Not yet checked: real AI answers with a Claude key (no key was set while building; the rule-based fallbacks were tested);
`backend/Dockerfile` build; `npm run build:app` (it stalled downloading Google fonts on a slow network; consider self-hosted
fonts).

### Security (highest priority before any real use)
- **No login yet: anyone who can open the API sees everything.** Add authentication (recommended: Supabase Auth or
  JWT bearer tokens, which work in the mobile app; avoid cookie-only sessions). Roles: CRP, teacher, admin, viewer
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
- Test the Claude path end to end once a key is added (Settings > Test AI connections, then a real upload and a visit
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
Visits: `GET brief`, `POST sessions`, `GET|PATCH sessions/{id}`, `POST sessions/{id}/media|questions|evaluate|save`, `DELETE sessions/{id}/media/{mid}`.
Textbooks: `GET textbooks/search`, `POST|GET resources`, `DELETE resources/{id}`.
Connect: `GET connect/overview`, `POST|DELETE teachers/{id}/link`, `POST|GET requests`, `PATCH requests/{id}`, `GET|POST teachers/{id}/messages`, `GET notifications`, `POST notifications/read`.
Teacher page: `GET t/{token}`, `POST t/{token}/messages`, `POST t/{token}/submit`.
AI: `GET ai/status`, `POST ai/test`, `GET ai/usage`, `POST ask`. Full interactive list: `http://localhost:8000/docs`.
