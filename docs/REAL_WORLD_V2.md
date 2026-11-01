# CRP Mentor Copilot v2: real-world features

Plain-language guide to what was added on the `feature/real-world-v2` branch, how to run it, and how to change things later.

## What is new (website menu)

| Page | What the CRP does there |
|---|---|
| **Priorities** (home) | Same ranking as before. The priorities panel now has **25 ready-made factors** (5 on by default), **Create your own factor** (with optional numbers typed in or uploaded), and in each school/teacher's details **Change this position by hand** (pin, move up/down, hold back; reason required; logged). |
| **Upload** | Drop many files or a zip. Each file is sorted automatically (school, teacher, type, date), duplicates are caught, the CRP checks and presses **Import**. Imported records count in the ranking straight away. |
| **Visit** | 4 steps: **Before class** (history, open issues, agreed actions, results, linked textbooks, a short brief), **In class** (record the lesson on the phone, notes, what changed), **Students** (4-5 suggested questions; record each answer), **Results** (evaluation against the research file; tick what to save; saving creates the visit, open issues, follow-ups with due dates, and closes improved issues). |
| **Teachers** | Requests to a teacher or a whole school (marks, attendance, syllabus plan, lesson recording, reflection, visit notice), messages, notifications, and the **teacher app** (`teacher-app/`, port 3001) where each teacher signs in (`firstname.lastname@crp.com`, demo password `pass123`), sees tasks and notifications, uploads answers and sends concerns. Uploads from teachers go to the Upload page for the CRP to check. |
| **Settings** | Which AI does each job, AI cost, and **Ask the copilot** (questions answered from the latest records). |

Textbooks: search official sites (NCERT, Balbharati, DIKSHA...) from the Visit or Teachers page and **Link** a result; the app downloads the PDF itself, keeps it, reads its chapter list and remembers it for that teacher and school.

## The 25 factors

Learning: learning gap, learning getting worse, foundational gap (Classes 1-3), language/reading gap, maths gap, low average marks, students missing tests, one very weak class.
Issues and follow-up: unresolved issues, recurring need, overdue follow-up, serious issues open, issues unsolved for long, agreed actions not done.
Visits and contact: time since last visit, too few recent visits, teachers never observed, new teachers, old or missing information.
Students and school: poor attendance, attendance falling, students per teacher, multi-grade teaching, number of girls*, children with special needs*.
(* needs a number per school: type it in, upload a sheet, or it is read from an uploaded school profile.)

All factors come from the database (`priority_categories`); none are hard-coded in the website. A CRP-made factor uses the generic rule "this number, higher/lower/below target/yes = visit sooner".
Your own trained model can also feed a factor: store its prediction per school as a number (`POST /api/facts/<key>`) and create a factor on it.

## AI: replaceable, nothing hard-coded

Every AI job is a named **task** (sort a file, read records, read a scan, transcribe, suggest a factor, visit brief, student questions, evaluate a lesson, find textbooks, answer a question). Each task has a fixed input and a fixed output format (`backend/app/ai/tasks.py`).

**Who does each task is set in `config/ai.json`**: a list of providers tried in order. The first one that is available and gives a correctly shaped answer wins; `rules` (free, no AI) is always last, so the app works with no keys at all.

Provider types: `claude`, `gemini`, `ollama` (any local model, free and private), `http` (your own model), `local_whisper` / `groq_whisper` (speech-to-text), `web_search_free`, `rules`.

**To plug in your own trained model**: run it behind a web address that accepts

```
POST <url>   {"task": "<task name>", "input": {...}, "attachments": [{"name", "mime", "data_base64"}]}
```

and returns the task's output JSON. Set `"enabled": true` for `my_model` in `config/ai.json` (or `AI_PROVIDER_MY_MODEL_ENABLED=true`) and put `my_model` first in the tasks it should do. No code changes.

Every AI call is logged (`llm_calls`: task, provider, model, tokens, approximate cost, time) and shown on Settings, so the API budget is visible.

Teaching research the AI must follow before judging a lesson: `backend/app/knowledge/teaching_practices.md` (World Bank Teach framework, Rosenshine, formative assessment, EEF, Teaching at the Right Level, NIPUN Bharat, NCF-SE 2023, coaching research, books and videos, all with sources). Edit it like a normal document; changes apply immediately.

## Scaling

- Slow work (importing files, speech-to-text, lesson evaluation, textbook downloads) runs as **background jobs** in the database table `processing_jobs`.
- The API runs `WORKERS_IN_API` workers itself (default 1). For more capacity, start extra workers on any machine pointing at the same database: `backend\.venv\Scripts\python -m app.jobs` (from the `backend` folder). Each job is taken by exactly one worker; failed jobs retry 3 times.
- The API itself keeps no state, so several copies can run behind a load balancer. Files go through the storage layer (local folder or Supabase Storage).

## Running it

```
powershell -File start.ps1
```

then open http://localhost:3000. The backend uses its own Python environment in `backend\.venv` (create it once with `python -m venv --system-site-packages backend\.venv` and `backend\.venv\Scripts\python -m pip install -r backend\requirements.txt`). New database tables are added with `backend\.venv\Scripts\python database\cli.py migrate`.

## Frontend: where to make high-level changes

| To change | Edit |
|---|---|
| Menu, pages, switch features on/off | `frontend/lib/app.config.ts` (`NAV`, `FEATURES`) |
| Look of buttons, cards, fields, badges | `frontend/components/ui/index.tsx` |
| Colours / themes | `frontend/app/globals.css`, `frontend/lib/theme.ts` |
| Any backend call | `frontend/lib/api.ts` (pages never build URLs themselves) |
| Screen text | `frontend/lib/lang/en.ts` (other languages fall back to English until translated) |
| A new page | `frontend/app/<name>/page.tsx` wrapped in `<PageShell>`, then add it to `NAV` |

## Tests

- `evaluation/prioritization_tests/run_engine.py`: the ranking (unchanged scores for the original 5 factors were verified).
- `evaluation/ingest_tests/sort_demo_files.py`: sorter accuracy on the 48 demo files (document type 48/48; school 37/48, the rest are scans, recordings and CSVs with no school name, which go to "Check this").
- `evaluation/ingest_tests/make_samples.py` + `upload_e2e.py`: upload, sort, import, ranking change (needs the API running).
- `evaluation/visit_tests/visit_e2e.py`: the 4-step visit and the teacher link (needs the API running).

## Not done yet (later)

- Logins: today anyone who can open the website sees everything; teacher links are private but have no password.
- Real domain in `ALLOWED_ORIGINS`, India data-protection (DPDP) consent and data location, removing `generator/t.mp3` and `generator/test_s08.mp3`.
- Translating the new screens into the 10 other languages (they show English for now).
- SMS / WhatsApp notifications to teachers (today: in-app notifications in the teacher app; phone push needs the Firebase step).
