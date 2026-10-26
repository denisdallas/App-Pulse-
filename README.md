# AppPulse Intelligence

AppPulse is an existing Vite + React interface backed by an Express API and PostgreSQL. The Vercel function entry point is `api/index.ts`; it imports the shared Express application in `server/app.ts`. Vite builds the frontend into `public/`, while the `/api/*` rewrite routes requests to that real handler.

## Local setup

1. Configure `DATABASE_URL` for pooled application queries and `DATABASE_URL_UNPOOLED` for migrations when needed.
2. Set a unique `AUTH_SESSION_SECRET` of at least 32 bytes.
3. Choose a job execution mode; Vercel functions do not run durable workers continuously.
4. Inspect the database with `bun run db:status`. Apply reviewed migrations explicitly with `bun run db:migrate` only against an approved development or isolated database.
5. Run `bun run dev` for local development or `bun run build` for the production frontend build.

App startup, Vercel previews, and the worker never apply migrations automatically. The authentication endpoints return an actionable setup error while the AppPulse schema is pending.

## Runtime configuration

| Variable | Requirement | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Required for authenticated APIs and persistence | Pooled PostgreSQL connection for application queries. |
| `DATABASE_URL_UNPOOLED` | Required when migrations need a direct connection | Direct PostgreSQL connection for the explicit migration command. |
| `AUTH_SESSION_SECRET` | Required; at least 32 bytes | HMAC key for secure, HTTP-only session cookies. |
| `JOB_EXECUTION_MODE` | Required for readiness | `worker` for a separate worker process or `http_trigger` for an authenticated scheduler. |
| `JOB_TRIGGER_SECRET` | Required only for `http_trigger`; at least 32 bytes | Bearer token for `/api/internal/jobs/process`. |
| `JOB_WORKER_POLL_MS` | Optional | Worker polling interval; defaults to 2 seconds. |
| `JOB_STALE_SECONDS` | Optional | Stale lease timeout; defaults to 180 seconds. |
| `DB_POOL_SIZE` | Optional | PostgreSQL application pool size; defaults to 5. |
| `PORT` | Optional | Local Express port; defaults to 3000. |
| `TEST_DATABASE_URL` | Optional; separate disposable database only | Enables PostgreSQL migration and API integration tests. Must not point to the application database. |

AI features use the Vercel AI Gateway at runtime with `google/gemini-4-argon`; no Gemini API key is read by the application. Gateway connectivity is not claimed until a request has been made. Outside a Vercel/v0 runtime, AI-backed paths use validated deterministic evidence summaries when Gateway access is unavailable.

## Data-source capabilities

| Source | Catalog discovery | Review collection |
| --- | --- | --- |
| Steam | Public Store search endpoint | Public Community Reviews endpoint; paginated, bounded to 200 reviews per job, with a saved continuation cursor. A catalog health probe does not verify review retrieval. |
| Apple App Store | Public iTunes catalog search | Not available through the public catalog endpoint. |
| Google Play | Not implemented | Not implemented |
| Microsoft Store | Not implemented | Not implemented |

AppPulse saves only returned catalog records and collected or user-imported reviews. Review records preserve provenance, source IDs/URLs, collection timestamps, and duplicate handling. Seed, generated, and calculated records are excluded from the user-facing review feed and source-backed analysis. Imported data is not independently verified by AppPulse.

AI-generated themes, forecasts, competitor findings, and opportunity narratives are hypotheses grounded in stored review IDs and validated exact excerpts. Deterministic fallbacks are labeled as calculated. Sample metrics are not market-wide prevalence estimates.

## Research, exports, contacts, and delivery

- Research projects, review exploration, filtering, and evidence-backed analysis are workspace-scoped.
- Reviews, opportunities, and contacts can be exported as CSV, XLSX, or JSON. The research PDF is generated from workspace records. CSV/XLSX text cells are protected against spreadsheet formula injection.
- There is no business-prospect discovery provider. Contacts must be added manually or imported, with public source URLs and a recorded basis before they are eligible for outreach.
- Outreach drafts are for human review. No email delivery adapter is implemented or connected; AppPulse does not send messages or report them as sent/delivered. Suppression checks and approval gates are enforced before any future provider could be enabled.
- Automatic data retention/deletion is not implemented.

## Background workers

Vercel functions do not provide a durable long-running worker process. Choose one execution design:

- **Separate worker process:** set `JOB_EXECUTION_MODE=worker` and run `bun run worker` on a worker-capable host with the same database and auth environment. The worker checks migration status without applying schema, claims PostgreSQL jobs with row locking, reports heartbeats, retries bounded failures, and recovers stale leases.
- **External scheduler:** set `JOB_EXECUTION_MODE=http_trigger`, configure a high-entropy `JOB_TRIGGER_SECRET`, and have an external scheduler send authenticated `POST` requests to `/api/internal/jobs/process`. Each request processes at most one job. This repository does not configure a scheduler automatically.

`/api/health/ready` reports database connectivity, migration status, authentication configuration, and recent worker activity. A queued job does not mean that it has executed.

## Verification commands

- `bun run lint` — TypeScript check.
- `bun run test` — unit and connector/export logic tests.
- `bun run build` — production Vite build.
- `vercel build` — Vercel output and function packaging check.
- `bun run test:db` — isolated PostgreSQL migrations, transaction, workspace-isolation, authentication, export, and job-flow tests when `TEST_DATABASE_URL` points to a separate disposable database. Without it, these tests are skipped.

Never put credentials in browser code, logs, or committed files. Do not apply migrations to a production/default database without reviewing the SQL, testing it on an isolated branch, and obtaining approval.
