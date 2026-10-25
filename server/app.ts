import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { fileURLToPath } from 'node:url';
import { draftOutreachEmailWithAI, isAIProviderConfigured } from './ai.ts';
import { authMiddleware, authSecretConfigured, clearTokenCookie, currentSession, InvalidCredentialsError, login, logout, requestToken, register, tokenCookie, type AuthenticatedWorkspace } from './auth.ts';
import { connectorRegistry } from './connectors/index.ts';
import { databaseConfigured, query } from './db.ts';
import { domainStore, WorkspaceRecordNotFound, type WorkspaceActor } from './domain-store.ts';
import { cancelJob, enqueueJob, getActiveJobWorkerCount, getJob, listJobs, type JobType } from './job-queue.ts';
import { processNextJob } from './job-worker.ts';
import { getMigrationStatus } from './migrate.ts';
import { jsonToCsv, parseCsv } from '../src/lib/csv.ts';
import type { Application, AppDiscoveryFilter, Campaign, Contact, Marketplace, Opportunity, ResearchProject, Review, SuppressionRecord } from '../src/types.ts';
import { generateResearchReport } from './reports.ts';

const app = express();
app.set('trust proxy', 1);
const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
const supportedMarketplaces = new Set<Marketplace>(['steam']);

class ApiError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

const asyncRoute = (handler: (req: Request, res: Response) => Promise<unknown> | unknown): RequestHandler =>
  (req, res, next) => { Promise.resolve(handler(req, res)).catch(next); };

function actorFrom(res: Response): WorkspaceActor {
  return res.locals.auth as AuthenticatedWorkspace;
}

function ownerOnly(req: Request, res: Response, next: NextFunction): void {
  const actor = res.locals.auth as AuthenticatedWorkspace | undefined;
  if (!actor || actor.role !== 'owner') {
    res.status(403).json({ error: 'Workspace owner permission required' });
    return;
  }
  next();
}

function requiredString(value: unknown, field: string, maxLength = 240): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw new ApiError(400, `${field} is required and must be at most ${maxLength} characters`);
  }
  return value.trim();
}

function stringList(value: unknown, field: string, maxItems = 50): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > maxItems || value.some((item) => typeof item !== 'string' || !item.trim() || item.length > 240)) {
    throw new ApiError(400, `${field} must be a list of at most ${maxItems} identifiers`);
  }
  return [...new Set(value.map((item) => item.trim()))];
}

function numberQuery(value: unknown, name: string, min: number, max: number): number | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new ApiError(400, `Invalid ${name}`);
  return parsed;
}

function safeJobKey(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > 160 || /[\u0000-\u001f]/.test(value)) throw new ApiError(400, 'Invalid idempotency key');
  return value;
}

function constantTimeEqual(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function normalizedOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value.includes('://') ? value : `https://${value}`).origin;
  } catch {
    return undefined;
  }
}

function trustedRequestOrigin(req: Request): boolean {
  const requestOrigin = normalizedOrigin(req.header('origin'));
  if (!requestOrigin) return !req.header('origin');

  const allowedOrigins = new Set<string>();
  const host = req.get('host');
  if (host) {
    const sameOrigin = normalizedOrigin(`${req.protocol}://${host}`);
    if (sameOrigin) allowedOrigins.add(sameOrigin);
  }

  const development = process.env.NODE_ENV === 'development';
  if (development) {
    const port = Math.max(1, Math.min(65535, Number(process.env.PORT) || 3000));
    allowedOrigins.add(`http://localhost:${port}`);
    allowedOrigins.add(`http://127.0.0.1:${port}`);
  }

  const configuredOrigins = development
    ? [process.env.V0_RUNTIME_URL, process.env.V0_DEV_APP_URL, process.env.V0_BUILD_URL, process.env.V0_SANDBOX_URL]
    : [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL];
  for (const value of configuredOrigins) {
    const origin = normalizedOrigin(value);
    if (origin) allowedOrigins.add(origin);
  }

  return allowedOrigins.has(requestOrigin);
}

function configuredWorkerTriggerSecrets(): string[] {
  const secret = process.env.JOB_TRIGGER_SECRET;
  return secret && Buffer.byteLength(secret) >= 32 ? [secret] : [];
}

function jobInputAppIds(value: unknown): string[] | undefined {
  const ids = stringList(value, 'appIds');
  if (ids && ids.length > 50) throw new ApiError(400, 'At most 50 applications may be selected');
  return ids;
}

function errorMessage(error: unknown): string {
  if (error instanceof WorkspaceRecordNotFound) return 'The requested workspace record was not found';
  if (error instanceof ApiError) return error.message;
  return 'The request could not be completed';
}

app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '2mb', parameterLimit: 1000 }));
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=63072000');
  next();
});
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || trustedRequestOrigin(req)) return next();
  res.status(403).json({ error: 'Request origin is not allowed' });
});
app.use((req, _res, next) => {
  if (req.path.startsWith('/api')) console.info(`[API] ${req.method} ${req.path}`);
  next();
});

// Only health, authentication bootstrap, capability status, and the secret-protected
// worker trigger are public. Every domain route is session- and membership-protected.
app.use('/api', (req, res, next) => {
  const pathname = new URL(req.originalUrl, 'http://localhost').pathname;
  const publicPaths = new Set([
    '/api/health', '/api/health/live', '/api/health/ready',
    '/api/auth/register', '/api/auth/login', '/api/auth/logout', '/api/auth/session',
    '/api/integrations/status', '/api/internal/jobs/process',
  ]);
  if (publicPaths.has(pathname)) return next();
  return authMiddleware(req, res, next);
});

app.get('/api/health/live', (_req, res) => res.json({ status: 'live' }));
app.get(['/api/health', '/api/health/ready'], asyncRoute(async (_req, res) => {
  const database = databaseConfigured();
  const authentication = authSecretConfigured();
  let reachable = false;
  let migrations: { current: boolean; pending: string[] } = { current: false, pending: [] };
  let activeWorkers = 0;
  if (database) {
    try {
      await query('SELECT 1');
      reachable = true;
      const status = await getMigrationStatus();
      migrations = { current: status.current, pending: status.pending };
      activeWorkers = await getActiveJobWorkerCount();
    } catch {
      reachable = false;
    }
  }
  const workerMode = process.env.JOB_EXECUTION_MODE;
  const workerConfigured = (workerMode === 'worker' || workerMode === 'http_trigger') && (workerMode !== 'http_trigger' || configuredWorkerTriggerSecrets().length > 0);
  const workerActive = activeWorkers > 0;
  const ready = database && reachable && authentication && migrations.current && workerConfigured && workerActive;
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not_ready',
    dependencies: {
      database: !database ? 'not_configured' : reachable ? 'reachable' : 'unreachable',
      migrations: !database ? 'unknown' : migrations.current ? 'current' : 'pending',
      authentication: authentication ? 'configured' : 'misconfigured',
      jobExecution: !workerConfigured ? 'not_configured' : workerActive ? 'active' : 'worker_not_observed',
    },
    activeWorkerCount: activeWorkers,
    pendingMigrationCount: migrations.pending.length,
  });
}));

app.post('/api/auth/register', asyncRoute(async (req, res) => {
  if (!databaseConfigured()) throw new ApiError(503, 'Authentication requires DATABASE_URL configuration');
  if (!authSecretConfigured()) throw new ApiError(503, 'Authentication requires a valid AUTH_SESSION_SECRET');
  const result = await register(String(req.body?.email || ''), String(req.body?.password || ''), String(req.body?.workspaceName || 'My Workspace'));
  tokenCookie(res, result.token, result.expires);
  res.status(201).json({ user: result.user, expiresAt: result.expires.toISOString() });
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  if (!databaseConfigured()) throw new ApiError(503, 'Authentication requires DATABASE_URL configuration');
  if (!authSecretConfigured()) throw new ApiError(503, 'Authentication requires a valid AUTH_SESSION_SECRET');
  try {
    const result = await login(String(req.body?.email || ''), String(req.body?.password || ''));
    tokenCookie(res, result.token, result.expires);
    res.json({ user: result.user, expiresAt: result.expires.toISOString() });
  } catch (error) {
    if (error instanceof InvalidCredentialsError) throw new ApiError(401, 'Invalid email or password');
    throw error;
  }
}));

app.post('/api/auth/logout', asyncRoute(async (req, res) => {
  if (requestToken(req) && databaseConfigured() && authSecretConfigured()) await logout(requestToken(req));
  clearTokenCookie(res);
  res.status(204).end();
}));

app.get('/api/auth/session', asyncRoute(async (req, res) => {
  if (!databaseConfigured()) throw new ApiError(503, 'Authentication requires DATABASE_URL configuration');
  if (!authSecretConfigured()) throw new ApiError(503, 'Authentication requires a valid AUTH_SESSION_SECRET');
  const session = await currentSession(requestToken(req));
  if (!session) throw new ApiError(401, 'Authentication required');
  res.json({ user: session });
}));

app.get('/api/integrations/status', asyncRoute(async (_req, res) => {
  const connectors = await Promise.all(connectorRegistry.getAll().map(async (connector) => {
    let connection: { status: string; latencyMs?: number; message?: string };
    try {
      connection = await connector.getStatus();
    } catch {
      connection = { status: 'unavailable' };
    }
    const supportsDiscovery = connector.marketplace === 'steam';
    const supportsReviews = connector.marketplace === 'steam';
    return {
      marketplace: connector.marketplace,
      name: connector.displayName,
      configuration: 'public_source',
      connectivity: connection.status,
      capability: supportsDiscovery || supportsReviews ? 'implemented_not_end_to_end_verified' : 'unsupported',
      capabilities: { discovery: supportsDiscovery, reviews: supportsReviews },
      latencyMs: Number.isFinite(connection.latencyMs) ? connection.latencyMs : null,
      lastTestedAt: new Date().toISOString(),
      lastSuccessfulRetrievalAt: null,
      message: connection.status === 'operational' ? 'Source endpoint responded; retrieval capability is not verified by this health probe.' : 'Source endpoint is unavailable or unsupported.',
      nextAction: supportsReviews ? 'Run a real, workspace-authorized collection job to verify review retrieval.' : 'No review collection capability is currently verified for this marketplace.',
    };
  }));
  const aiConfigured = isAIProviderConfigured();
  res.json({
    generatedAt: new Date().toISOString(),
    statuses: connectors,
    email: { configuration: 'not_implemented', connectivity: 'not_tested', capability: 'delivery_adapter_unavailable', status: 'not_ready', nextAction: 'No email delivery adapter is implemented; no messages can be sent.' },
    ai: { configuration: aiConfigured ? 'configured' : 'not_configured', connectivity: 'not_tested', capability: 'not_verified', status: aiConfigured ? 'configured_not_tested' : 'not_configured' },
  });
}));

app.get('/api/stats', asyncRoute(async (_req, res) => res.json(await domainStore.getStats(actorFrom(res)))));

app.get('/api/reports/research.pdf', asyncRoute(async (req, res) => {
  const actor = actorFrom(res);
  const requestedAppIds = typeof req.query.appIds === 'string' ? [...new Set(req.query.appIds.split(',').filter(Boolean))] : [];
  if (requestedAppIds.length > 50) throw new ApiError(400, 'At most 50 applications may be selected');
  const allApps = await domainStore.getApps(actor);
  const apps = requestedAppIds.length ? allApps.filter((item) => requestedAppIds.includes(item.id)) : allApps;
  if (requestedAppIds.length && apps.length !== requestedAppIds.length) throw new WorkspaceRecordNotFound();
  const appIds = new Set(apps.map((item) => item.id));
  const reviews = await domainStore.getAllReviews(actor, { limit: 5000 });
  const scopedReviews = requestedAppIds.length ? reviews.filter((item) => appIds.has(item.appId)) : reviews;
  const themes = (await domainStore.getThemes(actor)).filter((theme) => !requestedAppIds.length || theme.affectedApps.some((appId) => appIds.has(appId)));
  const opportunities = (await domainStore.getOpportunities(actor)).filter((item) => !requestedAppIds.length || item.supportingAppIds.some((appId) => appIds.has(appId)));
  const pdf = await generateResearchReport({ title: 'AppPulse Intelligence Research Report', apps, reviews: scopedReviews, themes, opportunities });
  const reportId = await domainStore.recordExport(actor, 'pdf', { appCount: apps.length, reviewCount: scopedReviews.length, themeCount: themes.length, opportunityCount: opportunities.length });
  res.setHeader('X-AppPulse-Report-Id', reportId);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="apppulse-research-report.pdf"');
  res.send(pdf);
}));

app.get('/api/apps', asyncRoute(async (req, res) => {
  const filter: AppDiscoveryFilter = {
    query: typeof req.query.query === 'string' ? req.query.query.slice(0, 200) : undefined,
    category: typeof req.query.category === 'string' ? req.query.category : undefined,
    marketplace: typeof req.query.marketplace === 'string' ? req.query.marketplace : undefined,
    minRating: numberQuery(req.query.minRating, 'minRating', 0, 5),
    maxRating: numberQuery(req.query.maxRating, 'maxRating', 0, 5),
    minVersion: typeof req.query.minVersion === 'string' ? req.query.minVersion : undefined,
    maxVersion: typeof req.query.maxVersion === 'string' ? req.query.maxVersion : undefined,
    updateFrequency: typeof req.query.updateFrequency === 'string' ? req.query.updateFrequency : undefined,
    hasBugMentions: req.query.hasBugMentions === 'true',
    hasFeatureRequests: req.query.hasFeatureRequests === 'true',
  };
  res.json(await domainStore.getApps(actorFrom(res), filter));
}));

app.get('/api/apps/:id', asyncRoute(async (req, res) => {
  const actor = actorFrom(res);
  const appItem = await domainStore.getAppById(actor, req.params.id);
  if (!appItem) throw new WorkspaceRecordNotFound();
  const reviewsData = await domainStore.getReviews(actor, { appId: appItem.id, limit: 100 });
  res.json({ app: appItem, reviews: reviewsData.reviews, totalReviews: reviewsData.total });
}));

app.post('/api/apps/search-online', ownerOnly, asyncRoute(async (req, res) => {
  const queryText = requiredString(req.body?.query, 'query', 200);
  const marketplace = String(req.body?.marketplace || 'steam') as Marketplace;
  if (!supportedMarketplaces.has(marketplace)) throw new ApiError(400, 'Unsupported marketplace');
  const connector = connectorRegistry.get(marketplace);
  if (!connector) throw new ApiError(400, 'Unsupported marketplace');
  let liveApps: Application[];
  try {
    liveApps = await connector.searchApps({ query: queryText, limit: 12 });
  } catch {
    throw new ApiError(502, 'Marketplace search is unavailable; no results were saved');
  }
  const saved = await domainStore.saveApps(actorFrom(res), liveApps, 'live');
  res.json({ apps: saved, count: saved.length });
}));

app.get('/api/jobs', asyncRoute(async (req, res) => {
  const type = typeof req.query.type === 'string' && ['collection', 'analysis', 'forecast', 'opportunities'].includes(req.query.type)
    ? req.query.type as JobType
    : undefined;
  res.json((await listJobs(actorFrom(res), type)).map((job) => ({
    ...job,
    jobType: job.type,
    appId: typeof job.input.appId === 'string' ? job.input.appId : '',
    appName: typeof job.input.appName === 'string' ? job.input.appName : typeof job.result?.appName === 'string' ? job.result.appName : '',
    marketplace: typeof job.input.marketplace === 'string' ? job.input.marketplace : typeof job.result?.marketplace === 'string' ? job.result.marketplace : '',
    collectedCount: typeof job.result?.collectedCount === 'number' ? job.result.collectedCount : 0,
    deduplicatedCount: typeof job.result?.deduplicatedCount === 'number' ? job.result.deduplicatedCount : 0,
    outcome: typeof job.result?.outcome === 'string' ? job.result.outcome : undefined,
    error: job.error,
  })));
}));

app.get('/api/jobs/:id', asyncRoute(async (req, res) => {
  const job = await getJob(actorFrom(res), req.params.id);
  if (!job) throw new WorkspaceRecordNotFound();
  res.json(job);
}));

app.post('/api/jobs/:id/cancel', ownerOnly, asyncRoute(async (req, res) => {
  const result = await cancelJob(actorFrom(res), req.params.id);
  if (result === 'not_found') throw new WorkspaceRecordNotFound();
  if (result === 'running') throw new ApiError(409, 'A running job cannot be cancelled; it will finish or be recovered');
  if (result === 'terminal') throw new ApiError(409, 'This job is no longer pending');
  res.json({ success: true, status: 'cancelled' });
}));

const processTriggeredJob = asyncRoute(async (req, res) => {
  if (process.env.JOB_EXECUTION_MODE !== 'http_trigger') throw new ApiError(503, 'HTTP-triggered job execution is not enabled');
  const secrets = configuredWorkerTriggerSecrets();
  const authorization = req.header('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const authorized = Boolean(match && secrets.some((secret) => constantTimeEqual(match[1], secret)));
  if (!secrets.length || !authorized) {
    res.status(secrets.length ? 401 : 503).json({ error: secrets.length ? 'Worker authentication failed' : 'Worker trigger is not configured' });
    return;
  }
  const result = await processNextJob('http-trigger');
  res.status(result ? 200 : 204);
  if (result) res.json({ processed: true, status: result.status });
  else res.end();
});
  app.post('/api/internal/jobs/process', processTriggeredJob);

app.post('/api/apps/collect', ownerOnly, asyncRoute(async (req, res) => {
  const actor = actorFrom(res);
  const appId = requiredString(req.body?.appId, 'appId');
  const appItem = await domainStore.getAppById(actor, appId);
  if (!appItem) throw new WorkspaceRecordNotFound();
  const job = await enqueueJob(actor, 'collection', { appId, appName: appItem.name, marketplace: appItem.marketplace, negativeOnly: req.body?.negativeOnly === true }, safeJobKey(req.header('Idempotency-Key')));
  res.status(202).json({ job: { ...job, appId, appName: appItem.name, marketplace: appItem.marketplace }, message: 'Collection job queued for the configured worker.' });
}));

app.get('/api/reviews', asyncRoute(async (req, res) => {
  const result = await domainStore.getReviews(actorFrom(res), {
    appId: typeof req.query.appId === 'string' ? req.query.appId : undefined,
    marketplace: typeof req.query.marketplace === 'string' ? req.query.marketplace : undefined,
    negativeOnly: req.query.negativeOnly === 'true',
    starRating: numberQuery(req.query.starRating, 'starRating', 1, 5),
    category: typeof req.query.category === 'string' ? req.query.category : undefined,
    searchQuery: typeof req.query.searchQuery === 'string' ? req.query.searchQuery.slice(0, 200) : undefined,
    featureRequestsOnly: req.query.featureRequestsOnly === 'true',
    bugsOnly: req.query.bugsOnly === 'true',
    pricingOnly: req.query.pricingOnly === 'true',
    limit: numberQuery(req.query.limit, 'limit', 1, 500),
    offset: numberQuery(req.query.offset, 'offset', 0, 20_000),
  });
  res.json(result);
}));

app.post('/api/reviews/:id/tag', asyncRoute(async (req, res) => {
  const updated = await domainStore.updateReview(actorFrom(res), req.params.id, {
    notes: req.body?.notes,
    savedToCollection: req.body?.savedToCollection,
    tagList: req.body?.tagList,
  });
  res.json(updated);
}));

app.get('/api/themes', asyncRoute(async (_req, res) => res.json(await domainStore.getThemes(actorFrom(res)))));

app.post('/api/analyze', ownerOnly, asyncRoute(async (req, res) => {
  const appIds = jobInputAppIds(req.body?.appIds);
  if (appIds?.length) {
    const apps = await domainStore.getApps(actorFrom(res));
    if (appIds.some((id) => !apps.some((item) => item.id === id))) throw new WorkspaceRecordNotFound();
  }
  const job = await enqueueJob(actorFrom(res), 'analysis', { appIds: appIds || [], category: typeof req.body?.category === 'string' ? req.body.category.slice(0, 80) : undefined }, safeJobKey(req.header('Idempotency-Key')));
  res.status(202).json({ job, message: 'Evidence analysis queued for the configured worker.' });
}));

app.get('/api/forecasts', asyncRoute(async (_req, res) => res.json(await domainStore.getForecasts(actorFrom(res)))));

app.post('/api/forecasts/generate', ownerOnly, asyncRoute(async (req, res) => {
  const appIds = jobInputAppIds(req.body?.appIds);
  if (appIds?.length) {
    const apps = await domainStore.getApps(actorFrom(res));
    if (appIds.some((id) => !apps.some((item) => item.id === id))) throw new WorkspaceRecordNotFound();
  }
  const job = await enqueueJob(actorFrom(res), 'forecast', { appIds: appIds || [] }, safeJobKey(req.header('Idempotency-Key')));
  res.status(202).json({ job, message: 'Evidence-based forecast queued for the configured worker.' });
}));

app.post('/api/forecasts/:id/promote', ownerOnly, asyncRoute(async (req, res) => {
  const opportunity = await domainStore.promoteForecastToOpportunity(actorFrom(res), req.params.id);
  if (!opportunity) throw new WorkspaceRecordNotFound();
  res.json({ success: true, opportunity });
}));

app.get('/api/compare', asyncRoute(async (req, res) => {
  if (typeof req.query.appIds !== 'string') throw new ApiError(400, 'appIds parameter required');
  const ids = [...new Set(req.query.appIds.split(',').filter(Boolean))];
  if (!ids.length || ids.length > 4) throw new ApiError(400, 'Select between 1 and 4 applications');
  const actor = actorFrom(res);
  const apps = await domainStore.getApps(actor);
  const selectedApps = ids.map((id) => apps.find((item) => item.id === id));
  if (selectedApps.some((item) => !item)) throw new WorkspaceRecordNotFound();
  const comparisonData = await Promise.all((selectedApps as Application[]).map(async (appItem) => {
    const result = await domainStore.getReviews(actor, { appId: appItem.id, limit: 500 });
    const negatives = result.reviews.filter((review) => review.starRating <= 2);
    const featureRequests = result.reviews.filter((review) => review.classification?.isFeatureRequest);
    const categories: Record<string, number> = {};
    for (const review of negatives) {
      const category = review.classification?.category || 'Other';
      categories[category] = (categories[category] || 0) + 1;
    }
    return {
      app: appItem,
      totalReviewsSampled: result.reviews.length,
      negativeReviewsCount: negatives.length,
      negativeRate: result.reviews.length ? negatives.length / result.reviews.length : 0,
      featureRequestsCount: featureRequests.length,
      topComplaints: Object.entries(categories).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name, count]) => ({ name, count })),
    };
  }));
  res.json({ comparison: comparisonData });
}));

app.get('/api/opportunities', asyncRoute(async (_req, res) => res.json(await domainStore.getOpportunities(actorFrom(res)))));

app.post('/api/opportunities/generate', ownerOnly, asyncRoute(async (req, res) => {
  const appIds = jobInputAppIds(req.body?.appIds);
  if (appIds?.length) {
    const apps = await domainStore.getApps(actorFrom(res));
    if (appIds.some((id) => !apps.some((item) => item.id === id))) throw new WorkspaceRecordNotFound();
  }
  const job = await enqueueJob(actorFrom(res), 'opportunities', { appIds: appIds || [] }, safeJobKey(req.header('Idempotency-Key')));
  res.status(202).json({ job, message: 'Evidence-backed opportunity generation queued for the configured worker.' });
}));

app.post('/api/opportunities', asyncRoute(async (req, res) => {
  if (!req.body || typeof req.body !== 'object') throw new ApiError(400, 'Opportunity data is required');
  const saved = await domainStore.saveOpportunity(actorFrom(res), req.body as Opportunity);
  res.json(saved);
}));

app.delete('/api/opportunities/:id', ownerOnly, asyncRoute(async (req, res) => {
  if (!await domainStore.deleteOpportunity(actorFrom(res), req.params.id)) throw new WorkspaceRecordNotFound();
  res.json({ success: true });
}));

app.get('/api/contacts', asyncRoute(async (_req, res) => res.json(await domainStore.getContacts(actorFrom(res)))));
app.post('/api/contacts', asyncRoute(async (req, res) => {
  const contact = await domainStore.saveContact(actorFrom(res), req.body as Contact);
  res.json(contact);
}));
app.delete('/api/contacts/:id', ownerOnly, asyncRoute(async (req, res) => {
  if (!await domainStore.deleteContact(actorFrom(res), req.params.id)) throw new WorkspaceRecordNotFound();
  res.json({ success: true });
}));

app.post('/api/contacts/import-csv', ownerOnly, asyncRoute(async (req, res) => {
  if (typeof req.body?.csvContent !== 'string' || !req.body.csvContent.trim()) throw new ApiError(400, 'csvContent is required');
  const rows = parseCsv(req.body.csvContent);
  if (rows.length > 500) throw new ApiError(400, 'Contact import is limited to 500 rows');
  const contacts: Contact[] = [];
  for (const row of rows) {
    const email = row.email || row.Email || row.contact_email;
    const name = row.name || row.Name;
    const company = row.company || row.Company;
    if (!email || !name || !company || !/^\S+@\S+\.\S+$/.test(email.trim())) continue;
    const requestedBasis = row.consentBasis || row['Consent Basis'];
    const consentBasis: Contact['consentBasis'] = ['Legitimate Interest (B2B)', 'Public Publisher Info', 'Inquiry Request'].includes(requestedBasis)
      ? requestedBasis as Contact['consentBasis']
      : 'Unverified';
    contacts.push({
      id: `cnt_csv_${crypto.randomUUID()}`,
      name,
      title: row.title || row.Title || '',
      company,
      email: email.trim().toLowerCase(),
      phone: row.phone || row.Phone || undefined,
      website: row.website || row.Website || undefined,
      channel: 'email',
      sourceUrl: row.sourceUrl || row.Source || '',
      status: 'New',
      consentBasis,
      notes: 'Imported from CSV; verify source and consent basis before outreach.',
      createdAt: new Date().toISOString(),
    });
  }
  const saved = await domainStore.saveContacts(actorFrom(res), contacts);
  res.json({ imported: saved.length, contacts: saved, skipped: rows.length - saved.length });
}));

app.get('/api/suppression', asyncRoute(async (_req, res) => res.json(await domainStore.getSuppressionList(actorFrom(res)))));
app.post('/api/suppression', ownerOnly, asyncRoute(async (req, res) => {
  const record = await domainStore.addSuppression(actorFrom(res), req.body?.emailOrDomain, req.body?.reason as SuppressionRecord['reason'] || 'manual_suppression');
  res.json(record);
}));
app.delete('/api/suppression/:id', ownerOnly, asyncRoute(async (req, res) => {
  if (!await domainStore.removeSuppression(actorFrom(res), req.params.id)) throw new WorkspaceRecordNotFound();
  res.json({ success: true });
}));

app.post('/api/outreach/draft', asyncRoute(async (req, res) => {
  const actor = actorFrom(res);
  const contactId = requiredString(req.body?.contactId, 'contactId');
  const contact = await domainStore.getContact(actor, contactId);
  if (!contact) throw new WorkspaceRecordNotFound();
  if (contact.status === 'Do Not Contact' || contact.consentBasis === 'Unverified') throw new ApiError(403, 'Verify contact provenance and consent before drafting outreach');
  const opportunityId = requiredString(req.body?.opportunityId, 'opportunityId');
  const opportunity = await domainStore.getOpportunity(actor, opportunityId);
  if (!opportunity || !opportunity.supportingReviewIds.length) throw new ApiError(400, 'An opportunity with collected review evidence is required');
  const validReviews = await domainStore.getAllReviews(actor, { limit: 25_000 });
  if (opportunity.supportingReviewIds.some((id) => !validReviews.some((review) => review.id === id))) throw new WorkspaceRecordNotFound();
  let appItem: Application | undefined;
  if (req.body?.appId) {
    appItem = await domainStore.getAppById(actor, requiredString(req.body.appId, 'appId'));
    if (!appItem || !opportunity.supportingAppIds.includes(appItem.id)) throw new WorkspaceRecordNotFound();
  }
  const draft = await draftOutreachEmailWithAI({
    contact,
    opportunity,
    app: appItem,
    objective: typeof req.body?.objective === 'string' ? req.body.objective.slice(0, 120) : 'Product Partnership',
    tone: typeof req.body?.tone === 'string' ? req.body.tone.slice(0, 80) : 'Consultative',
  });
  res.json(draft);
}));

app.get('/api/campaigns', asyncRoute(async (_req, res) => res.json(await domainStore.getCampaigns(actorFrom(res)))));
app.post('/api/campaigns', ownerOnly, asyncRoute(async (req, res) => res.json(await domainStore.saveCampaign(actorFrom(res), req.body as Campaign))));
app.post('/api/campaigns/:id/send', ownerOnly, asyncRoute(async (req, res) => {
  const result = await domainStore.prepareCampaignSend(actorFrom(res), req.params.id);
  res.json({
    success: false,
    status: result.status,
    sent: 0,
    blocked: result.blockedRecipients.length,
    reasons: [result.message, ...result.blockedRecipients.map((email) => `${email}: Suppressed by workspace policy`)],
  });
}));

app.get('/api/projects', asyncRoute(async (_req, res) => res.json(await domainStore.getProjects(actorFrom(res)))));
app.post('/api/projects', asyncRoute(async (req, res) => res.json(await domainStore.saveProject(actorFrom(res), req.body as ResearchProject))));
app.get('/api/audit-logs', ownerOnly, asyncRoute(async (req, res) => {
  const limit = numberQuery(req.query.limit, 'limit', 1, 500) || 100;
  res.json(await domainStore.getAuditLogs(actorFrom(res), limit));
}));

app.get('/api/settings', asyncRoute(async (_req, res) => {
  const actor = actorFrom(res);
  const statuses = await Promise.all(connectorRegistry.getAll().map(async (connector) => {
    try {
      const source = await connector.getStatus();
      return { marketplace: connector.marketplace, name: connector.displayName, configuration: 'public_source', connectivity: source.status, capability: connector.marketplace === 'steam' ? 'reviews_implemented_not_verified' : 'unsupported', latencyMs: Number.isFinite(source.latencyMs) ? source.latencyMs : null, lastSuccessfulRetrievalAt: null };
    } catch {
      return { marketplace: connector.marketplace, name: connector.displayName, configuration: 'unknown', connectivity: 'unavailable', capability: 'not_verified', latencyMs: null, lastSuccessfulRetrievalAt: null };
    }
  }));
  const aiConfigured = isAIProviderConfigured();
  res.json({
    workspaceName: actor.workspaceName,
    aiModel: 'gemini-3.8-flash',
    aiStatus: aiConfigured ? 'configured_not_tested' : 'deterministic_fallback',
    aiConfiguration: aiConfigured ? 'configured' : 'not_configured',
    aiConnectivity: 'not_tested',
    connectors: statuses,
    emailProvider: 'No delivery adapter implemented; no messages are sent',
    emailConfiguration: 'not_implemented',
    emailDeliveryReady: false,
    dataRetentionDays: 90,
    suppressionCount: (await domainStore.getSuppressionList(actor)).length,
  });
}));

app.get('/api/export', ownerOnly, asyncRoute(async (req, res) => {
  const actor = actorFrom(res);
  const type = typeof req.query.type === 'string' ? req.query.type : '';
  const format = req.query.format === 'json' ? 'json' : req.query.format === 'csv' || !req.query.format ? 'csv' : undefined;
  if (!format) throw new ApiError(400, 'Export format must be csv or json');
  let output: unknown[];
  let columns: { key: string; header: string }[] = [];
  if (type === 'reviews') {
    output = await domainStore.getAllReviews(actor, { limit: 5000 });
    columns = [
      { key: 'id', header: 'Review ID' }, { key: 'appName', header: 'App Name' }, { key: 'marketplace', header: 'Marketplace' },
      { key: 'starRating', header: 'Star Rating' }, { key: 'reviewDate', header: 'Review Date' }, { key: 'text', header: 'Review Text' },
      { key: 'helpfulVotes', header: 'Helpful Votes' }, { key: 'appVersion', header: 'App Version' }, { key: 'collectedAt', header: 'Collected At' },
      { key: 'provenance', header: 'Provenance' }, { key: 'sourceReviewId', header: 'Source Review ID' }, { key: 'reviewUrl', header: 'Source URL' },
    ];
  } else if (type === 'opportunities') {
    output = await domainStore.getOpportunities(actor);
    columns = [
      { key: 'id', header: 'Opportunity ID' }, { key: 'title', header: 'Opportunity Title' }, { key: 'severity', header: 'Severity' },
      { key: 'priorityScore', header: 'Priority Score (0-100)' }, { key: 'complaintFrequency', header: 'Complaint Count' },
      { key: 'problemStatement', header: 'Problem Statement' }, { key: 'proposedConcept', header: 'Proposed Concept' },
      { key: 'differentiationHypothesis', header: 'Differentiation' }, { key: 'status', header: 'Validation Status' },
    ];
  } else if (type === 'contacts') {
    output = await domainStore.getContacts(actor);
    columns = [
      { key: 'name', header: 'Contact Name' }, { key: 'title', header: 'Title' }, { key: 'company', header: 'Company' },
      { key: 'email', header: 'Email' }, { key: 'website', header: 'Website' }, { key: 'status', header: 'Status' }, { key: 'consentBasis', header: 'Consent Basis' },
    ];
  } else {
    throw new ApiError(400, 'Invalid export type. Use reviews, opportunities, or contacts.');
  }
  const reportId = await domainStore.recordExport(actor, format, { type, recordCount: output.length });
  res.setHeader('X-AppPulse-Report-Id', reportId);
  if (format === 'json') {
    res.setHeader('Content-Disposition', `attachment; filename="apppulse_${type}.json"`);
    res.json(output);
    return;
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="apppulse_${type}.csv"`);
  res.send(jsonToCsv(output as Record<string, unknown>[], columns as never));
}));

const sendAuditReport = asyncRoute(async (_req, res) => {
  const filePath = path.resolve(serverDirectory, 'AppPulse_Implementation_Audit_Report.pdf');
  if (!fs.existsSync(filePath)) throw new ApiError(404, 'Audit PDF report not found');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="AppPulse_Implementation_Audit_Report.pdf"');
  res.sendFile(filePath);
});
app.get('/api/audit-report/download', ownerOnly, sendAuditReport);
app.get('/AppPulse_Implementation_Audit_Report.pdf', authMiddleware, ownerOnly, sendAuditReport);

app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found' }));
app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (res.headersSent) return;
  if (error instanceof WorkspaceRecordNotFound) {
    res.status(404).json({ error: 'The requested workspace record was not found' });
    return;
  }
  if (error instanceof ApiError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }
  const statusCode = typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number' ? error.status : 500;
  if (statusCode === 400) {
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code).slice(0, 16) : 'unknown';
  console.error(`[API] ${req.method} ${req.path} failed (${code})`);
  res.status(500).json({ error: errorMessage(error) });
});

export { app };
