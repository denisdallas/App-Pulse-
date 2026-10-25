import { analyzeComplaintsWithAI, forecastFutureWeaknessesWithAI, generateOpportunitiesWithAI } from './ai.ts';
import { connectorRegistry } from './connectors/index.ts';
import { UnsupportedConnectorError } from './connectors/types.ts';
import { domainStore, type WorkspaceActor } from './domain-store.ts';
import { generateReviewFingerprint } from '../src/lib/dedup.ts';
import type { Application, ComplaintTheme, Review } from '../src/types.ts';
import type { DurableJob } from './job-queue.ts';
import { claimNextJob, completeJob, failJob, heartbeatJob } from './job-queue.ts';

function actorFor(job: DurableJob): WorkspaceActor {
  if (!job.requested_by) throw new Error('The requesting workspace member no longer exists');
  return {
    userId: job.requested_by,
    workspaceId: job.workspace_id,
    workspaceName: '',
    email: '',
    role: 'member',
  };
}

function annotateThemeEvidence(themes: ComplaintTheme[], reviews: Review[]): ComplaintTheme[] {
  return themes.map((theme) => {
    const exactQuoteReviews = reviews.filter((review) =>
      (theme.representativeQuotes || []).some((quote) => quote.length >= 12 && review.text.includes(quote)),
    );
    const related = exactQuoteReviews.length ? exactQuoteReviews : reviews.filter((review) =>
      theme.affectedApps.includes(review.appId) && review.classification?.category === theme.category,
    );
    return { ...theme, supportingReviewIds: [...new Set(related.map((review) => review.id))] };
  });
}

async function runCollection(job: DurableJob, actor: WorkspaceActor): Promise<Record<string, unknown>> {
  const appId = typeof job.input.appId === 'string' ? job.input.appId : '';
  const app = await domainStore.getAppById(actor, appId);
  if (!app) throw new Error('The requested application is unavailable in this workspace');
  const connector = connectorRegistry.get(app.marketplace);
  if (!connector) throw new UnsupportedConnectorError('This marketplace connector is unavailable.');
  if (!app.collectionAvailable) throw new UnsupportedConnectorError('Review collection is not supported for this application source.');

  await heartbeatJob(job, 15);
  const result = await connector.fetchReviews(app.id, {
    negativeOnly: job.input.negativeOnly !== false,
    limit: 100,
  });
  const incoming = result.reviews.map((review) => {
    const reviewDate = review.reviewDate;
    return {
      ...review,
      appName: app.name,
      provenance: 'live_marketplace' as const,
      fingerprint: generateReviewFingerprint(review.appId, review.text, review.starRating, reviewDate),
    };
  });
  await heartbeatJob(job, 70);
  const saved = await domainStore.saveReviews(actor, incoming);
  await domainStore.markAppCollected(actor, app.id);
  return {
    appId: app.id,
    appName: app.name,
    marketplace: app.marketplace,
    outcome: incoming.length === 0 ? 'empty' : 'collected',
    receivedCount: incoming.length,
    collectedCount: saved.inserted,
    deduplicatedCount: saved.duplicates,
    totalAvailable: result.totalAvailable,
    hasMore: result.hasMore,
  };
}

async function workspaceInputs(job: DurableJob, actor: WorkspaceActor): Promise<{ apps: Application[]; reviews: Review[] }> {
  const requestedIds = Array.isArray(job.input.appIds)
    ? [...new Set(job.input.appIds.filter((id): id is string => typeof id === 'string').slice(0, 50))]
    : [];
  const apps = await domainStore.getApps(actor);
  const selectedApps = requestedIds.length ? apps.filter((app) => requestedIds.includes(app.id)) : apps;
  if (requestedIds.length && selectedApps.length !== requestedIds.length) throw new Error('One or more applications are unavailable in this workspace');
  const selectedIds = new Set(selectedApps.map((app) => app.id));
  const reviewsResult = await domainStore.getReviews(actor, { negativeOnly: true, limit: 500, offset: 0 });
  const reviews = reviewsResult.reviews.filter((review) => selectedIds.has(review.appId));
  return { apps: selectedApps, reviews };
}

async function runAnalysis(job: DurableJob, actor: WorkspaceActor): Promise<Record<string, unknown>> {
  const { apps, reviews } = await workspaceInputs(job, actor);
  await heartbeatJob(job, 20);
  const themes = annotateThemeEvidence(await analyzeComplaintsWithAI(reviews, apps), reviews);
  await heartbeatJob(job, 80);
  await domainStore.saveThemes(actor, themes);
  return { count: themes.length, themes, evidenceReviewCount: reviews.length };
}

async function runForecast(job: DurableJob, actor: WorkspaceActor): Promise<Record<string, unknown>> {
  const { apps, reviews } = await workspaceInputs(job, actor);
  const themes = await domainStore.getThemes(actor);
  const relevantThemes = themes.filter((theme) => theme.affectedApps.some((appId) => apps.some((app) => app.id === appId)));
  await heartbeatJob(job, 20);
  const forecasts = await forecastFutureWeaknessesWithAI(reviews, apps, relevantThemes);
  await heartbeatJob(job, 80);
  await domainStore.saveForecasts(actor, forecasts);
  return { count: forecasts.length, forecasts, evidenceReviewCount: reviews.length };
}

async function runOpportunities(job: DurableJob, actor: WorkspaceActor): Promise<Record<string, unknown>> {
  const apps = await domainStore.getApps(actor);
  const themes = await domainStore.getThemes(actor);
  const relevantThemes = themes.filter((theme) => theme.affectedApps.some((appId) => apps.some((app) => app.id === appId)));
  await heartbeatJob(job, 20);
  const opportunities = await generateOpportunitiesWithAI(relevantThemes, apps);
  await heartbeatJob(job, 80);
  const saved: OpportunityResult[] = [];
  for (const opportunity of opportunities) saved.push(await domainStore.saveOpportunity(actor, opportunity));
  return { count: saved.length, opportunities: saved };
}

type OpportunityResult = Awaited<ReturnType<typeof domainStore.saveOpportunity>>;

export async function processNextJob(workerId: string): Promise<{ id: string; status: string } | null> {
  const job = await claimNextJob(workerId);
  if (!job) return null;
  try {
    const actor = actorFor(job);
    let result: Record<string, unknown>;
    switch (job.job_type) {
      case 'collection':
        result = await runCollection(job, actor);
        break;
      case 'analysis':
        result = await runAnalysis(job, actor);
        break;
      case 'forecast':
        result = await runForecast(job, actor);
        break;
      case 'opportunities':
        result = await runOpportunities(job, actor);
        break;
      case 'export':
      case 'report':
        throw new Error('This job type has no configured executor');
      default:
        throw new Error('Unsupported persisted job type');
    }
    const completed = await completeJob(job, result);
    return { id: job.id, status: completed ? 'completed' : 'lease_lost' };
  } catch (error) {
    const retryable = !(error instanceof UnsupportedConnectorError);
    const status = await failJob(job, error, retryable);
    return { id: job.id, status: status || 'lease_lost' };
  }
}
