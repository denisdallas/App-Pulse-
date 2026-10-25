# AppPulse Intelligence

AppPulse serves a built Vite frontend and an Express API. The preview and production runtime do not inject the Vite HMR client; rebuild the frontend to pick up source changes.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Configure `DATABASE_URL` with the Neon pooled PostgreSQL URL for application traffic. Configure `DATABASE_URL_UNPOOLED` with the direct, non-pooled URL for schema migrations.
3. Set `AUTH_SESSION_SECRET` to a unique random value of at least 32 bytes. For example, generate one locally with `openssl rand -base64 32`. Never commit the value.
4. Choose a job execution mode as described below.
5. Apply migrations explicitly with `bun run db:migrate` only after confirming the target is a development database, then run `bun run dev`. Startup performs read-only connectivity and migration-status checks; it never applies schema changes implicitly. `bun run db:status` reports migration status.

The Neon integration provides `DATABASE_URL` and `DATABASE_URL_UNPOOLED` to the v0 project and Vercel environments. Configure `AUTH_SESSION_SECRET` and any optional provider settings in the project environment variables, not in source control. For local development, use `.env.local` or `.env.development.local`. Apply production schema changes through the approved Neon migration workflow; do not run the local migration command against production without reviewing and approving the target.

## Runtime environment

| Variable | Requirement | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Required for authenticated APIs and persistence | Pooled PostgreSQL connection for application queries. |
| `DATABASE_URL_UNPOOLED` | Required for migrations when `DATABASE_URL` is pooled | Direct PostgreSQL connection for migrations. |
| `AUTH_SESSION_SECRET` | Required; at least 32 bytes | HMAC key for secure session tokens. |
| `JOB_EXECUTION_MODE` | Required for readiness in deployment | Set to `worker` or `http_trigger`. |
| `JOB_TRIGGER_SECRET` | Required only for `http_trigger`; at least 32 bytes | Bearer token accepted by the internal job endpoint. |
| `GEMINI_API_KEY` | Optional | Enables the configured Gemini analysis provider; otherwise analysis uses the existing evidence-grounded fallback. |
| `JOB_WORKER_POLL_MS` | Optional | Worker polling interval; defaults to 2 seconds. |
| `JOB_STALE_SECONDS` | Optional | Stale job lease timeout; defaults to 180 seconds. |
| `DB_POOL_SIZE` | Optional | PostgreSQL application pool size; defaults to 5. |
| `PORT` | Optional | Local Express port; defaults to 3000. |
| `TEST_DATABASE_URL` | Optional; isolated disposable database only | Runs PostgreSQL integration tests. It must not point to the application database. |

The connected project currently exposes `API_KEY` and `NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL`; AppPulse code reads `GEMINI_API_KEY` for its optional Gemini provider. Do not treat a variable's presence as proof that a provider is connected or working. The integration status endpoint reports configuration, connectivity, and verified capability separately. Email delivery is not implemented, and campaign operations do not send messages. Mutating API requests validate supplied origins against the same host and exact Vercel/v0 deployment origins. Development session cookies use `SameSite=None; Secure` for the cross-site v0 preview iframe; production cookies remain `SameSite=Lax; Secure`.

## Background workers

Vercel functions do not provide a durable long-running worker process. Choose one execution design:

- **Separate worker process:** set `JOB_EXECUTION_MODE=worker` and run `bun run worker` on a worker-capable host with the same database and auth environment. The worker claims PostgreSQL jobs with row locking, reports heartbeats, retries bounded failures, and recovers stale leases.
- **External scheduler:** set `JOB_EXECUTION_MODE=http_trigger`, set a high-entropy `JOB_TRIGGER_SECRET`, and have an external scheduler send authenticated `POST` requests with `Authorization: Bearer <JOB_TRIGGER_SECRET>` to `/api/internal/jobs/process`. Each request processes at most one job. This repository does not configure a scheduler automatically.

The readiness endpoint remains `not_ready` until database connectivity, migrations, authentication, and an active worker/trigger are observed. A queued row alone does not mean a job has executed.

## Validation

- `bun run lint` — TypeScript check.
- `bun run test` — unit tests.
- `bun run build` — production Vite build.
- `bun run test:db` — PostgreSQL migrations, transaction, workspace isolation, auth, and job lifecycle tests when `TEST_DATABASE_URL` is set to a separate disposable database. Without it, those tests are explicitly skipped.

For v0 previews, Neon supplies the database URL through the connected integration; custom secrets belong in the v0 project variables. For deployments, configure the same variables in the corresponding Vercel project environments. Never place real secrets in browser code, logs, or committed files.
