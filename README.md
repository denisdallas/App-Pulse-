# AppPulse Intelligence

AppPulse Intelligence is a web app for organizing marketplace app data, exploring review themes, and assessing product opportunities.

**Live app:** [app-pulse-six.vercel.app](https://app-pulse-six.vercel.app)  
**Public sample endpoint:** [`/api/demo`](https://app-pulse-six.vercel.app/api/demo)

## What it does

- Organizes app catalogs, review records, themes, opportunities, and research projects.
- Provides account registration, sign-in, workspace membership, and role-checked admin actions.
- Supports analysis with Gemini when a server-side API key is configured.
- Exports research reports and spreadsheet data.
- Offers a public, read-only demo endpoint with clearly labelled illustrative records.

## Data and integration limits

The public demo endpoint returns seed records only. Its response labels the data as illustrative; it is not a live marketplace feed and its ratings, reviews, and metrics must not be treated as current or verified.

The Steam and Apple App Store connectors are implemented. Google Play and Microsoft Store review collection do not currently provide verified live results. Connector status is surfaced by the app; unavailable sources do not fabricate reviews.

Gemini analysis is optional and requires `GEMINI_API_KEY`. Email delivery is disabled until a real SMTP or Resend provider is configured; the app does not simulate delivery. Marketplace names, logos, icons, and store URLs belong to their respective owners.

## Stack and deployment

- React 19, TypeScript, Vite, and Tailwind CSS
- Express API with a Vercel serverless entry point
- PostgreSQL for production persistence; durable SQLite for local development
- Bun for dependency installation, tests, and development commands

The Vercel project is connected to this repository. Production requires a PostgreSQL `DATABASE_URL` and `AUTH_RATE_LIMIT_SECRET`; database migrations run during server startup. Preview deployments use Vercel protection settings.

## Run locally

Requirements: Bun 1.x.

```sh
bun install --frozen-lockfile
cp .env.example .env
bun run dev
```

On Windows PowerShell, copy the example with:

```powershell
Copy-Item .env.example .env
```

The local server runs at [http://localhost:3000](http://localhost:3000). Without `DATABASE_URL`, it creates a local SQLite database under `server/data/`. The database and generated reports are ignored by Git.

Set `GEMINI_API_KEY` only if you want to use Gemini analysis. Set SMTP or Resend variables only if you want to enable real email delivery. The optional `APP_BOOTSTRAP_ADMIN_*` values are for initial administrator provisioning and should be removed after setup.

## Checks

```sh
bun run lint
bun test
bun run build
```

GitHub Actions runs type checking, the test suite, local Express/API and authentication smoke checks, a public demo endpoint check, and a production build for changes to `main` and pull requests targeting `main`.

## Licensing

Source code, tests, deployment configuration, and project documentation are licensed under MIT. Original illustrative sample records in `server/seedData.ts`, and any original portfolio reports checked into this repository, are licensed under CC BY 4.0. See [LICENSE](LICENSE), [LICENSE-MIT](LICENSE-MIT), and [LICENSE-CC-BY-4.0](LICENSE-CC-BY-4.0).

CC BY does not cover third-party app names, trademarks, artwork, store URLs, or upstream marketplace material. Reports generated at runtime from user-provided data are not relicensed by this repository.
