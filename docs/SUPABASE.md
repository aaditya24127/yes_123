# Moving from the local database to Supabase (online, Mumbai)

The code works the same on both. Only `.env` changes, and one setting (`TARGET`) switches between them.

## 1. Create the project (about 2 minutes, in the browser)

1. Go to supabase.com > **New project**.
   - Name: `crp-mentor-copilot`
   - Region: **South Asia (Mumbai)** (keeps school data in India, as the DPDP Act expects)
   - Plan: Free is fine to start
   - Database password: make a strong one and save it somewhere safe
2. Wait until the project says it is ready.

## 2. Paste three values into `.env`

| `.env` line | Where to find it |
|---|---|
| `SUPABASE_DATABASE_URL` | Top of the project page > **Connect** > "Session pooler" connection string (port **5432**). Replace `[YOUR-PASSWORD]` with your database password. |
| `SUPABASE_URL` | Project Settings > **API Keys** > Project URL (`https://<project-ref>.supabase.co`) |
| `SUPABASE_SERVICE_KEY` | Project Settings > **API Keys** > the `service_role` key (or the new "secret" key). **Server only**: never put it in the website or app code. |

## 3. Switch and load everything (one command)

Set `TARGET=supabase` in `.env`, then from the project folder:

```
backend\.venv\Scripts\python database\cli.py setup
```

This creates all tables (migrations 0001-0011), turns on row-level security (`0005_rls.supabase.sql`, `0010_rls_v2.supabase.sql`, `0012_rls_teacher_accounts.supabase.sql`),
creates the private `crp-files` storage bucket, loads the demo data, uploads every demo file to the bucket under the same
name, and checks counts and file fingerprints. It is safe to run again.

Restart the backend. The website now reads and writes Supabase. `TARGET=local` switches back to this computer's database.

Individual steps: `migrate`, `seed`, `storage-sync`, `verify`. `reset` refuses to run against Supabase.

Tips from the first real setup (Nov 2026): in the new-project form turn **off** "Automatically expose new tables" and turn **on**
"Enable automatic RLS"; use the **Session pooler** string (the direct one needs IPv6); use the **legacy `service_role`** key
(Project Settings > API Keys > "Legacy anon, service_role API keys"), which the storage code expects. Teacher demo logins are created
automatically when the API starts.

## Security notes

- The backend connects as the database owner and checks every request itself; row-level security protects against
  direct access through Supabase's public API (the "anon" / publishable key). Every table has it switched on.
- There is no login in the app yet (see `PROJECT_CONTEXT.md` > Security). Do not put real student data online before that.
- Supabase Auth is the planned login: `app_users.auth_user_id` holds the Supabase user id, `crps.user_id` links the CRP
  profile, and `my_school_ids()` gives the schools a logged-in CRP may see.

## Notes

- Demo rows carry `is_demo = true`, so `delete from <table> where is_demo` removes them when real data starts.
- The free plan pauses a project after about a week without use, and has database and storage size limits; check the
  current limits before relying on it.
