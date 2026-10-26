import { analyzeComplaintsWithAI, analyzeCompetitorsWithAI, forecastFutureWeaknessesWithAI, generateOpportunitiesWithAI } from './ai.ts';
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

  const negativeOnly = job.input.negativeOnly === true;
  const pageLimit = 100;
  const maxPagesPerJob = 2;
  let cursor = await domainStore.getCollectionCursor(actor, app.id, negativeOnly);
  let nextCursor: string | undefined;
  let totalAvailable = 0;
  let pagesFetched = 0;
  let sourceHasMore = false;
  const receivedReviews: Awaited<ReturnType<typeof connector.fetchReviews>>['reviews'] = [];

  for (let page = 0; page < maxPagesPerJob; page += 1) {
    const result = await connector.fetchReviews(app.id, { negativeOnly, limit: pageLimit, cursor });
    receivedReviews.push(...result.reviews);
    pagesFetched += 1;
    totalAvailable = Math.max(totalAvailable, result.totalAvailable || 0);
    sourceHasMore = Boolean(result.hasMore);
    nextCursor = sourceHasMore ? result.nextCursor : undefined;
    await heartbeatJob(job, Math.min(68, 15 + pagesFetched * 5));
    if (!sourceHasMore) {
      nextCursor = undefined;
      break;
    }
    if (!nextCursor || nextCursor === cursor) {
      nextCursor = undefined;
      break;
    }
    cursor = nextCursor;
  }

  const incoming = receivedReviews.map((review) => ({
    ...review,
    appName: app.name,
    provenance: 'live_marketplace' as const,
    fingerprint: generateReviewFingerprint(review.appId, review.text, review.starRating, review.reviewDate),
  }));
  const resumableCursor = sourceHasMore && nextCursor ? nextCursor : undefined;
  const saved = await domainStore.saveCollectedReviews(actor, app.id, incoming, resumableCursor, negativeOnly);
  return {
    appId: app.id,
    appName: app.name,
    marketplace: app.marketplace,
    outcome: incoming.length === 0 ? 'empty' : 'collected',
    receivedCount: incoming.length,
    collectedCount: saved.inserted,
    deduplicatedCount: saved.duplicates,
    totalAvailable,
    pagesFetched,
    hasMore: Boolean(resumableCursor),
    paginationIncomplete: sourceHasMore && !resumableCursor,
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
  const reviews = (await domainStore.getAllReviews(actor, { limit: 25_000 }))
    .filter((review) => selectedIds.has(review.appId) && (review.provenance === 'live_marketplace' || review.provenance === 'imported'));
  return { apps: selectedApps, reviews };
}

async function runAnalysis(job: DurableJob, actor: WorkspaceActor): Promise<Record<string, unknown>> {
  const { apps, reviews } = await workspaceInputs(job, actor);
  const negativeReviews = reviews.filter((review) => review.starRating <= 2);
  await heartbeatJob(job, 20);
  const themes = annotateThemeEvidence(await analyzeComplaintsWithAI(negativeReviews, apps), negativeReviews);
  await heartbeatJob(job, 80);
  await domainStore.saveThemes(actor, themes);
  return { count: themes.length, themeIds: themes.map((theme) => theme.id), evidenceReviewCount: negativeReviews.length };
}

async function runCompetitorAnalysis(job: DurableJob, actor: WorkspaceActor): Promise<Record<string, unknown>> {
  const requestedIds = Array.isArray(job.input.appIds)
    ? [...new Set(job.input.appIds.filter((id): id is string => typeof id === 'string').slice(0, 4))]
    : [];
  if (requestedIds.length < 2) throw new Error('Select between two and four applications for a competitor comparison');
  const allApps = await domainStore.getApps(actor);
  const apps = requestedIds.map((id) => allApps.find((app) => app.id === id));
  if (apps.some((app) => !app)) throw new Error('One or more applications are unavailable in this workspace');
  const appRecords = apps as Application[];
  const selectedIds = new Set(appRecords.map((app) => app.id));
  const reviews = (await domainStore.getAllReviews(actor, { limit: 25_000 }))
    .filter((review) => selectedIds.has(review.appId) && (review.provenance === 'live_marketplace' || review.provenance === 'imported'));
  await heartbeatJob(job, 25);
  const analysis = await analyzeCompetitorsWithAI(appRecords, reviews);
  await heartbeatJob(job, 85);
  return analysis as unknown as Record<string, unknown>;
}

async function runForecast(job: DurableJob, actor: WorkspaceActor): Promise<Record<string, unknown>> {
  const { apps, reviews } = await workspaceInputs(job, actor);
  const themes = await domainStore.getThemes(actor);
  const relevantThemes = themes.filter((theme) => theme.affectedApps.some((appId) => apps.some((app) => app.id === appId)));
  await heartbeatJob(job, 20);
  const forecasts = await forecastFutureWeaknessesWithAI(reviews, apps, relevantThemes);
  await heartbeatJob(job, 80);
  await domainStore.saveForecasts(actor, forecasts);
  return {
    count: forecasts.length,
    forecasts: forecasts.map((forecast) => ({ id: forecast.id, weaknessTitle: forecast.weaknessTitle, futureOpportunityScore: forecast.futureOpportunityScore })),
    evidenceReviewCount: reviews.length,
  };
}

async function runOpportunities(job: DurableJob, actor: WorkspaceActor): Promise<Record<string, unknown>> {
  const requestedIds = Array.isArray(job.input.appIds)
    ? [...new Set(job.input.appIds.filter((id): id is string => typeof id === 'string').slice(0, 50))]
    : [];
  const allApps = await domainStore.getApps(actor);
  const apps = requestedIds.length ? allApps.filter((app) => requestedIds.includes(app.id)) : allApps;
  if (requestedIds.length && apps.length !== requestedIds.length) throw new Error('One or more applications are unavailable in this workspace');
  const appIds = new Set(apps.map((app) => app.id));
  const reviews = (await domainStore.getAllReviews(actor, { limit: 25_000 }))
    .filter((review) => appIds.has(review.appId) && (review.provenance === 'live_marketplace' || review.provenance === 'imported'));
  const reviewsById = new Map(reviews.map((review) => [review.id, review]));
  const themes = await domainStore.getThemes(actor);
  const relevantThemes = themes.flatMap((theme) => {
    const linkedReviews = (theme.supportingReviewIds || []).flatMap((id) => {
      const review = reviewsById.get(id);
      return review && appIds.has(review.appId) ? [review] : [];
    });
    if (linkedReviews.length < 2) return [];
    return [{
      ...theme,
      supportingReviewIds: [...new Set(linkedReviews.map((review) => review.id))],
      representativeQuotes: (theme.representativeQuotes || []).filter((quote) => linkedReviews.some((review) => review.text.includes(quote))),
      reviewCount: linkedReviews.length,
    }];
  });
  await heartbeatJob(job, 20);
  const opportunities = await generateOpportunitiesWithAI(relevantThemes, apps);
  await heartbeatJob(job, 80);
  const saved = await domainStore.saveOpportunities(actor, opportunities);
  return { count: saved.length, opportunityIds: saved.map((opportunity) => opportunity.id) };
}


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
        result = job.input.analysisKind === 'competitor_comparison'
          ? await runCompetitorAnalysis(job, actor)
          : await runAnalysis(job, actor);
        break;
      case 'forecast':
        result = await runForecast(job, actor);
        break;
      case 'opportunities':
        result = await runOpportunities(job, actor);
        break;
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
