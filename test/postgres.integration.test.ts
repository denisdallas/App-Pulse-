import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { after, test } from 'node:test';
import dotenv from 'dotenv';
import type { Application, Contact } from '../src/types.ts';
import type { WorkspaceActor } from '../server/domain-store.ts';

dotenv.config({ path: ['.env.development.local', '.env.local', '.env'] });

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalUnpooledDatabaseUrl = process.env.DATABASE_URL_UNPOOLED;
const originalAuthSessionSecret = process.env.AUTH_SESSION_SECRET;
const originalNodeEnv = process.env.NODE_ENV;
const testAuthSecret = crypto.randomBytes(32).toString('base64url');

function databaseIdentity(connectionString: string): string {
  const url = new URL(connectionString);
  const hostname = url.hostname.replace(/-pooler(?=\.)/i, '');
  return `${url.protocol}//${hostname}${url.pathname}`;
}

if (testDatabaseUrl) {
  const configuredDatabaseUrls = [process.env.DATABASE_URL, process.env.DATABASE_URL_UNPOOLED].filter(
    (value): value is string => Boolean(value),
  );
  const testIdentity = databaseIdentity(testDatabaseUrl);
  if (configuredDatabaseUrls.some((value) => databaseIdentity(value) === testIdentity)) {
    throw new Error('TEST_DATABASE_URL must point to a database separate from DATABASE_URL');
  }
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.DATABASE_URL_UNPOOLED = testDatabaseUrl;
  process.env.AUTH_SESSION_SECRET = testAuthSecret;
  process.env.NODE_ENV = 'development';
}

const [
  { closeDatabase, query, transaction },
  { getMigrationStatus, migrate },
  { app },
  { domainStore },
  { enqueueJob, claimNextJob, completeJob, failJob, getJob, recoverStaleJobsNow },
  { processNextJob },
] = await Promise.all([
  import('../server/db.ts'),
  import('../server/migrate.ts'),
  import('../server/app.ts'),
  import('../server/domain-store.ts'),
  import('../server/job-queue.ts'),
  import('../server/job-worker.ts'),
]);

after(async () => {
  await closeDatabase();
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  if (originalUnpooledDatabaseUrl === undefined) delete process.env.DATABASE_URL_UNPOOLED;
  else process.env.DATABASE_URL_UNPOOLED = originalUnpooledDatabaseUrl;
  if (originalAuthSessionSecret === undefined) delete process.env.AUTH_SESSION_SECRET;
  else process.env.AUTH_SESSION_SECRET = originalAuthSessionSecret;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

function cookieFrom(response: Response): string {
  const setCookie = response.headers.get('set-cookie');
  if (!setCookie) throw new Error('Expected the authentication endpoint to set a session cookie');
  return setCookie.split(';', 1)[0];
}

async function startAppServer(): Promise<{ server: Server; baseUrl: string }> {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind to a TCP port');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function closeAppServer(server: Server): Promise<void> {
  const closed = new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  server.closeAllConnections();
  await closed;
}

async function registerUser(baseUrl: string, workspaceName: string) {
  const email = `test-${crypto.randomUUID()}@example.invalid`;
  const password = `Integration-test-${crypto.randomUUID()}-passphrase`;
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, workspaceName }),
  });
  const body = (await response.json().catch(() => null)) as { user?: { id?: string; workspaceId?: string } } | null;
  assert.equal(response.status, 201, `Registration failed: ${JSON.stringify(body)}`);
  if (process.env.NODE_ENV === 'development') {
    const cookieHeader = response.headers.get('set-cookie') || '';
    assert.match(cookieHeader, /SameSite=None/i);
    assert.match(cookieHeader, /Secure/i);
  }
  if (!body?.user?.id || !body.user.workspaceId) throw new Error('Registration did not return a workspace user');
  const actor: WorkspaceActor = {
    userId: body.user.id,
    workspaceId: body.user.workspaceId,
    workspaceName,
    email,
    role: 'owner',
  };
  return { actor, cookie: cookieFrom(response), email, password };
}

test('isolated PostgreSQL database runs repeatable migrations and rolls back transactions', {
  skip: testDatabaseUrl ? false : 'Set TEST_DATABASE_URL to run isolated PostgreSQL tests',
}, async () => {
  await migrate();
  await migrate();

  const migrationStatus = await getMigrationStatus();
  assert.equal(migrationStatus.current, true, `Pending migrations: ${migrationStatus.pending.join(', ')}`);

  const result = await query<{ value: number }>('SELECT $1::integer AS value', [42]);
  assert.equal(result[0]?.value, 42);

  const workspaceId = `ws_rollback_${crypto.randomUUID()}`;
  await assert.rejects(() => transaction(async (client) => {
    await client.query('INSERT INTO workspaces(id,name) VALUES ($1,$2)', [workspaceId, 'Rollback fixture']);
    throw new Error('forced rollback verification');
  }), /forced rollback verification/);
  const rows = await query<{ id: string }>('SELECT id FROM workspaces WHERE id=$1', [workspaceId]);
  assert.equal(rows.length, 0, 'A failed transaction must not leave a partial workspace row');
});

test('workspace APIs isolate data and durable jobs survive retries and server restarts', {
  skip: testDatabaseUrl ? false : 'Set TEST_DATABASE_URL to run isolated PostgreSQL tests',
}, async () => {
  await migrate();
  let running = await startAppServer();

  try {
    const ownerA = await registerUser(running.baseUrl, `Workspace A ${crypto.randomUUID()}`);
    const ownerB = await registerUser(running.baseUrl, `Workspace B ${crypto.randomUUID()}`);
    const memberUser = await registerUser(running.baseUrl, `Member workspace ${crypto.randomUUID()}`);

    const application: Application = {
      id: `app_test_${crypto.randomUUID()}`,
      name: 'PostgreSQL isolation fixture',
      publisher: 'AppPulse test suite',
      marketplace: 'steam',
      description: 'Integration test fixture; no marketplace evidence is asserted.',
      category: 'Productivity',
      rating: 4.2,
      ratingCount: 7,
      reviewCount: 0,
      metadataStatus: 'verified',
      platform: 'Steam',
      releaseDate: '2025-01-01',
      lastUpdated: '2025-01-01',
      currentVersion: '1.0.0',
      updateFrequency: 'Weekly',
      storeUrl: 'https://example.invalid/apppulse-test',
      collectionAvailable: false,
      status: 'active',
      tags: [],
    };
    await domainStore.saveApps(ownerA.actor, [application], 'imported');

    const contact: Contact = {
      id: `contact_test_${crypto.randomUUID()}`,
      name: 'Workspace A contact',
      title: 'Test owner',
      company: 'AppPulse test suite',
      email: `contact-${crypto.randomUUID()}@example.invalid`,
      channel: 'email',
      sourceUrl: 'https://www.example.com/contact-source',
      status: 'New',
      consentBasis: 'Inquiry Request',
      notes: 'Disposable integration-test fixture.',
      createdAt: new Date().toISOString(),
    };
    await domainStore.saveContact(ownerA.actor, contact);

    const memberToken = crypto.randomBytes(32).toString('base64url');
    const memberTokenHash = crypto.createHmac('sha256', testAuthSecret).update(memberToken).digest('hex');
    await query('INSERT INTO workspace_members(workspace_id,user_id,role) VALUES ($1,$2,$3)', [ownerA.actor.workspaceId, memberUser.actor.userId, 'member']);
    await query(
      'INSERT INTO sessions(id,user_id,workspace_id,token_hash,expires_at) VALUES ($1,$2,$3,$4,$5)',
      [`ses_${crypto.randomUUID()}`, memberUser.actor.userId, ownerA.actor.workspaceId, memberTokenHash, new Date(Date.now() + 60 * 60 * 1000).toISOString()],
    );
    const memberCookie = `apppulse_session=${memberToken}`;

    const health = await fetch(`${running.baseUrl}/api/health/live`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'live' });

    const unauthenticated = await fetch(`${running.baseUrl}/api/apps`);
    assert.equal(unauthenticated.status, 401);

    const ownerSession = await fetch(`${running.baseUrl}/api/auth/session`, { headers: { cookie: ownerA.cookie } });
    assert.equal(ownerSession.status, 200);
    const ownerSessionBody = await ownerSession.json() as { user: { userId: string; workspaceId: string } };
    assert.equal(ownerSessionBody.user.userId, ownerA.actor.userId);
    assert.equal(ownerSessionBody.user.workspaceId, ownerA.actor.workspaceId);

    const ownAppsResponse = await fetch(`${running.baseUrl}/api/apps?workspaceId=${encodeURIComponent(ownerB.actor.workspaceId)}`, { headers: { cookie: ownerA.cookie } });
    assert.equal(ownAppsResponse.status, 200);
    const ownApps = await ownAppsResponse.json() as Application[];
    assert.ok(ownApps.some((item) => item.id === application.id), 'Client-supplied workspace IDs must not replace the session workspace');

    const otherAppsResponse = await fetch(`${running.baseUrl}/api/apps`, { headers: { cookie: ownerB.cookie } });
    assert.equal(otherAppsResponse.status, 200);
    const otherApps = await otherAppsResponse.json() as Application[];
    assert.equal(otherApps.some((item) => item.id === application.id), false);

    const ownAppResponse = await fetch(`${running.baseUrl}/api/apps/${encodeURIComponent(application.id)}`, { headers: { cookie: ownerA.cookie } });
    assert.equal(ownAppResponse.status, 200);
    assert.equal((await ownAppResponse.json() as { app: Application }).app.id, application.id);

    const foreignAppResponse = await fetch(`${running.baseUrl}/api/apps/${encodeURIComponent(application.id)}`, { headers: { cookie: ownerB.cookie } });
    assert.equal(foreignAppResponse.status, 404);

    const foreignCollection = await fetch(`${running.baseUrl}/api/apps/collect`, {
      method: 'POST',
      headers: { cookie: ownerB.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ appId: application.id }),
    });
    assert.equal(foreignCollection.status, 404);

    const csrfAttempt = await fetch(`${running.baseUrl}/api/contacts`, {
      method: 'POST',
      headers: { cookie: ownerA.cookie, origin: 'https://attacker.invalid', 'content-type': 'application/json' },
      body: JSON.stringify({ ...contact, id: `csrf_${crypto.randomUUID()}`, email: `csrf-${crypto.randomUUID()}@example.invalid` }),
    });
    assert.equal(csrfAttempt.status, 403);

    const foreignContactWrite = await fetch(`${running.baseUrl}/api/contacts`, {
      method: 'POST',
      headers: { cookie: ownerB.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ ...contact, id: `contact_foreign_${crypto.randomUUID()}`, email: `foreign-${crypto.randomUUID()}@example.invalid`, appId: application.id }),
    });
    assert.equal(foreignContactWrite.status, 404);

    const foreignDraft = await fetch(`${running.baseUrl}/api/outreach/draft`, {
      method: 'POST',
      headers: { cookie: ownerB.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ contactId: contact.id, opportunityId: 'unknown-opportunity' }),
    });
    assert.equal(foreignDraft.status, 404);

    const foreignReport = await fetch(`${running.baseUrl}/api/reports/research.pdf?appIds=${encodeURIComponent(application.id)}`, { headers: { cookie: ownerB.cookie } });
    assert.equal(foreignReport.status, 404);

    const exportA = await fetch(`${running.baseUrl}/api/export?type=contacts&format=json`, { headers: { cookie: ownerA.cookie } });
    assert.equal(exportA.status, 200);
    const contactsA = await exportA.json() as Contact[];
    assert.ok(contactsA.some((item) => item.id === contact.id));

    const exportB = await fetch(`${running.baseUrl}/api/export?type=contacts&format=json`, { headers: { cookie: ownerB.cookie } });
    assert.equal(exportB.status, 200);
    const contactsB = await exportB.json() as Contact[];
    assert.equal(contactsB.some((item) => item.id === contact.id), false);

    const routeJob = await enqueueJob(ownerA.actor, 'analysis', { appIds: [application.id] }, `route_${crypto.randomUUID()}`);
    const memberApps = await fetch(`${running.baseUrl}/api/apps`, { headers: { cookie: memberCookie } });
    assert.equal(memberApps.status, 200);
    assert.ok((await memberApps.json() as Application[]).some((item) => item.id === application.id));

    const memberJob = await fetch(`${running.baseUrl}/api/jobs/${encodeURIComponent(routeJob.id)}`, { headers: { cookie: memberCookie } });
    assert.equal(memberJob.status, 200);

    const foreignJob = await fetch(`${running.baseUrl}/api/jobs/${encodeURIComponent(routeJob.id)}`, { headers: { cookie: ownerB.cookie } });
    assert.equal(foreignJob.status, 404);

    const foreignJobCancellation = await fetch(`${running.baseUrl}/api/jobs/${encodeURIComponent(routeJob.id)}/cancel`, {
      method: 'POST',
      headers: { cookie: ownerB.cookie },
    });
    assert.equal(foreignJobCancellation.status, 404);

    const memberCancellation = await fetch(`${running.baseUrl}/api/jobs/${encodeURIComponent(routeJob.id)}/cancel`, {
      method: 'POST',
      headers: { cookie: memberCookie },
    });
    assert.equal(memberCancellation.status, 403);

    const memberSearch = await fetch(`${running.baseUrl}/api/apps/search-online`, {
      method: 'POST',
      headers: { cookie: memberCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'integration test', marketplace: 'steam' }),
    });
    assert.equal(memberSearch.status, 403);

    const memberAuditLogs = await fetch(`${running.baseUrl}/api/audit-logs`, { headers: { cookie: memberCookie } });
    assert.equal(memberAuditLogs.status, 403);

    const ownerCancellation = await fetch(`${running.baseUrl}/api/jobs/${encodeURIComponent(routeJob.id)}/cancel`, {
      method: 'POST',
      headers: { cookie: ownerA.cookie },
    });
    assert.equal(ownerCancellation.status, 200);
    assert.equal((await ownerCancellation.json() as { status: string }).status, 'cancelled');

    const login = await fetch(`${running.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: ownerA.email, password: ownerA.password }),
    });
    assert.equal(login.status, 200);
    const loginCookie = cookieFrom(login);
    const logout = await fetch(`${running.baseUrl}/api/auth/logout`, { method: 'POST', headers: { cookie: loginCookie } });
    assert.equal(logout.status, 204);
    const logoutCookie = logout.headers.get('set-cookie') || '';
    assert.match(logoutCookie, /SameSite=None/i);
    assert.match(logoutCookie, /Secure/i);
    const loggedOutSession = await fetch(`${running.baseUrl}/api/auth/session`, { headers: { cookie: loginCookie } });
    assert.equal(loggedOutSession.status, 401);

    await query("UPDATE background_jobs SET available_at=NOW() + INTERVAL '1 day' WHERE status='pending'");
    const idempotencyKey = `lifecycle_${crypto.randomUUID()}`;
    const lifecycleJob = await enqueueJob(ownerA.actor, 'analysis', { appIds: [application.id] }, idempotencyKey, 2);
    const duplicateJob = await enqueueJob(ownerA.actor, 'analysis', { appIds: [application.id] }, idempotencyKey, 2);
    assert.equal(duplicateJob.id, lifecycleJob.id, 'Repeated idempotency keys must return the same job');
    await query(
      "UPDATE background_jobs SET available_at=NOW(),created_at=NOW() - INTERVAL '10 years' WHERE workspace_id=$1 AND id=$2",
      [ownerA.actor.workspaceId, lifecycleJob.id],
    );

    const claims = await Promise.all([claimNextJob('test-claim-a'), claimNextJob('test-claim-b')]);
    const lifecycleClaims = claims.filter((job) => job?.id === lifecycleJob.id);
    assert.equal(lifecycleClaims.length, 1, 'Concurrent workers must not claim the same job twice');
    const firstClaim = lifecycleClaims[0];
    assert.ok(firstClaim);
    assert.equal(await failJob(firstClaim, new Error('Temporary upstream failure'), true), 'pending');
    const retriedState = await getJob(ownerA.actor, lifecycleJob.id);
    assert.equal(retriedState?.status, 'pending');
    assert.equal(retriedState?.attempts, 1);

    await query(
      "UPDATE background_jobs SET available_at=NOW(),created_at=NOW() - INTERVAL '10 years' WHERE workspace_id=$1 AND id=$2",
      [ownerA.actor.workspaceId, lifecycleJob.id],
    );
    const retryClaim = await claimNextJob('test-retry-worker');
    assert.equal(retryClaim?.id, lifecycleJob.id);
    assert.equal(retryClaim?.attempts, 2);
    assert.equal(await completeJob(retryClaim!, { persisted: true }), true);
    const completedState = await getJob(ownerA.actor, lifecycleJob.id);
    assert.equal(completedState?.status, 'completed');
    assert.deepEqual(completedState?.result, { persisted: true });

    const collectionFailureJob = await enqueueJob(ownerA.actor, 'collection', { appId: application.id }, `failed_collection_${crypto.randomUUID()}`, 1);
    await query(
      "UPDATE background_jobs SET available_at=NOW(),created_at=NOW() - INTERVAL '10 years' WHERE workspace_id=$1 AND id=$2",
      [ownerA.actor.workspaceId, collectionFailureJob.id],
    );
    const collectionResult = await processNextJob('test-collection-worker');
    assert.equal(collectionResult?.id, collectionFailureJob.id);
    assert.equal(collectionResult?.status, 'failed');
    const collectionState = await getJob(ownerA.actor, collectionFailureJob.id);
    assert.equal(collectionState?.status, 'failed');
    assert.equal(collectionState?.result, null, 'Failed collection must not fabricate a successful result');
    assert.match(collectionState?.error || '', /not supported/i);

    const staleJob = await enqueueJob(ownerA.actor, 'analysis', {}, `stale_${crypto.randomUUID()}`, 1);
    await query(
      "UPDATE background_jobs SET available_at=NOW(),created_at=NOW() - INTERVAL '10 years' WHERE workspace_id=$1 AND id=$2",
      [ownerA.actor.workspaceId, staleJob.id],
    );
    const staleClaim = await claimNextJob('test-stale-worker');
    assert.equal(staleClaim?.id, staleJob.id);
    await query(
      "UPDATE background_jobs SET heartbeat_at=NOW() - INTERVAL '1 hour' WHERE workspace_id=$1 AND id=$2",
      [ownerA.actor.workspaceId, staleJob.id],
    );
    assert.ok((await recoverStaleJobsNow()) >= 1);
    const recoveredState = await getJob(ownerA.actor, staleJob.id);
    assert.equal(recoveredState?.status, 'failed', 'Stale jobs at the retry limit must fail');
    assert.match(recoveredState?.error || '', /lease expired/i);

    await closeAppServer(running.server);
    await closeDatabase();
    running = await startAppServer();
    const persistedJob = await fetch(`${running.baseUrl}/api/jobs/${encodeURIComponent(lifecycleJob.id)}`, { headers: { cookie: ownerA.cookie } });
    assert.equal(persistedJob.status, 200);
    const persistedBody = await persistedJob.json() as { status: string; result: Record<string, unknown> };
    assert.equal(persistedBody.status, 'completed');
    assert.deepEqual(persistedBody.result, { persisted: true });
    const persistedSession = await fetch(`${running.baseUrl}/api/auth/session`, { headers: { cookie: ownerA.cookie } });
    assert.equal(persistedSession.status, 200, 'Session and workspace data must remain available after a server listener restart');
  } finally {
    await closeAppServer(running.server);
  }
});
