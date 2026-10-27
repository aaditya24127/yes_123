# Moving from local PostgreSQL to Supabase

The schema and loader are target-agnostic: only `.env` changes. Nothing in the code needs editing.

## One-time Supabase setup
1. Create a project at supabase.com (note the project ref and the database password).
2. Storage > New bucket > name `crp-files`, **Private** (leave "Public bucket" off).
3. Project Settings > API: copy the project URL and the **service_role** key (server-side only; never put it in frontend code).
4. Project Settings > Database > Connection string: copy the *Session pooler* URI (port 5432; migrations need a session connection, not the transaction pooler on 6543).

## Point the project at Supabase
Copy `.env` to `.env.local-backup`, then edit `.env`:
```
TARGET=supabase
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
STORAGE_BACKEND=supabase
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_KEY=<service_role key>
SUPABASE_BUCKET=crp-files
```

## Push everything
```
python database/cli.py setup
```
This applies migrations 0001-0004 plus `0005_rls.supabase.sql` (row-level security: a CRP only sees assigned schools; only the service role can touch config, jobs and audit tables), loads all seed rows (idempotent upserts with deterministic IDs), uploads every file in `source_files` to the bucket under the same relative key, and verifies counts and SHA-256 hashes.

Individual steps: `migrate`, `seed`, `storage-sync`, `verify`. `reset` refuses to run against `TARGET=supabase`.

## Linking a real login later
`app_users.auth_user_id` holds the Supabase `auth.users.id`; `crps.user_id` links the CRP profile to that user. The RLS helper `my_school_ids()` resolves assigned schools from `auth.uid()`.

## Notes
- Demo rows carry `is_demo = true`, so `delete from <table> where is_demo` removes them cleanly when real data starts.
- The free tier has storage and database size limits and pauses idle projects; check current limits before relying on it.
- pgvector (for the knowledge-base phase) is available on Supabase (`create extension vector`); it will arrive as a later migration.
