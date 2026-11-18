# Security

AppPulse uses server-side account and workspace checks. The current implementation includes salted scrypt password hashing, high-entropy session tokens stored as digests, authentication rate limiting, membership checks for workspace access, and server-side role checks for administrative actions. Regression tests cover password verification, session expiry and storage, role policy, and cross-workspace access.

Production requires PostgreSQL through `DATABASE_URL` and `AUTH_RATE_LIMIT_SECRET`. The server refuses to start in production without a valid PostgreSQL URL rather than falling back to local SQLite. Migrations run during startup. Never commit credentials, production database files, or personal data.

To report a vulnerability, use GitHub's private vulnerability reporting for this repository when it is enabled. Avoid posting exploitable details in public issues.
