# Local database

Portable PostgreSQL 17 lives in `tools\pgsql` (no admin rights, no Windows service). Data: `database\pgdata`. Credentials (local only): user `postgres`, password `postgres`, database `crp`, port 5432. Connection settings are in `.env` (copy of `.env.example`).

```
powershell -File tools\pg.ps1 start     # start the server (stays running until stopped or reboot)
powershell -File tools\pg.ps1 stop
python database\cli.py setup                    # migrate + seed + storage check + verify (idempotent)
python database\cli.py verify                   # counts, frozen-weight check, file hashes
python database\cli.py reset --yes              # local only: drop everything
```

## Migrations (`database/migrations`)
| File | Content |
|---|---|
| 0001_core.sql | users, CRPs, schools, assignments, teachers, source_files, visits, assessments, observations, interventions, follow_ups, attendance |
| 0002_priority.sql | categories, versioned configurations + weights (frozen once active; `activate_priority_configuration()` checks total = 100), runs, results, per-category scores, result inputs (evidence links) |
| 0003_ops.sql | processing_jobs (incl. chunk metadata for long audio), audit_logs |
| 0004_views_and_defaults.sql | `v_source_file_feeds` (which categories each file feeds), default 5 categories + draft attendance category, default configuration v1 (30/25/20/15/10, activated) |
| 0005_rls.supabase.sql | Supabase-only row-level security; skipped locally |

Not yet created (later phases): knowledge_documents / pgvector, extracted_records staging.
