import crypto from 'node:crypto';
import type { QueryResultRow } from 'pg';
import type {
  Application,
  AppDiscoveryFilter,
  AuditLog,
  Campaign,
  Contact,
  ComplaintTheme,
  Marketplace,
  Opportunity,
  PredictedWeakness,
  ResearchProject,
  Review,
  SuppressionRecord,
  SystemStats,
} from '../src/types.ts';
import { calculateOpportunityScore } from '../src/lib/scoring.ts';
import { generateReviewFingerprint } from '../src/lib/dedup.ts';
import { isEmailSuppressed } from '../src/lib/suppression.ts';
import { query, transaction, type DatabaseClient } from './db.ts';
import type { AuthenticatedWorkspace } from './auth.ts';

export type WorkspaceActor = AuthenticatedWorkspace;
export type ReviewFilters = {
  appId?: string;
  marketplace?: string;
  negativeOnly?: boolean;
  starRating?: number;
  category?: string;
  searchQuery?: string;
  featureRequestsOnly?: boolean;
  bugsOnly?: boolean;
  pricingOnly?: boolean;
  limit?: number;
  offset?: number;
};

export class WorkspaceRecordNotFound extends Error {
  constructor() {
    super('The requested workspace record was not found');
    this.name = 'WorkspaceRecordNotFound';
  }
}

const marketplaces = new Set<Marketplace>(['googleplay', 'steam', 'microsoft', 'apple']);
const campaignRecipientStatuses = new Set(['pending', 'approved']);
const suppressionReasons = new Set(['unsubscribed', 'manual_suppression', 'bounce', 'opt_out']);

function asPayload<T>(value: unknown): T {
  if (typeof value === 'string') return JSON.parse(value) as T;
  return value as T;
}

function safeText(value: unknown, maxLength = 2000): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function safeId(value: unknown): string {
  const id = safeText(value, 240);
  if (!id || /[\u0000-\u001f]/.test(id)) throw new Error('Invalid record identifier');
  return id;
}

function finiteNumber(value: unknown, min: number, max: number, fallback = 0): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function safeDate(value: unknown, fallback = new Date().toISOString()): string {
  if (typeof value !== 'string') return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function cleanApplication(input: Application): Application {
  if (!input || !marketplaces.has(input.marketplace)) throw new Error('Invalid application marketplace');
  return {
    id: safeId(input.id),
    name: safeText(input.name, 240) || 'Unnamed application',
    iconUrl: safeText(input.iconUrl, 2048) || undefined,
    publisher: safeText(input.publisher, 240) || 'Unknown publisher',
    marketplace: input.marketplace,
    description: safeText(input.description, 5000),
    category: safeText(input.category, 80) as Application['category'],
    rating: finiteNumber(input.rating, 0, 5),
    ratingCount: Math.round(finiteNumber(input.ratingCount, 0, 2_000_000_000)),
    reviewCount: Math.round(finiteNumber(input.reviewCount, 0, 2_000_000_000)),
    metadataStatus: input.metadataStatus === 'catalog_only' || input.metadataStatus === 'verified' ? input.metadataStatus : 'unknown',
    platform: safeText(input.platform, 120),
    releaseDate: safeText(input.releaseDate, 64),
    lastUpdated: safeText(input.lastUpdated, 64),
    currentVersion: safeText(input.currentVersion, 64),
    updateFrequency: ['Daily', 'Weekly', 'Bi-weekly', 'Monthly', 'Quarterly', 'Stale', 'Unknown'].includes(input.updateFrequency) ? input.updateFrequency : 'Unknown',
    storeUrl: safeText(input.storeUrl, 2048),
    collectionAvailable: Boolean(input.collectionAvailable),
    status: input.status === 'active' || input.status === 'indexing' ? input.status : 'error',
    tags: Array.isArray(input.tags) ? input.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 40).map((tag) => tag.slice(0, 80)) : [],
    hasBugMentions: Boolean(input.hasBugMentions),
    hasFeatureRequests: Boolean(input.hasFeatureRequests),
  };
}

function cleanReview(input: Review): Review {
  if (!input || !marketplaces.has(input.marketplace)) throw new Error('Invalid review marketplace');
  const appId = safeId(input.appId);
  const text = safeText(input.text, 20_000);
  const starRating = Math.round(finiteNumber(input.starRating, 1, 5));
  const reviewDate = safeDate(input.reviewDate, '');
  const fingerprint = safeText(input.fingerprint, 300) || generateReviewFingerprint(appId, text, starRating, reviewDate);
  return {
    id: safeId(input.id),
    provenance: input.provenance,
    sourceReviewId: safeText(input.sourceReviewId, 300) || undefined,
    appId,
    appName: safeText(input.appName, 240),
    marketplace: input.marketplace,
    text,
    starRating,
    ratingScale: input.ratingScale === 'binary_recommendation' ? 'binary_recommendation' : 'stars',
    reviewDate,
    language: safeText(input.language, 32) || 'und',
    reviewUrl: safeText(input.reviewUrl, 2048) || undefined,
    helpfulVotes: Math.round(finiteNumber(input.helpfulVotes, 0, 2_000_000_000)),
    appVersion: safeText(input.appVersion, 120) || undefined,
    collectedAt: safeDate(input.collectedAt),
    fingerprint,
    classification: input.classification,
    notes: safeText(input.notes, 2000) || undefined,
    savedToCollection: Boolean(input.savedToCollection),
    tagList: Array.isArray(input.tagList) ? input.tagList.filter((tag): tag is string => typeof tag === 'string').slice(0, 50).map((tag) => tag.slice(0, 100)) : [],
  };
}

function isPublicHttpsSource(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.hostname.endsWith('.invalid') && url.hostname !== 'localhost';
  } catch {
    return false;
  }
}

function cleanContact(input: Contact): Contact {
  const email = safeText(input.email, 254).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('A valid contact email is required');
  const name = safeText(input.name, 200);
  const company = safeText(input.company, 240);
  if (!name || !company) throw new Error('Contact name and company are required');
  const allowedStatuses = new Set<Contact['status']>(['New', 'Contacted', 'In Discussion', 'Converted', 'Do Not Contact']);
  const allowedChannels = new Set<Contact['channel']>(['email', 'linkedin', 'contact_form']);
  const allowedBasis = new Set<Contact['consentBasis']>(['Legitimate Interest (B2B)', 'Public Publisher Info', 'Inquiry Request', 'Unverified']);
  const consentBasis = allowedBasis.has(input.consentBasis) ? input.consentBasis : 'Unverified';
  const sourceUrl = safeText(input.sourceUrl, 2048);
  if (consentBasis !== 'Unverified' && !isPublicHttpsSource(sourceUrl)) {
    throw new Error('A public HTTPS source URL is required before recording a verified contact basis');
  }
  return {
    id: safeId(input.id),
    name,
    title: safeText(input.title, 200),
    company,
    email,
    phone: safeText(input.phone, 80) || undefined,
    website: safeText(input.website, 2048) || undefined,
    channel: allowedChannels.has(input.channel) ? input.channel : 'email',
    sourceUrl,
    appId: safeText(input.appId, 240) || undefined,
    appName: safeText(input.appName, 240) || undefined,
    opportunityId: safeText(input.opportunityId, 240) || undefined,
    status: allowedStatuses.has(input.status) ? input.status : 'New',
    consentBasis,
    notes: safeText(input.notes, 2000) || undefined,
    createdAt: safeDate(input.createdAt),
  };
}

function normalizeEmailOrDomain(value: unknown): string {
  const normalized = safeText(value, 254).toLowerCase().replace(/^@/, '');
  const isEmail = /^\S+@\S+\.\S+$/.test(normalized);
  const isDomain = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(normalized);
  if (!isEmail && !isDomain) throw new Error('Enter a valid email address or domain');
  return normalized;
}

function cleanOpportunity(input: Opportunity): Opportunity {
  if (!input || typeof input !== 'object') throw new Error('Opportunity data is required');
  const severities = new Set<Opportunity['severity']>(['Critical', 'High', 'Medium', 'Low']);
  const statuses = new Set<Opportunity['status']>(['validating', 'planned', 'draft', 'archived']);
  const scoreBreakdown = input.scoreBreakdown || { severityScore: 0, frequencyScore: 0, recencyScore: 0, breadthScore: 0 };
  return {
    id: safeId(input.id),
    title: safeText(input.title, 240),
    problemStatement: safeText(input.problemStatement, 5000),
    targetUser: safeText(input.targetUser, 1200),
    supportingAppIds: Array.isArray(input.supportingAppIds) ? [...new Set(input.supportingAppIds.map(safeId))].slice(0, 50) : [],
    supportingAppNames: Array.isArray(input.supportingAppNames) ? input.supportingAppNames.filter((value): value is string => typeof value === 'string').slice(0, 50).map((value) => value.slice(0, 240)) : [],
    supportingReviewIds: Array.isArray(input.supportingReviewIds) ? [...new Set(input.supportingReviewIds.map(safeId))].slice(0, 500) : [],
    supportingReviewQuotes: Array.isArray(input.supportingReviewQuotes) ? input.supportingReviewQuotes.filter((value): value is string => typeof value === 'string').slice(0, 20).map((value) => value.slice(0, 1000)) : [],
    complaintFrequency: Math.round(finiteNumber(input.complaintFrequency, 0, 1_000_000)),
    severity: severities.has(input.severity) ? input.severity : 'Medium',
    existingSolutions: safeText(input.existingSolutions, 3000),
    proposedConcept: safeText(input.proposedConcept, 3000),
    differentiationHypothesis: safeText(input.differentiationHypothesis, 3000),
    validationQuestions: Array.isArray(input.validationQuestions) ? input.validationQuestions.filter((value): value is string => typeof value === 'string').slice(0, 20).map((value) => value.slice(0, 500)) : [],
    nextSteps: Array.isArray(input.nextSteps) ? input.nextSteps.filter((value): value is string => typeof value === 'string').slice(0, 20).map((value) => value.slice(0, 500)) : [],
    priorityScore: finiteNumber(input.priorityScore, 0, 100),
    scoreBreakdown: {
      severityScore: finiteNumber(scoreBreakdown.severityScore, 0, 100),
      frequencyScore: finiteNumber(scoreBreakdown.frequencyScore, 0, 100),
      recencyScore: finiteNumber(scoreBreakdown.recencyScore, 0, 100),
      breadthScore: finiteNumber(scoreBreakdown.breadthScore, 0, 100),
    },
    tags: Array.isArray(input.tags) ? input.tags.filter((value): value is string => typeof value === 'string').slice(0, 40).map((value) => value.slice(0, 80)) : [],
    status: statuses.has(input.status) ? input.status : 'draft',
    provenance: input.provenance === 'seed' || input.provenance === 'ai' || input.provenance === 'calculated' ? input.provenance : 'calculated',
    createdAt: safeDate(input.createdAt),
  };
}

function cleanCampaign(input: Campaign): Campaign {
  if (!input || typeof input !== 'object') throw new Error('Campaign data is required');
  if (input.status === 'sending' || input.status === 'completed') throw new Error('Campaign delivery status can only be set by a real delivery adapter');
  if (!Array.isArray(input.recipients) || input.recipients.length > 500) throw new Error('Campaign recipient list exceeds the allowed size');
  const recipients = input.recipients.map((recipient) => {
    if (!campaignRecipientStatuses.has(recipient.status)) throw new Error('Only pending or explicitly approved recipients may be saved');
    const email = safeText(recipient.email, 254).toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('A valid campaign recipient email is required');
    return {
      contactId: safeId(recipient.contactId),
      email,
      company: safeText(recipient.company, 240),
      appName: safeText(recipient.appName, 240),
      personalizedSubject: safeText(recipient.personalizedSubject, 500),
      personalizedBody: safeText(recipient.personalizedBody, 10_000),
      status: recipient.status,
    };
  });
  if (new Set(recipients.map((recipient) => recipient.contactId)).size !== recipients.length) throw new Error('A contact may only appear once in a campaign');
  const objectives = new Set<Campaign['objective']>(['product_partnership', 'feature_pitch', 'advisory_discovery', 'dev_services']);
  const tones = new Set<Campaign['tone']>(['Consultative', 'Founder-to-Founder', 'Value-First', 'Technical']);
  const approved = recipients.filter((recipient) => recipient.status === 'approved').length;
  return {
    id: safeId(input.id),
    name: safeText(input.name, 240) || 'Untitled campaign',
    objective: objectives.has(input.objective) ? input.objective : 'product_partnership',
    tone: tones.has(input.tone) ? input.tone : 'Consultative',
    targetCategory: safeText(input.targetCategory, 120),
    templateSubject: safeText(input.templateSubject, 500),
    templateBody: safeText(input.templateBody, 10_000),
    recipients,
    status: input.status === 'approved' ? 'approved' : 'draft',
    stats: { total: recipients.length, approved, sent: 0, delivered: 0, opened: 0, replied: 0, bounced: 0, unsubscribed: 0, suppressed: 0 },
    createdAt: safeDate(input.createdAt),
  };
}

async function audit(
  client: DatabaseClient,
  actor: WorkspaceActor,
  action: string,
  entityType: string,
  entityId: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  await client.query(
    `INSERT INTO audit_events(id,workspace_id,user_id,action,entity_type,entity_id,details)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [`audit_${crypto.randomUUID()}`, actor.workspaceId, actor.userId, action.slice(0, 80), entityType.slice(0, 80), entityId.slice(0, 240), JSON.stringify(details)],
  );
}

async function assertIdsInWorkspace(
  client: DatabaseClient,
  table: 'applications' | 'reviews' | 'complaint_themes' | 'opportunities',
  workspaceId: string,
  ids: string[],
): Promise<void> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (!uniqueIds.length) return;
  const rows = await client.query<{ id: string }>(`SELECT id FROM ${table} WHERE workspace_id = $1 AND id = ANY($2::text[])`, [workspaceId, uniqueIds]);
  if (rows.rows.length !== uniqueIds.length) throw new WorkspaceRecordNotFound();
}

async function replaceRelation(
  client: DatabaseClient,
  table: 'theme_applications' | 'theme_reviews' | 'forecast_applications' | 'forecast_reviews' | 'opportunity_applications' | 'opportunity_reviews' | 'research_project_applications' | 'research_project_reviews' | 'research_project_themes' | 'research_project_opportunities',
  workspaceId: string,
  ownerColumn: 'theme_id' | 'forecast_id' | 'opportunity_id' | 'project_id',
  ownerId: string,
  targetColumn: 'application_id' | 'review_id' | 'theme_id' | 'opportunity_id',
  targetIds: string[],
): Promise<void> {
  await client.query(`DELETE FROM ${table} WHERE workspace_id = $1 AND ${ownerColumn} = $2`, [workspaceId, ownerId]);
  for (const targetId of [...new Set(targetIds.filter(Boolean))]) {
    await client.query(
      `INSERT INTO ${table}(workspace_id,${ownerColumn},${targetColumn}) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [workspaceId, ownerId, targetId],
    );
  }
}

export class WorkspaceDomainStore {
  async getStats(actor: WorkspaceActor): Promise<SystemStats> {
    const [counts, complaints, marketplacesBreakdown] = await Promise.all([
      query<{
        total_apps: string;
        total_reviews: string;
        negative_reviews: string;
        total_themes: string;
        total_opportunities: string;
        total_contacts: string;
        active_campaigns: string;
        suppression_count: string;
        live_reviews: string;
      }>(
        `SELECT
          (SELECT COUNT(*) FROM applications WHERE workspace_id=$1) AS total_apps,
          (SELECT COUNT(*) FROM reviews WHERE workspace_id=$1) AS total_reviews,
          (SELECT COUNT(*) FROM reviews WHERE workspace_id=$1 AND rating <= 2) AS negative_reviews,
          (SELECT COUNT(*) FROM complaint_themes WHERE workspace_id=$1) AS total_themes,
          (SELECT COUNT(*) FROM opportunities WHERE workspace_id=$1) AS total_opportunities,
          (SELECT COUNT(*) FROM contacts WHERE workspace_id=$1) AS total_contacts,
          (SELECT COUNT(*) FROM campaigns WHERE workspace_id=$1 AND status <> 'completed') AS active_campaigns,
          (SELECT COUNT(*) FROM suppression_records WHERE workspace_id=$1) AS suppression_count,
          (SELECT COUNT(*) FROM reviews WHERE workspace_id=$1 AND provenance IN ('live','live_marketplace')) AS live_reviews`,
        [actor.workspaceId],
      ),
      query<{ category: string; count: string }>(
        `SELECT COALESCE(payload->'classification'->>'category','Other') AS category, COUNT(*) AS count
         FROM reviews WHERE workspace_id=$1 GROUP BY 1 ORDER BY COUNT(*) DESC`,
        [actor.workspaceId],
      ),
      query<{ marketplace: Marketplace; count: string }>(
        'SELECT marketplace, COUNT(*) AS count FROM applications WHERE workspace_id=$1 GROUP BY marketplace ORDER BY marketplace',
        [actor.workspaceId],
      ),
    ]);
    const row = counts[0];
    const totalReviews = Number(row?.total_reviews || 0);
    return {
      totalApps: Number(row?.total_apps || 0),
      totalReviews,
      negativeReviews: Number(row?.negative_reviews || 0),
      totalThemes: Number(row?.total_themes || 0),
      totalOpportunities: Number(row?.total_opportunities || 0),
      totalContacts: Number(row?.total_contacts || 0),
      activeCampaigns: Number(row?.active_campaigns || 0),
      suppressionCount: Number(row?.suppression_count || 0),
      complaintBreakdown: complaints.map((item) => ({ category: item.category, count: Number(item.count) })),
      marketplacesBreakdown: marketplacesBreakdown.map((item) => ({ marketplace: item.marketplace, count: Number(item.count) })),
      liveReviewCount: Number(row?.live_reviews || 0),
      demonstrationReviewCount: totalReviews - Number(row?.live_reviews || 0),
    };
  }

  async getApps(actor: WorkspaceActor, filter?: AppDiscoveryFilter): Promise<Application[]> {
    const rows = await query<{ payload: unknown }>('SELECT payload FROM applications WHERE workspace_id=$1 ORDER BY first_seen_at DESC, id', [actor.workspaceId]);
    const apps = rows.map((row) => asPayload<Application>(row.payload));
    const q = filter?.query?.trim().toLowerCase();
    return apps.filter((app) => {
      if (q && ![app.name, app.publisher, app.description, ...(app.tags || [])].some((value) => value.toLowerCase().includes(q))) return false;
      if (filter?.category && filter.category !== 'all' && app.category !== filter.category) return false;
      if (filter?.marketplace && filter.marketplace !== 'all' && app.marketplace !== filter.marketplace) return false;
      if (filter?.minRating !== undefined && app.rating < filter.minRating) return false;
      if (filter?.maxRating !== undefined && app.rating > filter.maxRating) return false;
      if (filter?.updateFrequency && filter.updateFrequency !== 'all' && app.updateFrequency !== filter.updateFrequency) return false;
      if (filter?.hasBugMentions && !app.hasBugMentions) return false;
      if (filter?.hasFeatureRequests && !app.hasFeatureRequests) return false;
      return true;
    });
  }

  async getAppById(actor: WorkspaceActor, id: string): Promise<Application | undefined> {
    const rows = await query<{ payload: unknown }>(
      'SELECT payload FROM applications WHERE workspace_id=$1 AND id=$2 LIMIT 1',
      [actor.workspaceId, id],
    );
    return rows[0] ? asPayload<Application>(rows[0].payload) : undefined;
  }

  async saveApps(actor: WorkspaceActor, inputs: Application[], provenance: 'live' | 'imported' = 'live'): Promise<Application[]> {
    if (!Array.isArray(inputs) || inputs.length > 100) throw new Error('Application batch exceeds the allowed size');
    const apps = inputs.map(cleanApplication);
    await transaction(async (client) => {
      for (const app of apps) {
        await client.query(
          `INSERT INTO applications(id,workspace_id,marketplace,source_id,name,publisher,source_url,provenance,metadata,payload)
           VALUES ($1,$2,$3,$1,$4,$5,$6,$7,$8::jsonb,$9::jsonb)
           ON CONFLICT (workspace_id,id) DO UPDATE SET
             marketplace=EXCLUDED.marketplace, source_id=EXCLUDED.source_id, name=EXCLUDED.name,
             publisher=EXCLUDED.publisher, source_url=EXCLUDED.source_url, provenance=EXCLUDED.provenance,
             metadata=EXCLUDED.metadata || jsonb_build_object('collectionCursors',COALESCE(applications.metadata->'collectionCursors','{}'::jsonb)),
             payload=EXCLUDED.payload`,
          [app.id, actor.workspaceId, app.marketplace, app.name, app.publisher, app.storeUrl || null, provenance, JSON.stringify({ tags: app.tags }), JSON.stringify(app)],
        );
      }
      if (apps.length) await audit(client, actor, 'UPSERT', 'Application', 'batch', { count: apps.length, provenance });
    });
    return apps;
  }

  async saveApp(actor: WorkspaceActor, app: Application): Promise<Application> {
    const [saved] = await this.saveApps(actor, [app]);
    return saved;
  }

  async getReviews(actor: WorkspaceActor, filter: ReviewFilters = {}): Promise<{ reviews: Review[]; total: number }> {
    const rows = await query<{ payload: unknown }>(
      'SELECT payload FROM reviews WHERE workspace_id=$1 ORDER BY review_date DESC NULLS LAST, id DESC LIMIT 25000',
      [actor.workspaceId],
    );
    let reviews = rows.map((row) => asPayload<Review>(row.payload));
    if (filter.appId && filter.appId !== 'all') reviews = reviews.filter((review) => review.appId === filter.appId);
    if (filter.marketplace && filter.marketplace !== 'all') reviews = reviews.filter((review) => review.marketplace === filter.marketplace);
    if (filter.negativeOnly) reviews = reviews.filter((review) => review.starRating <= 2);
    if (filter.starRating) reviews = reviews.filter((review) => review.starRating === filter.starRating);
    if (filter.category && filter.category !== 'all') reviews = reviews.filter((review) => review.classification?.category === filter.category);
    if (filter.featureRequestsOnly) reviews = reviews.filter((review) => review.classification?.isFeatureRequest === true);
    if (filter.bugsOnly) reviews = reviews.filter((review) => review.classification?.isBug === true);
    if (filter.pricingOnly) reviews = reviews.filter((review) => review.classification?.isPricingIssue === true);
    const search = filter.searchQuery?.trim().toLowerCase();
    if (search) reviews = reviews.filter((review) => review.text.toLowerCase().includes(search) || review.appName.toLowerCase().includes(search) || (review.classification?.keywords || []).some((keyword) => keyword.toLowerCase().includes(search)));
    const total = reviews.length;
    const offset = Math.max(0, Math.min(20_000, Math.trunc(filter.offset || 0)));
    const limit = Math.max(1, Math.min(25_000, Math.trunc(filter.limit || 50)));
    return { reviews: reviews.slice(offset, offset + limit), total };
  }

  async getAllReviews(actor: WorkspaceActor, filter: ReviewFilters = {}): Promise<Review[]> {
    const result = await this.getReviews(actor, { ...filter, limit: Math.max(1, Math.min(25_000, Math.trunc(filter.limit || 25_000))), offset: 0 });
    return result.reviews;
  }

  private async saveReviewsOnClient(
    client: DatabaseClient,
    actor: WorkspaceActor,
    reviews: Review[],
    provenance: 'live' | 'imported',
  ): Promise<{ inserted: number; duplicates: number }> {
    const appIds = [...new Set(reviews.map((review) => review.appId))];
    await assertIdsInWorkspace(client, 'applications', actor.workspaceId, appIds);
    let inserted = 0;
    for (const review of reviews) {
      if (review.provenance === 'ai_generated' || review.provenance === 'calculated') throw new Error('Generated review records cannot be persisted as source evidence');
      const storedProvenance = review.provenance === 'seed' ? 'seed' : review.provenance === 'imported' ? 'imported' : provenance;
      const result = await client.query(
        `INSERT INTO reviews(id,workspace_id,application_id,marketplace,source_id,source_url,body,rating,review_date,collected_at,provenance,fingerprint,metadata,payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb)
         ON CONFLICT DO NOTHING RETURNING id`,
        [review.id, actor.workspaceId, review.appId, review.marketplace, review.sourceReviewId || review.id, review.reviewUrl || null, review.text, review.starRating, review.reviewDate || null, review.collectedAt, storedProvenance, review.fingerprint, JSON.stringify({ classification: review.classification || null, ratingScale: review.ratingScale }), JSON.stringify({ ...review, provenance: storedProvenance === 'live' ? 'live_marketplace' : storedProvenance })],
      );
      inserted += result.rowCount || 0;
    }
    if (inserted) await audit(client, actor, 'COLLECT_REVIEWS', 'Review', 'batch', { inserted, received: reviews.length });
    return { inserted, duplicates: reviews.length - inserted };
  }

  async saveReviews(actor: WorkspaceActor, inputs: Review[], provenance: 'live' | 'imported' = 'live'): Promise<{ inserted: number; duplicates: number }> {
    if (!Array.isArray(inputs) || inputs.length > 1000) throw new Error('Review batch exceeds the allowed size');
    const reviews = inputs.map(cleanReview);
    return transaction((client) => this.saveReviewsOnClient(client, actor, reviews, provenance));
  }

  async getCollectionCursor(actor: WorkspaceActor, appId: string, negativeOnly: boolean): Promise<string | undefined> {
    const rows = await query<{ metadata: unknown }>(
      'SELECT metadata FROM applications WHERE workspace_id=$1 AND id=$2 LIMIT 1',
      [actor.workspaceId, safeId(appId)],
    );
    if (!rows[0]) throw new WorkspaceRecordNotFound();
    const metadata = asPayload<Record<string, unknown>>(rows[0].metadata);
    const cursors = metadata?.collectionCursors;
    if (!cursors || typeof cursors !== 'object') return undefined;
    const cursor = (cursors as Record<string, unknown>)[negativeOnly ? 'negative' : 'all'];
    return typeof cursor === 'string' && cursor.length <= 2_000 ? cursor : undefined;
  }

  async saveCollectedReviews(
    actor: WorkspaceActor,
    appId: string,
    inputs: Review[],
    nextCursor?: string,
    negativeOnly = false,
  ): Promise<{ inserted: number; duplicates: number }> {
    if (!Array.isArray(inputs) || inputs.length > 1000) throw new Error('Review batch exceeds the allowed size');
    const reviews = inputs.map(cleanReview);
    return transaction(async (client) => {
      const saved = await this.saveReviewsOnClient(client, actor, reviews, 'live');
      const cursorKey = negativeOnly ? 'negative' : 'all';
      const application = await client.query<{ id: string }>(
        `UPDATE applications
         SET last_collected_at=NOW(),
             metadata=COALESCE(metadata,'{}'::jsonb) || jsonb_build_object(
               'collectionCursors',COALESCE(metadata->'collectionCursors','{}'::jsonb) || jsonb_build_object($3,$4)
             )
         WHERE workspace_id=$1 AND id=$2 RETURNING id`,
        [actor.workspaceId, safeId(appId), cursorKey, nextCursor || null],
      );
      if (!application.rows[0]) throw new WorkspaceRecordNotFound();
      await audit(client, actor, 'COLLECTION_COMPLETED', 'Application', appId, { inserted: saved.inserted, duplicates: saved.duplicates, hasMore: Boolean(nextCursor) });
      return saved;
    });
  }
  async updateReview(actor: WorkspaceActor, id: string, updates: Pick<Review, 'notes' | 'savedToCollection' | 'tagList'>): Promise<Review> {
    const normalized = {
      notes: safeText(updates.notes, 2000) || undefined,
      savedToCollection: Boolean(updates.savedToCollection),
      tagList: Array.isArray(updates.tagList) ? updates.tagList.filter((item): item is string => typeof item === 'string').slice(0, 50).map((item) => item.slice(0, 100)) : [],
    };
    return transaction(async (client) => {
      const result = await client.query<{ payload: unknown }>(
        `UPDATE reviews SET payload = payload || $3::jsonb
         WHERE workspace_id=$1 AND id=$2 RETURNING payload`,
        [actor.workspaceId, id, JSON.stringify(normalized)],
      );
      if (!result.rows[0]) throw new WorkspaceRecordNotFound();
      await audit(client, actor, 'UPDATE', 'Review', id, { changedFields: Object.keys(normalized) });
      return asPayload<Review>(result.rows[0].payload);
    });
  }

  async markAppCollected(actor: WorkspaceActor, appId: string): Promise<void> {
    const result = await query<{ id: string }>('UPDATE applications SET last_collected_at=NOW() WHERE workspace_id=$1 AND id=$2 RETURNING id', [actor.workspaceId, appId]);
    if (!result.length) throw new WorkspaceRecordNotFound();
  }

  async getThemes(actor: WorkspaceActor): Promise<ComplaintTheme[]> {
    const rows = await query<{ payload: unknown }>('SELECT payload FROM complaint_themes WHERE workspace_id=$1 ORDER BY created_at DESC, id', [actor.workspaceId]);
    return rows.map((row) => asPayload<ComplaintTheme>(row.payload));
  }

  async saveThemes(actor: WorkspaceActor, themes: ComplaintTheme[]): Promise<void> {
    if (themes.length > 250) throw new Error('Theme batch exceeds the allowed size');
    await transaction(async (client) => {
      for (const theme of themes) {
        const payload = { ...theme, affectedApps: [...new Set(theme.affectedApps || [])], supportingReviewIds: [...new Set(theme.supportingReviewIds || [])] };
        const id = safeId(theme.id);
        await assertIdsInWorkspace(client, 'applications', actor.workspaceId, payload.affectedApps);
        await assertIdsInWorkspace(client, 'reviews', actor.workspaceId, payload.supportingReviewIds);
        await client.query(
          `INSERT INTO complaint_themes(workspace_id,id,payload)
           VALUES ($1,$2,$3::jsonb)
           ON CONFLICT (workspace_id,id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=NOW()`,
          [actor.workspaceId, id, JSON.stringify(payload)],
        );
        await replaceRelation(client, 'theme_applications', actor.workspaceId, 'theme_id', id, 'application_id', payload.affectedApps);
        await replaceRelation(client, 'theme_reviews', actor.workspaceId, 'theme_id', id, 'review_id', payload.supportingReviewIds);
      }
      if (themes.length) await audit(client, actor, 'AI_ANALYSIS', 'ComplaintTheme', 'batch', { count: themes.length });
    });
  }

  async getForecasts(actor: WorkspaceActor): Promise<PredictedWeakness[]> {
    const rows = await query<{ payload: unknown }>('SELECT payload FROM predicted_weaknesses WHERE workspace_id=$1 ORDER BY score DESC, created_at DESC', [actor.workspaceId]);
    return rows.map((row) => asPayload<PredictedWeakness>(row.payload));
  }

  async saveForecasts(actor: WorkspaceActor, forecasts: PredictedWeakness[]): Promise<void> {
    if (forecasts.length > 100) throw new Error('Forecast batch exceeds the allowed size');
    await transaction(async (client) => {
      for (const forecast of forecasts) await this.saveForecastOnClient(client, actor, forecast);
      if (forecasts.length) await audit(client, actor, 'ANALYSIS', 'PredictedWeakness', 'batch', { count: forecasts.length });
    });
  }

  private async saveForecastOnClient(client: DatabaseClient, actor: WorkspaceActor, forecast: PredictedWeakness): Promise<PredictedWeakness> {
    const id = safeId(forecast.id);
    const appIds = [...new Set(forecast.competitorAppIds || [])];
    const reviewIds = [...new Set(forecast.supportingReviewIds || [])];
    await assertIdsInWorkspace(client, 'applications', actor.workspaceId, appIds);
    await assertIdsInWorkspace(client, 'reviews', actor.workspaceId, reviewIds);
    const payload = { ...forecast, competitorAppIds: appIds, supportingReviewIds: reviewIds, evidenceReviewQuotes: (forecast.evidenceReviewQuotes || []).filter((quote): quote is string => typeof quote === 'string').slice(0, 30) };
    await client.query(
      `INSERT INTO predicted_weaknesses(workspace_id,id,score,payload)
       VALUES ($1,$2,$3,$4::jsonb)
       ON CONFLICT (workspace_id,id) DO UPDATE SET score=EXCLUDED.score,payload=EXCLUDED.payload,updated_at=NOW()`,
      [actor.workspaceId, id, finiteNumber(forecast.futureOpportunityScore, 0, 100), JSON.stringify(payload)],
    );
    await replaceRelation(client, 'forecast_applications', actor.workspaceId, 'forecast_id', id, 'application_id', appIds);
    await replaceRelation(client, 'forecast_reviews', actor.workspaceId, 'forecast_id', id, 'review_id', reviewIds);
    return payload;
  }

  async saveForecast(actor: WorkspaceActor, forecast: PredictedWeakness): Promise<PredictedWeakness> {
    return transaction(async (client) => {
      const saved = await this.saveForecastOnClient(client, actor, forecast);
      await audit(client, actor, 'UPSERT', 'PredictedWeakness', saved.id, { status: saved.status });
      return saved;
    });
  }

  async promoteForecastToOpportunity(actor: WorkspaceActor, id: string): Promise<Opportunity | undefined> {
    return transaction(async (client) => {
      const rows = await client.query<{ payload: unknown }>('SELECT payload FROM predicted_weaknesses WHERE workspace_id=$1 AND id=$2 FOR UPDATE', [actor.workspaceId, id]);
      if (!rows.rows[0]) return undefined;
      const forecast = asPayload<PredictedWeakness>(rows.rows[0].payload);
      forecast.status = 'promoted_to_opportunity';
      await client.query('UPDATE predicted_weaknesses SET payload=$3::jsonb,updated_at=NOW() WHERE workspace_id=$1 AND id=$2', [actor.workspaceId, id, JSON.stringify(forecast)]);
      const oppId = `opp_f_${forecast.id}`;
      const scoreBreakdown = {
        severityScore: forecast.scoreBreakdown.severityImpactScore,
        frequencyScore: forecast.scoreBreakdown.trendVelocityScore,
        recencyScore: forecast.scoreBreakdown.incumbentInertiaScore,
        breadthScore: forecast.scoreBreakdown.evidenceBreadthScore,
      };
      const opportunity: Opportunity = {
        id: oppId,
        title: `Counter-Competitor: ${forecast.weaknessTitle}`,
        problemStatement: `${forecast.rootCauseTrend} — ${forecast.marketGapSummary}`,
        targetUser: `Users evaluating ${forecast.competitorAppNames.join(' and ')} based on the collected evidence.`,
        supportingAppIds: forecast.competitorAppIds,
        supportingAppNames: forecast.competitorAppNames,
        supportingReviewIds: forecast.supportingReviewIds || [],
        supportingReviewQuotes: forecast.evidenceReviewQuotes || [],
        complaintFrequency: (forecast.supportingReviewIds || []).length,
        severity: forecast.scoreBreakdown.severityImpactScore >= 80 ? 'Critical' : 'High',
        existingSolutions: `${forecast.competitorAppNames.join(', ')} have the reported weakness: ${forecast.weaknessTitle}.`,
        proposedConcept: forecast.suggestedWedgeFeature,
        differentiationHypothesis: `Validate whether the collected evidence supports addressing ${forecast.weaknessTitle}.`,
        validationQuestions: [`How often does ${forecast.weaknessTitle.toLowerCase()} affect your workflow?`, 'What alternative do you use today?', 'What evidence would make you consider switching?'],
        nextSteps: forecast.validationMilestones,
        priorityScore: forecast.futureOpportunityScore,
        scoreBreakdown,
        tags: [forecast.category, 'Forecast-derived'],
        status: 'validating',
        createdAt: new Date().toISOString(),
      };
      const saved = await this.saveOpportunityOnClient(client, actor, opportunity);
      await audit(client, actor, 'PROMOTE_FORECAST', 'Opportunity', saved.id, { forecastId: id });
      return saved;
    });
  }

  async getOpportunities(actor: WorkspaceActor): Promise<Opportunity[]> {
    const rows = await query<{ payload: unknown }>('SELECT payload FROM opportunities WHERE workspace_id=$1 ORDER BY score DESC NULLS LAST, created_at DESC', [actor.workspaceId]);
    return rows.map((row) => asPayload<Opportunity>(row.payload));
  }

  async getOpportunity(actor: WorkspaceActor, id: string): Promise<Opportunity | undefined> {
    const rows = await query<{ payload: unknown }>('SELECT payload FROM opportunities WHERE workspace_id=$1 AND id=$2 LIMIT 1', [actor.workspaceId, id]);
    return rows[0] ? asPayload<Opportunity>(rows[0].payload) : undefined;
  }

  private async saveOpportunityOnClient(client: DatabaseClient, actor: WorkspaceActor, input: Opportunity): Promise<Opportunity> {
    const opportunity = cleanOpportunity(input);
    await assertIdsInWorkspace(client, 'applications', actor.workspaceId, opportunity.supportingAppIds);
    const reviewEvidence = opportunity.supportingReviewIds.length
      ? await client.query<{ id: string; application_id: string; text: string; review_date: string | null }>(
          'SELECT id,application_id,body AS text,review_date::text AS review_date FROM reviews WHERE workspace_id=$1 AND id=ANY($2::text[])',
          [actor.workspaceId, opportunity.supportingReviewIds],
        )
      : { rows: [] as { id: string; application_id: string; text: string; review_date: string | null }[] };
    if (reviewEvidence.rows.length !== opportunity.supportingReviewIds.length) throw new WorkspaceRecordNotFound();

    const evidenceAppIds = [...new Set(reviewEvidence.rows.map((review) => review.application_id))];
    if (opportunity.supportingAppIds.some((appId) => !evidenceAppIds.includes(appId))) throw new WorkspaceRecordNotFound();
    const appIds = evidenceAppIds.length ? evidenceAppIds : opportunity.supportingAppIds;
    const appRows = appIds.length
      ? await client.query<{ id: string; name: string }>('SELECT id,name FROM applications WHERE workspace_id=$1 AND id=ANY($2::text[])', [actor.workspaceId, appIds])
      : { rows: [] as { id: string; name: string }[] };
    if (appRows.rows.length !== appIds.length) throw new WorkspaceRecordNotFound();

    opportunity.supportingAppIds = appRows.rows.map((app) => app.id);
    opportunity.supportingAppNames = appRows.rows.map((app) => app.name);
    opportunity.supportingReviewQuotes = [...new Set((opportunity.supportingReviewQuotes || []).filter((quote) => reviewEvidence.rows.some((review) => review.text.includes(quote))))].slice(0, 20);
    if (reviewEvidence.rows.length && !opportunity.supportingReviewQuotes.length) {
      opportunity.supportingReviewQuotes = reviewEvidence.rows.slice(0, 10).map((review) => review.text.slice(0, 240));
    }
    opportunity.complaintFrequency = reviewEvidence.rows.length;
    if (!reviewEvidence.rows.length) opportunity.status = 'draft';

    const latestReviewDate = reviewEvidence.rows.map((review) => review.review_date).filter((date): date is string => Boolean(date)).sort().at(-1);
    const score = reviewEvidence.rows.length
      ? calculateOpportunityScore({ severity: opportunity.severity, complaintFrequency: opportunity.complaintFrequency, latestReviewDate, affectedAppCount: opportunity.supportingAppIds.length })
      : { score: 0, breakdown: { severityScore: 0, frequencyScore: 0, recencyScore: 0, breadthScore: 0 } };
    opportunity.priorityScore = score.score;
    opportunity.scoreBreakdown = score.breakdown;
    await client.query(
      `INSERT INTO opportunities(id,workspace_id,title,problem_statement,provenance,score,evidence,payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)
       ON CONFLICT (workspace_id,id) DO UPDATE SET title=EXCLUDED.title,problem_statement=EXCLUDED.problem_statement,
         provenance=EXCLUDED.provenance,score=EXCLUDED.score,evidence=EXCLUDED.evidence,payload=EXCLUDED.payload`,
      [opportunity.id, actor.workspaceId, safeText(opportunity.title, 240) || 'Untitled opportunity', safeText(opportunity.problemStatement, 5000), opportunity.provenance || 'calculated', opportunity.priorityScore, JSON.stringify(opportunity.supportingReviewIds), JSON.stringify(opportunity)],
    );
    await replaceRelation(client, 'opportunity_applications', actor.workspaceId, 'opportunity_id', opportunity.id, 'application_id', opportunity.supportingAppIds);
    await replaceRelation(client, 'opportunity_reviews', actor.workspaceId, 'opportunity_id', opportunity.id, 'review_id', opportunity.supportingReviewIds);
    return opportunity;
  }

  async saveOpportunity(actor: WorkspaceActor, input: Opportunity): Promise<Opportunity> {
    const [opportunity] = await this.saveOpportunities(actor, [input]);
    return opportunity;
  }

  async saveOpportunities(actor: WorkspaceActor, inputs: Opportunity[]): Promise<Opportunity[]> {
    if (!Array.isArray(inputs) || inputs.length > 100) throw new Error('Opportunity batch exceeds the allowed size');
    return transaction(async (client) => {
      const saved: Opportunity[] = [];
      for (const input of inputs) saved.push(await this.saveOpportunityOnClient(client, actor, input));
      if (saved.length) await audit(client, actor, 'UPSERT', 'Opportunity', 'batch', { count: saved.length });
      return saved;
    });
  }

  async deleteOpportunity(actor: WorkspaceActor, id: string): Promise<boolean> {
    return transaction(async (client) => {
      const result = await client.query('DELETE FROM opportunities WHERE workspace_id=$1 AND id=$2', [actor.workspaceId, id]);
      if (!result.rowCount) return false;
      await audit(client, actor, 'DELETE', 'Opportunity', id);
      return true;
    });
  }

  async getContacts(actor: WorkspaceActor): Promise<Contact[]> {
    const rows = await query<{ payload: unknown }>('SELECT payload FROM contacts WHERE workspace_id=$1 ORDER BY created_at DESC, id', [actor.workspaceId]);
    return rows.map((row) => asPayload<Contact>(row.payload));
  }

  async getContact(actor: WorkspaceActor, id: string): Promise<Contact | undefined> {
    const rows = await query<{ payload: unknown }>('SELECT payload FROM contacts WHERE workspace_id=$1 AND id=$2 LIMIT 1', [actor.workspaceId, id]);
    return rows[0] ? asPayload<Contact>(rows[0].payload) : undefined;
  }

  private async saveContactOnClient(client: DatabaseClient, actor: WorkspaceActor, input: Contact): Promise<Contact> {
    const contact = cleanContact(input);
    if (contact.appId) await assertIdsInWorkspace(client, 'applications', actor.workspaceId, [contact.appId]);
    if (contact.opportunityId) await assertIdsInWorkspace(client, 'opportunities', actor.workspaceId, [contact.opportunityId]);
    await client.query(
      `INSERT INTO contacts(workspace_id,id,email,application_id,opportunity_id,payload,created_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
       ON CONFLICT (workspace_id,id) DO UPDATE SET email=EXCLUDED.email,application_id=EXCLUDED.application_id,
         opportunity_id=EXCLUDED.opportunity_id,payload=EXCLUDED.payload,updated_at=NOW()`,
      [actor.workspaceId, contact.id, contact.email, contact.appId || null, contact.opportunityId || null, JSON.stringify(contact), contact.createdAt],
    );
    return contact;
  }

  async saveContact(actor: WorkspaceActor, input: Contact): Promise<Contact> {
    return transaction(async (client) => {
      const contact = await this.saveContactOnClient(client, actor, input);
      await audit(client, actor, 'UPSERT', 'Contact', contact.id, { status: contact.status });
      return contact;
    });
  }

  async saveContacts(actor: WorkspaceActor, inputs: Contact[]): Promise<Contact[]> {
    if (inputs.length > 500) throw new Error('Contact import exceeds the allowed size');
    return transaction(async (client) => {
      const saved: Contact[] = [];
      for (const input of inputs) saved.push(await this.saveContactOnClient(client, actor, input));
      if (saved.length) await audit(client, actor, 'IMPORT', 'Contact', 'batch', { count: saved.length });
      return saved;
    });
  }

  async deleteContact(actor: WorkspaceActor, id: string): Promise<boolean> {
    return transaction(async (client) => {
      const result = await client.query('DELETE FROM contacts WHERE workspace_id=$1 AND id=$2', [actor.workspaceId, id]);
      if (!result.rowCount) return false;
      await audit(client, actor, 'DELETE', 'Contact', id);
      return true;
    });
  }

  async getSuppressionList(actor: WorkspaceActor): Promise<SuppressionRecord[]> {
    const rows = await query<{ payload: unknown }>('SELECT payload FROM suppression_records WHERE workspace_id=$1 ORDER BY created_at DESC', [actor.workspaceId]);
    return rows.map((row) => asPayload<SuppressionRecord>(row.payload));
  }

  async addSuppression(actor: WorkspaceActor, value: unknown, reason: SuppressionRecord['reason']): Promise<SuppressionRecord> {
    if (!suppressionReasons.has(reason)) throw new Error('Invalid suppression reason');
    const normalized = normalizeEmailOrDomain(value);
    return transaction(async (client) => {
      const record: SuppressionRecord = { id: `sup_${crypto.randomUUID()}`, emailOrDomain: normalized, reason, createdAt: new Date().toISOString() };
      const result = await client.query<{ payload: unknown }>(
        `INSERT INTO suppression_records(workspace_id,id,normalized_value,reason,payload)
         VALUES ($1,$2,$3,$4,$5::jsonb)
         ON CONFLICT (workspace_id,normalized_value) DO UPDATE SET reason=EXCLUDED.reason,
           payload=suppression_records.payload || jsonb_build_object('reason',EXCLUDED.reason)
         RETURNING payload`,
        [actor.workspaceId, record.id, normalized, reason, JSON.stringify(record)],
      );
      const saved = asPayload<SuppressionRecord>(result.rows[0].payload);
      await audit(client, actor, 'UPSERT', 'SuppressionRecord', saved.id, { reason });
      return saved;
    });
  }

  async removeSuppression(actor: WorkspaceActor, id: string): Promise<boolean> {
    return transaction(async (client) => {
      const result = await client.query('DELETE FROM suppression_records WHERE workspace_id=$1 AND id=$2', [actor.workspaceId, id]);
      if (!result.rowCount) return false;
      await audit(client, actor, 'DELETE', 'SuppressionRecord', id);
      return true;
    });
  }

  async getCampaigns(actor: WorkspaceActor): Promise<Campaign[]> {
    const rows = await query<{ payload: unknown }>('SELECT payload FROM campaigns WHERE workspace_id=$1 ORDER BY created_at DESC, id', [actor.workspaceId]);
    return rows.map((row) => asPayload<Campaign>(row.payload));
  }

  async getCampaign(actor: WorkspaceActor, id: string): Promise<Campaign | undefined> {
    const rows = await query<{ payload: unknown }>('SELECT payload FROM campaigns WHERE workspace_id=$1 AND id=$2 LIMIT 1', [actor.workspaceId, id]);
    return rows[0] ? asPayload<Campaign>(rows[0].payload) : undefined;
  }

  async saveCampaign(actor: WorkspaceActor, input: Campaign, humanApproved = false): Promise<Campaign> {
    const campaign = cleanCampaign(input);
    if (campaign.status === 'approved' && !humanApproved) throw new Error('Explicit human approval is required before approving a campaign');
    if (campaign.status === 'approved') {
      campaign.approvedBy = actor.userId;
      campaign.approvedAt = new Date().toISOString();
    }
    return transaction(async (client) => {
      const contactIds = campaign.recipients.map((recipient) => recipient.contactId);
      if (contactIds.length) {
        const contacts = await client.query<{ id: string; email: string; payload: unknown }>(
          'SELECT id,email,payload FROM contacts WHERE workspace_id=$1 AND id=ANY($2::text[])',
          [actor.workspaceId, contactIds],
        );
        if (contacts.rows.length !== new Set(contactIds).size) throw new WorkspaceRecordNotFound();
        const contactById = new Map(contacts.rows.map((row) => [row.id, { email: row.email.toLowerCase(), contact: asPayload<Contact>(row.payload) }]));
        if (campaign.recipients.some((recipient) => contactById.get(recipient.contactId)?.email !== recipient.email)) {
          throw new Error('Campaign recipient email must match its workspace contact');
        }
        if (campaign.status === 'approved' && campaign.recipients.some((recipient) => {
          const contact = contactById.get(recipient.contactId)?.contact;
          return recipient.status === 'approved' && (!contact || contact.status === 'Do Not Contact' || contact.consentBasis === 'Unverified' || !isPublicHttpsSource(contact.sourceUrl));
        })) {
          throw new Error('Every approved recipient needs an eligible contact and a public HTTPS source URL');
        }
      }
      await client.query(
        `INSERT INTO campaigns(workspace_id,id,status,payload,created_at)
         VALUES ($1,$2,$3,$4::jsonb,$5)
         ON CONFLICT (workspace_id,id) DO UPDATE SET status=EXCLUDED.status,payload=EXCLUDED.payload,updated_at=NOW()`,
        [actor.workspaceId, campaign.id, campaign.status, JSON.stringify(campaign), campaign.createdAt],
      );
      await client.query('DELETE FROM campaign_recipients WHERE workspace_id=$1 AND campaign_id=$2', [actor.workspaceId, campaign.id]);
      for (const recipient of campaign.recipients) {
        await client.query(
          `INSERT INTO campaign_recipients(workspace_id,campaign_id,contact_id,status,payload)
           VALUES ($1,$2,$3,$4,$5::jsonb)`,
          [actor.workspaceId, campaign.id, recipient.contactId, recipient.status, JSON.stringify(recipient)],
        );
      }
      await audit(client, actor, 'UPSERT', 'Campaign', campaign.id, { recipientCount: campaign.recipients.length });
      return campaign;
    });
  }

  async prepareCampaignSend(actor: WorkspaceActor, id: string): Promise<{ status: 'adapter_unavailable'; message: string; blockedRecipients: string[]; blockedReasons: { email: string; reason: string }[]; campaign: Campaign }> {
    return transaction(async (client) => {
      const rows = await client.query<{ payload: unknown }>('SELECT payload FROM campaigns WHERE workspace_id=$1 AND id=$2 FOR UPDATE', [actor.workspaceId, id]);
      if (!rows.rows[0]) throw new WorkspaceRecordNotFound();
      const campaign = asPayload<Campaign>(rows.rows[0].payload);
      const [suppressionRows, contactRows] = await Promise.all([
        client.query<{ payload: unknown }>('SELECT payload FROM suppression_records WHERE workspace_id=$1', [actor.workspaceId]),
        client.query<{ id: string; payload: unknown }>('SELECT id,payload FROM contacts WHERE workspace_id=$1 AND id=ANY($2::text[])', [actor.workspaceId, campaign.recipients.map((recipient) => recipient.contactId)]),
      ]);
      const suppression = suppressionRows.rows.map((row) => asPayload<SuppressionRecord>(row.payload));
      const contacts = new Map(contactRows.rows.map((row) => [row.id, asPayload<Contact>(row.payload)]));
      const blockedRecipients: string[] = [];
      const blockedReasons: { email: string; reason: string }[] = [];
      campaign.recipients = campaign.recipients.map((recipient) => {
        const contact = contacts.get(recipient.contactId);
        const suppressionMatch = isEmailSuppressed(recipient.email, suppression);
        const reason = suppressionMatch.suppressed
          ? 'Workspace suppression policy'
          : !contact || contact.status === 'Do Not Contact' || contact.consentBasis === 'Unverified'
            ? 'Contact consent basis is unverified or withdrawn'
            : !isPublicHttpsSource(contact.sourceUrl)
              ? 'A public HTTPS source URL is required'
              : '';
        if (reason) {
          blockedRecipients.push(recipient.email);
          blockedReasons.push({ email: recipient.email, reason });
          return { ...recipient, status: 'suppressed' as const, failureReason: reason, sentAt: undefined, deliveredAt: undefined };
        }
        return { ...recipient, status: recipient.status === 'approved' ? 'approved' as const : 'pending' as const, sentAt: undefined, deliveredAt: undefined, failureReason: undefined };
      });
      campaign.status = campaign.status === 'approved' && campaign.recipients.some((recipient) => recipient.status === 'approved') ? 'approved' : 'draft';
      campaign.stats = {
        total: campaign.recipients.length,
        approved: campaign.recipients.filter((recipient) => recipient.status === 'approved').length,
        sent: 0,
        delivered: 0,
        opened: 0,
        replied: 0,
        bounced: 0,
        unsubscribed: 0,
        suppressed: blockedRecipients.length,
      };
      await client.query('UPDATE campaigns SET status=$3,payload=$4::jsonb,updated_at=NOW() WHERE workspace_id=$1 AND id=$2', [actor.workspaceId, id, campaign.status, JSON.stringify(campaign)]);
      await client.query('DELETE FROM campaign_recipients WHERE workspace_id=$1 AND campaign_id=$2', [actor.workspaceId, id]);
      for (const recipient of campaign.recipients) {
        await client.query(
          'INSERT INTO campaign_recipients(workspace_id,campaign_id,contact_id,status,payload) VALUES ($1,$2,$3,$4,$5::jsonb)',
          [actor.workspaceId, id, recipient.contactId, recipient.status, JSON.stringify(recipient)],
        );
      }
      await audit(client, actor, 'SEND_BLOCKED', 'Campaign', id, { reason: 'No delivery adapter is implemented', suppressedCount: blockedRecipients.length, sentCount: 0 });
      return {
        status: 'adapter_unavailable',
        message: 'No delivery adapter is implemented; no messages were sent or delivered.',
        blockedRecipients,
        blockedReasons,
        campaign,
      };
    });
  }

  async getProjects(actor: WorkspaceActor): Promise<ResearchProject[]> {
    const rows = await query<{ payload: unknown }>('SELECT payload FROM research_projects WHERE workspace_id=$1 ORDER BY updated_at DESC, id', [actor.workspaceId]);
    return rows.map((row) => asPayload<ResearchProject>(row.payload));
  }

  async saveProject(actor: WorkspaceActor, input: ResearchProject): Promise<ResearchProject> {
    const project: ResearchProject = {
      id: safeId(input.id),
      name: safeText(input.name, 240) || 'Untitled project',
      description: safeText(input.description, 5000),
      savedAppIds: [...new Set((input.savedAppIds || []).map(safeId))],
      savedReviewIds: [...new Set((input.savedReviewIds || []).map(safeId))],
      savedThemeIds: [...new Set((input.savedThemeIds || []).map(safeId))],
      savedOpportunityIds: [...new Set((input.savedOpportunityIds || []).map(safeId))],
      notes: safeText(input.notes, 10_000),
      tags: Array.isArray(input.tags) ? input.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 50).map((tag) => tag.slice(0, 100)) : [],
      createdAt: safeDate(input.createdAt),
      updatedAt: new Date().toISOString(),
    };
    return transaction(async (client) => {
      await assertIdsInWorkspace(client, 'applications', actor.workspaceId, project.savedAppIds);
      await assertIdsInWorkspace(client, 'reviews', actor.workspaceId, project.savedReviewIds);
      await assertIdsInWorkspace(client, 'complaint_themes', actor.workspaceId, project.savedThemeIds);
      await assertIdsInWorkspace(client, 'opportunities', actor.workspaceId, project.savedOpportunityIds);
      await client.query(
        `INSERT INTO research_projects(id,workspace_id,name,description,payload,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)
         ON CONFLICT (workspace_id,id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,payload=EXCLUDED.payload,updated_at=EXCLUDED.updated_at`,
        [project.id, actor.workspaceId, project.name, project.description, JSON.stringify(project), project.createdAt, project.updatedAt],
      );
      await replaceRelation(client, 'research_project_applications', actor.workspaceId, 'project_id', project.id, 'application_id', project.savedAppIds);
      await replaceRelation(client, 'research_project_reviews', actor.workspaceId, 'project_id', project.id, 'review_id', project.savedReviewIds);
      await replaceRelation(client, 'research_project_themes', actor.workspaceId, 'project_id', project.id, 'theme_id', project.savedThemeIds);
      await replaceRelation(client, 'research_project_opportunities', actor.workspaceId, 'project_id', project.id, 'opportunity_id', project.savedOpportunityIds);
      await audit(client, actor, 'UPSERT', 'ResearchProject', project.id, { relatedApps: project.savedAppIds.length, relatedReviews: project.savedReviewIds.length });
      return project;
    });
  }

  async getAuditLogs(actor: WorkspaceActor, limit = 100): Promise<AuditLog[]> {
    const rows = await query<{ id: string; action: string; entity_type: string; entity_id: string | null; details: unknown; created_at: Date }>(
      'SELECT id,action,entity_type,entity_id,details,created_at FROM audit_events WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT $2',
      [actor.workspaceId, Math.max(1, Math.min(500, Math.trunc(limit)))],
    );
    return rows.map((row) => {
      const details = asPayload<Record<string, unknown>>(row.details);
      return {
        id: row.id,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id || '',
        details: typeof details?.message === 'string' ? details.message : Object.entries(details || {}).map(([key, value]) => `${key}: ${String(value)}`).join(', '),
        timestamp: row.created_at.toISOString(),
      };
    });
  }

  async recordExport(actor: WorkspaceActor, format: 'csv' | 'json' | 'xlsx' | 'pdf', metadata: Record<string, unknown>): Promise<string> {
    const id = `report_${crypto.randomUUID()}`;
    await transaction(async (client) => {
      await client.query(
        `INSERT INTO reports(id,workspace_id,requested_by,format,status,metadata,completed_at)
         VALUES ($1,$2,$3,$4,'completed',$5::jsonb,NOW())`,
        [id, actor.workspaceId, actor.userId, format, JSON.stringify(metadata)],
      );
      await audit(client, actor, 'EXPORT', 'Report', id, { format, recordCount: metadata.recordCount ?? null });
    });
    return id;
  }
}

export const domainStore = new WorkspaceDomainStore();
