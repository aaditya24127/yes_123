# CRP Mentor Copilot

Decision support for **Cluster Resource Persons (CRPs)** in India. A CRP mentors the teachers of 10-15 schools and cannot visit
everyone often. The app tells them **whom to visit first and why**, helps them run the visit, and keeps teachers in touch between
visits. **Python computes every score. AI only explains or extracts. The CRP decides.**

| | Link |
|---|---|
| Landing page (opens the system) | https://crp-landing-xi.vercel.app |
| CRP app | https://crp-mentor-copilot.vercel.app |
| Teacher app | https://crp-teacher-app.vercel.app |

The free server sleeps when idle, so the first open can take up to a minute. All data in the demo is **fictional** (a made-up
Pune-district cluster: 10 schools, 52 teachers). Teacher demo accounts are `firstname.lastname@crp.com`; the shared demo password
is set by `DEMO_TEACHER_PASSWORD` (see Configuration) and is only for this fictional data.

## What is in this repository

```
frontend/     CRP web app (Next.js 15, React 19, Tailwind)             http://localhost:3000
teacher-app/  Teachers' web app (Next.js 15)                           http://localhost:3001
landing/      Public landing page (Vite, React 19, Tailwind 4)         http://localhost:5173
backend/      API and background jobs (FastAPI, Python 3.12+)          http://localhost:8000  (docs at /docs)
database/     PostgreSQL migrations, demo records, setup command
config/       ai.json: which AI does which job
data/, sample data/   fictional demo files and practice visits (lesson audio, notes photos, READ_MEs)
evaluation/   tests and answer keys   |   docs/   guides   |   generator/   rebuilds the demo dataset
```

```
browsers --> frontend / teacher-app / landing --/api--> FastAPI --> PostgreSQL (local or Supabase)
                                                          |--> file storage (local folder or Supabase Storage)
                                                          |--> AI layer (config/ai.json) --> Claude / Gemini / Ollama / own model / free rules
                                                          '--> background jobs (imports, transcription, lesson evaluation)
```

More detail: [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md) (read this first when changing anything) and the guides in [`docs/`](docs).

## Setup (run it on your computer)

Needs **Python 3.12+**, **Node.js 20+** and **PostgreSQL 17** (easiest with Docker). No AI key is needed: without keys the app uses
free built-in rules and free local speech-to-text.

```bash
git clone https://github.com/aaditya24127/yes_123.git
cd yes_123
cp .env.example .env                           # Windows: copy .env.example .env
docker compose up -d db                        # local PostgreSQL (or install PostgreSQL; Windows portable option: docs/DATABASE.md)

python -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.txt        # Windows: backend\.venv\Scripts\python
backend/.venv/bin/python database/cli.py setup                              # creates tables, loads demo data, checks it

cd backend && .venv/bin/python -m uvicorn app.main:app --port 8000          # API
cd frontend && npm install && npm run dev                                   # CRP app, new terminal
cd teacher-app && npm install --legacy-peer-deps && npm run dev             # teacher app, new terminal (optional)
cd landing && npm install && npm run dev                                    # landing page, new terminal (optional)
```

On Windows, `powershell -File start.ps1` starts the database, API and all three web apps once the steps above are done.
Do not run uvicorn with `--reload` on Windows. The first recording you transcribe downloads the free Whisper "base" model (about 145 MB).

Useful commands: `python database/cli.py status | verify | migrate | seed`, `python database/cli.py vapid-keys` (once, for phone alerts).

## Configuration

Everything is set in a `.env` file at the project root (copy `.env.example`). **`.env` is git-ignored: never commit it.** The apps
that run on Vercel use the host's environment settings instead.

| Setting | Needed? | What it does |
|---|---|---|
| `TARGET` | yes | `local` (default) or `supabase`: picks the database and file storage |
| `DATABASE_URL` | yes (local) | PostgreSQL address. The default in `.env.example` matches `docker-compose.yml` (local use only) |
| `SUPABASE_DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_BUCKET` | only for `TARGET=supabase` | online database and files (Mumbai region): [`docs/SUPABASE.md`](docs/SUPABASE.md) |
| `ANTHROPIC_API_KEY` | optional | Claude. Empty = Claude is skipped |
| `AI_BUDGET_USD` | optional | cap in US dollars for paid AI; when the logged cost reaches it, paid AI is skipped |
| `GEMINI_API_KEY`, `READ_PROVIDER=gemini` | optional | Gemini free tier, second choice after Claude. **Demo data only** |
| `GROQ_API_KEY` | optional | faster speech-to-text. Without it Whisper runs on the server |
| `TEACHER_AUTH_SECRET` | **set a long random value** | signs teacher login tokens and report links |
| `DEMO_TEACHER_PASSWORD` | demo only | password of the fictional teacher accounts. Change it, or remove demo accounts, before real use |
| `ALLOWED_ORIGINS` | production | websites allowed to call the API (add your real domains) |
| `WORKERS_IN_API` | optional | `1` runs background jobs inside the API; run `python -m app.jobs` for more capacity |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | optional | phone / browser alerts (Web Push). Empty = alerts off |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | optional | email for visit reports. Empty = reports still reach the teacher app |

Website settings (build-time): `BACKEND_URL` (frontend and teacher-app: where `/api/...` is forwarded; default `http://127.0.0.1:8000`),
`NEXT_PUBLIC_LANDING_URL` (CRP app: where the logo leads), `VITE_APP_URL` (landing: where "Open the app" leads),
`NEXT_PUBLIC_API_BASE` and `NEXT_PUBLIC_END_USER=1` (phone-app build, see [`docs/MOBILE_APP.md`](docs/MOBILE_APP.md)).

Keys can be checked without spending credit on **Settings > Test AI connections**. Step-by-step key setup: [`docs/SETUP_KEYS.md`](docs/SETUP_KEYS.md).

## External AI models and services

All AI goes through one place, `backend/app/ai/`, and `config/ai.json` lists, for each job, which providers to try in order.
Every answer is checked against a fixed format; if a provider is missing, over budget or answers badly, the next one is tried, and
the free `rules` provider is always last, so the app still works with no keys at all.

| Service | Used for | Models | Key | Cost |
|---|---|---|---|---|
| **Anthropic Claude** | reading files, briefing, student questions, lesson evaluation, "Ask", factor ideas, textbook search | `claude-haiku-5-5` (short jobs), `claude-sonnet-5-5` (lesson evaluation), `claude-opus-5-5` (scans) | `ANTHROPIC_API_KEY` | paid, capped by `AI_BUDGET_USD` |
| **Google Gemini** | second choice for the same jobs | `gemini-3.5-flash`, `gemini-flash-latest`, `gemini-flash-lite-latest` | `GEMINI_API_KEY` | free tier (may be used for training: demo data only) |
| **Groq** | speech-to-text for lesson and student recordings | `whisper-large-v3` | `GROQ_API_KEY` | free tier |
| **faster-whisper** (on the server) | speech-to-text when no Groq key | `base` (downloaded once) | none | free |
| **Ollama** (optional, off by default) | AI on your own computer | `qwen2.5vl:7b` | none | free |
| **Your own model** (optional, off by default) | any model behind a web address that accepts `{task, input}` | yours | none | yours |
| **Free web search** | finding official textbook sites | NCERT, DIKSHA, ePathshala, CBSE, state boards only | none | free |
| **Rules (no AI)** | the always-available fallback | none | none | free |

Other services: **Supabase** (PostgreSQL and file storage, Mumbai region, optional), **Vercel** (hosts the three web apps),
**Render** (hosts the API from `backend/Dockerfile`), **Web Push** (VAPID, no third-party account needed) and any **SMTP** mail account.

What is sent to an AI: class-level results, notes, transcripts and file text. Student names are not stored (answers are labelled
"Student A", "Student B"). Python, not AI, computes all scores and rankings, and every score links to the file and row it came from.

## Deploying

1. **Database and files:** create a Supabase project (Mumbai), fill the `SUPABASE_*` values, run `TARGET=supabase python database/cli.py setup`.
2. **API:** build `backend/Dockerfile` from the project root (`docker build -f backend/Dockerfile -t crp-backend .`) and run it on any host with the `.env` values as environment settings (never inside the image).
3. **Web apps:** deploy `frontend/`, `teacher-app/` and `landing/` (for example on Vercel). Set `BACKEND_URL` to the API address on the first two.
4. Set `ALLOWED_ORIGINS`, `TEACHER_AUTH_SECRET` and a spend cap (`AI_BUDGET_USD`). Free hosts sleep when idle; an uptime ping to `/api/health` every 5 minutes keeps the API awake.

## Tests

With the database set up: `python evaluation/prioritization_tests/run_engine.py` (ranking) and `python evaluation/ingest_tests/sort_demo_files.py`
(file sorting against known answers). With the API also running: `python evaluation/visit_tests/visit_e2e.py` (4-step visit and teacher link).
`evaluation/ground_truth/` holds answer keys and is never read by the app.

## Security and privacy

- No API keys, passwords or personal data are stored in the files of this repository. Secrets live only in `.env` or the host's environment settings.
- The data is fictional. Before real use: add CRP login and roles, set a strong `TEACHER_AUTH_SECRET`, change `DEMO_TEACHER_PASSWORD`,
  restrict `ALLOWED_ORIGINS`, and get consent for recordings of children (India DPDP Act 2023). The full list is in `PROJECT_CONTEXT.md`.
- Found a key in the code or history by mistake? Revoke it at the provider first, then remove it.

## Contributing

Work on a branch and open a pull request into `main`; do not push to `main` directly. Follow the rules in `PROJECT_CONTEXT.md` section 5.

## License

This project is open source under the [MIT License](LICENSE). You may use, copy, modify and share it, as long as the license text stays with it.
