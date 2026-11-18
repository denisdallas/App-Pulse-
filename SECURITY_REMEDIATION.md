# AppPulse Security Remediation

## Scope

This change set hardens the existing AppPulse application in place. It preserves the React 19 frontend, Express API, relational schema, existing research and outreach features, and current deployment structure. It is isolated on the `security/auth-workspace-hardening` branch; it has not been merged into `main`.

## Authentication and sessions

- Passwords are stored using salted scrypt hashes with bounded verification parameters.
- Existing fixed-salt PBKDF2 hashes remain verifiable during migration and are upgraded to scrypt after a successful sign-in.
- Session tokens are generated from cryptographically secure random bytes. Only SHA-256 digests are stored in the `sessions.token` column.
- Session validation rejects malformed, expired, unknown, and no-longer-authorized sessions.
- The browser receives an HttpOnly, SameSite=Strict cookie. The raw session token is not returned in the authentication JSON response.
- Authentication endpoints have per-process throttling. This is a basic abuse control; a shared rate-limit store should be used if the deployment scales across multiple independent server instances.

## Workspace isolation and roles

- The unauthenticated administrator fallback has been removed. API routes require a valid session, except registration and sign-in.
- A supplied `x-workspace-id` must match the workspace bound to the session. The header cannot switch a session into another tenant.
- Session validation joins `workspace_members`, so revoked or missing membership invalidates access.
- New registration atomically creates a member account, a private workspace, and an administrator membership for that workspace. It does not accept a caller-supplied role or workspace ID.
- Workspace listing is restricted to the authenticated user's memberships.
- Administrative API paths require an administrator workspace role. No separate `/api/admin` routes currently exist.
- Existing data is retained. The legacy seeded administrator is demoted and its known seeded credential is invalidated only when its stored hash exactly matches the old seeded value. The account row and its associated workspace data are not deleted.

## Administrator bootstrap

There is no default administrator password and no automatic default administrator account.

For a controlled one-time bootstrap, configure these deployment environment variables before starting the application:

- `APP_BOOTSTRAP_ADMIN_EMAIL`
- `APP_BOOTSTRAP_ADMIN_PASSWORD` (minimum 12 characters)
- `APP_BOOTSTRAP_ADMIN_NAME` (optional)

The bootstrap creates an administrator in the existing default workspace only when no administrator account exists. It does not overwrite an existing administrator. Store these values as deployment secrets, never in source control. Once an administrator has been created, the variables can be removed.

New self-registered users create their own workspace and receive workspace-admin membership there; they are not automatically added to the default workspace.

## Additional protections

- Authentication attempt throttling.
- Security response headers, production HSTS, and no-store caching for API responses.
- JSON request-size limit retained at 10 MB to avoid breaking existing imports.
- Generic API 500 responses; detailed exceptions are logged server-side rather than returned to clients.
- Frontend sign-in, registration, session restoration, and sign-out flow.

## Verification

GitHub Actions uses the committed Bun lockfile and runs:

1. Dependency installation with the frozen lockfile.
2. TypeScript validation.
3. The existing logic test suite plus security regression tests.
4. Live API smoke checks for unauthenticated rejection, account registration, authenticated workspace access, workspace-header spoofing rejection, logout, and session revocation.
5. Production frontend build.

Latest completed run at the time of this document: **PASS** for all five stages.

## Deployment review notes

- Configure a one-time bootstrap administrator secret before deploying if an administrator is needed in the existing default workspace.
- Existing plaintext session tokens from the previous implementation are not accepted by the new digest-based lookup; users with old sessions must sign in again. Session rows are not used as credentials after the change.
- Validate the migration against a copy of the production database before rollout, especially where the existing administrator account has been customized.
- The current authentication throttle is process-local. For multi-instance or serverless production deployments, use a shared rate-limit store or edge-level rate limiting.
- The branch is still a draft pull request and must not be merged until the deployment owner completes the database and environment-secret review.
