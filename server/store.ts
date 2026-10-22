import fs from 'fs';
import path from 'path';
import { 
  Application, 
  Review, 
  ComplaintTheme, 
  Opportunity, 
  Contact, 
  Campaign, 
  SuppressionRecord, 
  ResearchProject, 
  CollectionJob, 
  AuditLog,
  SystemStats,
  Marketplace,
  ComplaintCategory,
  PredictedWeakness,
  AppDiscoveryFilter
} from '../src/types.ts';
import { SEED_APPS, getSeedReviews, SEED_THEMES, getSeedOpportunities, SEED_CONTACTS, SEED_SUPPRESSION, SEED_PROJECTS, SEED_FORECASTS } from './seedData.ts';
import { deduplicateReviews } from '../src/lib/dedup.ts';
import { calculateOpportunityScore } from '../src/lib/scoring.ts';
import { isEmailSuppressed, filterSuppressedRecipients } from '../src/lib/suppression.ts';
import { isVersionInRange } from '../src/lib/forecast.ts';
import { connectorRegistry } from './connectors/index.ts';

interface StoreData {
  apps: Application[];
  reviews: Review[];
  themes: ComplaintTheme[];
  forecasts: PredictedWeakness[];
  opportunities: Opportunity[];
  contacts: Contact[];
  campaigns: Campaign[];
  suppression: SuppressionRecord[];
  projects: ResearchProject[];
  jobs: CollectionJob[];
  auditLogs: AuditLog[];
}

const DATA_DIR = path.resolve(process.cwd(), 'server/data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

export class AppPulseStore {
  private data: StoreData = {
    apps: [],
    reviews: [],
    themes: [],
    forecasts: [],
    opportunities: [],
    contacts: [],
    campaigns: [],
    suppression: [],
    projects: [],
    jobs: [],
    auditLogs: [],
  };

  constructor() {
    this.init();
  }

  private init() {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        this.data = JSON.parse(raw);
        if (!this.data.forecasts || this.data.forecasts.length === 0) {
          this.data.forecasts = [...SEED_FORECASTS];
        }
        // Sync enriched app attributes (currentVersion, updateFrequency, review signals)
        for (const seedApp of SEED_APPS) {
          const existing = this.data.apps.find((a) => a.id === seedApp.id);
          if (existing) {
            existing.currentVersion = seedApp.currentVersion;
            existing.updateFrequency = seedApp.updateFrequency;
            existing.hasBugMentions = seedApp.hasBugMentions;
            existing.hasFeatureRequests = seedApp.hasFeatureRequests;
          } else {
            this.data.apps.push(seedApp);
          }
        }
        this.save();
      } else {
        this.seed();
        this.save();
      }
    } catch (e) {
      console.warn('[AppPulseStore] Failed to load data file, seeding default state:', e);
      this.seed();
    }
  }

  private seed() {
    this.data.apps = [...SEED_APPS];
    this.data.reviews = getSeedReviews();
    this.data.themes = [...SEED_THEMES];
    this.data.forecasts = [...SEED_FORECASTS];
    this.data.opportunities = getSeedOpportunities();
    this.data.contacts = [...SEED_CONTACTS];
    this.data.suppression = [...SEED_SUPPRESSION];
    this.data.projects = [...SEED_PROJECTS];
    this.data.jobs = [
      {
        id: 'job_init_01',
        appId: 'gp_quickbooks',
        appName: 'QuickBooks Online Accounting',
        marketplace: 'googleplay',
        status: 'completed',
        progress: 100,
        collectedCount: 45,
        deduplicatedCount: 7,
        startedAt: '2026-03-15T00:00:00Z',
        completedAt: '2026-03-15T00:01:20Z',
      },
      {
        id: 'job_init_02',
        appId: 'steam_730',
        appName: 'Counter-Strike 2',
        marketplace: 'steam',
        status: 'completed',
        progress: 100,
        collectedCount: 100,
        deduplicatedCount: 14,
        startedAt: '2026-03-24T00:00:00Z',
        completedAt: '2026-03-24T00:02:10Z',
      },
    ];
    this.data.campaigns = [
      {
        id: 'camp_01',
        name: 'Local-First Productivity Architecture Advisory',
        objective: 'advisory_discovery',
        tone: 'Consultative',
        targetCategory: 'Productivity',
        templateSubject: 'Insights from 310k reviews on {{app_name}} mobile offline behavior',
        templateBody: 'Hi {{business_name}} team,\n\nOur research analyzed user reviews for {{app_name}} and identified a high frequency of offline sync conflicts during transit and flights.\n\nWe would love to share our breakdown of recurring customer feedback with your product engineering leads.\n\nBest regards,\nAppPulse Intelligence Team',
        recipients: [
          {
            contactId: 'cnt_01',
            email: 'elena.rostova@notion.so',
            company: 'Notion Labs, Inc.',
            appName: 'Notion - Notes, Tasks, Wikis',
            personalizedSubject: 'Insights from 310k reviews on Notion mobile offline behavior',
            personalizedBody: 'Hi Elena,\n\nOur research analyzed user reviews for Notion and identified that over 40% of 1-star reviews cite offline sync blocks when users enter subways or planes.\n\nWe have prepared a comparative matrix against other productivity tools for your engineering team.\n\nBest,\nAppPulse Research Team\n\nTo opt-out from future research briefs, reply "Unsubscribe" or visit our suppression portal.',
            status: 'approved',
          },
        ],
        status: 'approved',
        stats: {
          total: 1,
          approved: 1,
          sent: 0,
          delivered: 0,
          opened: 0,
          replied: 0,
          bounced: 0,
          unsubscribed: 0,
          suppressed: 0,
        },
        createdAt: '2026-03-27T14:00:00Z',
      },
    ];
    this.logAudit('INIT', 'System', 'system_root', 'Initialized AppPulse Intelligence store with verified seed catalog');
  }

  private save() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const tempFile = `${DATA_FILE}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tempFile, DATA_FILE);
    } catch (e) {
      console.error('[AppPulseStore] Error writing data file:', e);
    }
  }

  logAudit(action: string, entityType: string, entityId: string, details: string) {
    const entry: AuditLog = {
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      action,
      entityType,
      entityId,
      details,
      timestamp: new Date().toISOString(),
    };
    this.data.auditLogs.unshift(entry);
    if (this.data.auditLogs.length > 500) {
      this.data.auditLogs.pop();
    }
  }

  getAuditLogs(): AuditLog[] {
    return this.data.auditLogs;
  }

  getStats(): SystemStats {
    const negativeReviews = this.data.reviews.filter((r) => r.starRating <= 2).length;
    
    // Complaint breakdown by category
    const catMap: Record<string, number> = {};
    for (const r of this.data.reviews) {
      const cat = r.classification?.category || 'Other';
      catMap[cat] = (catMap[cat] || 0) + 1;
    }

    const complaintBreakdown = Object.entries(catMap).map(([category, count]) => ({
      category,
      count,
    })).sort((a, b) => b.count - a.count);

    // Marketplace breakdown
    const mktMap: Record<Marketplace, number> = { googleplay: 0, steam: 0, microsoft: 0 };
    for (const app of this.data.apps) {
      mktMap[app.marketplace] = (mktMap[app.marketplace] || 0) + 1;
    }

    const marketplacesBreakdown = Object.entries(mktMap).map(([marketplace, count]) => ({
      marketplace: marketplace as Marketplace,
      count,
    }));

    return {
      totalApps: this.data.apps.length,
      totalReviews: this.data.reviews.length,
      negativeReviews,
      totalThemes: this.data.themes.length,
      totalOpportunities: this.data.opportunities.length,
      totalContacts: this.data.contacts.length,
      activeCampaigns: this.data.campaigns.filter((c) => c.status !== 'completed').length,
      suppressionCount: this.data.suppression.length,
      complaintBreakdown,
      marketplacesBreakdown,
    };
  }

  // Applications
  getApps(filter?: AppDiscoveryFilter): Application[] {
    return this.data.apps.filter((app) => {
      if (filter?.query) {
        const q = filter.query.toLowerCase();
        const matchesName = app.name.toLowerCase().includes(q);
        const matchesPub = app.publisher.toLowerCase().includes(q);
        const matchesDesc = app.description.toLowerCase().includes(q);
        const matchesTag = app.tags.some((t) => t.toLowerCase().includes(q));
        if (!matchesName && !matchesPub && !matchesDesc && !matchesTag) return false;
      }
      if (filter?.category && filter.category !== 'all' && app.category !== filter.category) return false;
      if (filter?.marketplace && filter.marketplace !== 'all' && app.marketplace !== filter.marketplace) return false;
      if (filter?.minRating && app.rating < filter.minRating) return false;
      if (filter?.maxRating && app.rating > filter.maxRating) return false;
      if (filter?.updateFrequency && filter.updateFrequency !== 'all' && app.updateFrequency !== filter.updateFrequency) return false;
      if (filter?.minVersion || filter?.maxVersion) {
        if (!isVersionInRange(app.currentVersion, filter.minVersion, filter.maxVersion)) return false;
      }
      if (filter?.hasBugMentions && !app.hasBugMentions) return false;
      if (filter?.hasFeatureRequests && !app.hasFeatureRequests) return false;
      return true;
    });
  }

  getAppById(id: string): Application | undefined {
    return this.data.apps.find((a) => a.id === id);
  }

  saveApp(app: Application): Application {
    const existingIndex = this.data.apps.findIndex((a) => a.id === app.id);
    if (existingIndex >= 0) {
      this.data.apps[existingIndex] = app;
    } else {
      this.data.apps.push(app);
      this.logAudit('CREATE', 'Application', app.id, `Discovered application ${app.name} on ${app.marketplace}`);
    }
    this.save();
    return app;
  }

  // Reviews
  getReviews(filter?: {
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
  }): { reviews: Review[]; total: number } {
    let list = this.data.reviews;

    if (filter?.appId && filter.appId !== 'all') {
      list = list.filter((r) => r.appId === filter.appId);
    }
    if (filter?.marketplace && filter.marketplace !== 'all') {
      list = list.filter((r) => r.marketplace === filter.marketplace);
    }
    if (filter?.negativeOnly) {
      list = list.filter((r) => r.starRating <= 2);
    }
    if (filter?.starRating) {
      list = list.filter((r) => r.starRating === filter.starRating);
    }
    if (filter?.category && filter.category !== 'all') {
      list = list.filter((r) => r.classification?.category === filter.category);
    }
    if (filter?.featureRequestsOnly) {
      list = list.filter((r) => r.classification?.isFeatureRequest === true);
    }
    if (filter?.bugsOnly) {
      list = list.filter((r) => r.classification?.isBug === true);
    }
    if (filter?.pricingOnly) {
      list = list.filter((r) => r.classification?.isPricingIssue === true);
    }
    if (filter?.searchQuery) {
      const q = filter.searchQuery.toLowerCase();
      list = list.filter(
        (r) =>
          r.text.toLowerCase().includes(q) ||
          r.appName.toLowerCase().includes(q) ||
          (r.classification?.keywords || []).some((k) => k.toLowerCase().includes(q))
      );
    }

    const total = list.length;
    const offset = filter?.offset || 0;
    const limit = filter?.limit || 50;

    return {
      reviews: list.slice(offset, offset + limit),
      total,
    };
  }

  updateReview(id: string, updates: Partial<Review>): Review | undefined {
    const r = this.data.reviews.find((item) => item.id === id);
    if (!r) return undefined;
    Object.assign(r, updates);
    this.save();
    return r;
  }

  // Jobs
  getJobs(): CollectionJob[] {
    return this.data.jobs;
  }

  async startCollectionJob(appId: string, options?: { negativeOnly?: boolean }): Promise<CollectionJob> {
    const app = this.getAppById(appId);
    if (!app) throw new Error(`App with ID ${appId} not found`);

    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const job: CollectionJob = {
      id: jobId,
      appId,
      appName: app.name,
      marketplace: app.marketplace,
      status: 'running',
      progress: 15,
      collectedCount: 0,
      deduplicatedCount: 0,
      startedAt: new Date().toISOString(),
    };

    this.data.jobs.unshift(job);
    this.save();

    // Run collection in background
    setTimeout(async () => {
      try {
        const connector = connectorRegistry.get(app.marketplace);
        let incoming: Omit<Review, 'fingerprint'>[] = [];

        if (connector) {
          const result = await connector.fetchReviews(appId, {
            negativeOnly: options?.negativeOnly ?? true,
            limit: 30,
          });
          incoming = result.reviews;
        }

        job.progress = 65;
        this.save();

        const { uniqueReviews, duplicatesCount } = deduplicateReviews(incoming, this.data.reviews);
        this.data.reviews.unshift(...uniqueReviews);

        job.collectedCount = incoming.length;
        job.deduplicatedCount = duplicatesCount;
        job.progress = 100;
        job.status = 'completed';
        job.completedAt = new Date().toISOString();
        
        this.logAudit('COLLECT_REVIEWS', 'CollectionJob', jobId, `Collected ${incoming.length} reviews for ${app.name} (${duplicatesCount} duplicates discarded)`);
        this.save();
      } catch (err: any) {
        job.status = 'failed';
        job.error = err.message || 'Collection pipeline error';
        this.save();
      }
    }, 800);

    return job;
  }

  // Themes
  getThemes(): ComplaintTheme[] {
    return this.data.themes;
  }

  saveThemes(themes: ComplaintTheme[]) {
    for (const t of themes) {
      const idx = this.data.themes.findIndex((item) => item.id === t.id);
      if (idx >= 0) {
        this.data.themes[idx] = t;
      } else {
        this.data.themes.push(t);
      }
    }
    this.logAudit('AI_ANALYSIS', 'ComplaintThemes', `batch_${Date.now()}`, `Analyzed and generated ${themes.length} complaint clusters`);
    this.save();
  }

  // Forecasts
  getForecasts(): PredictedWeakness[] {
    return this.data.forecasts.sort((a, b) => b.futureOpportunityScore - a.futureOpportunityScore);
  }

  saveForecast(forecast: PredictedWeakness): PredictedWeakness {
    const idx = this.data.forecasts.findIndex((f) => f.id === forecast.id);
    if (idx >= 0) {
      this.data.forecasts[idx] = forecast;
      this.logAudit('UPDATE', 'PredictedWeakness', forecast.id, `Updated forecast: ${forecast.weaknessTitle}`);
    } else {
      this.data.forecasts.unshift(forecast);
      this.logAudit('CREATE', 'PredictedWeakness', forecast.id, `Created predictive weakness forecast: ${forecast.weaknessTitle}`);
    }
    this.save();
    return forecast;
  }

  promoteForecastToOpportunity(id: string): Opportunity | undefined {
    const forecast = this.data.forecasts.find((f) => f.id === id);
    if (!forecast) return undefined;

    forecast.status = 'promoted_to_opportunity';
    const oppId = `opp_f_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const opp: Opportunity = {
      id: oppId,
      title: `Counter-Competitor: ${forecast.weaknessTitle}`,
      problemStatement: `${forecast.rootCauseTrend} — ${forecast.marketGapSummary}`,
      targetUser: `Users actively migrating from ${forecast.competitorAppNames.join(' and ')} seeking ${forecast.suggestedWedgeFeature.toLowerCase()}.`,
      supportingAppIds: forecast.competitorAppIds,
      supportingAppNames: forecast.competitorAppNames,
      supportingReviewIds: [],
      complaintFrequency: Math.round(forecast.estimatedChurnRiskPct * 3.5),
      severity: forecast.scoreBreakdown.severityImpactScore >= 80 ? 'Critical' : 'High',
      existingSolutions: `${forecast.competitorAppNames.join(', ')} currently suffer from high inertia and slow release cadence.`,
      proposedConcept: forecast.suggestedWedgeFeature,
      differentiationHypothesis: `Position as an agile alternative solving ${forecast.weaknessTitle} within the ${forecast.forecastedWindowMonths}-month market window.`,
      validationQuestions: [
        `How urgent is resolving ${forecast.weaknessTitle.toLowerCase()} for your current workflow?`,
        `Would you switch to a modern solution offering ${forecast.suggestedWedgeFeature}?`,
        `What is your timeline before evaluating alternatives?`
      ],
      nextSteps: forecast.validationMilestones,
      priorityScore: forecast.futureOpportunityScore,
      scoreBreakdown: {
        severityScore: forecast.scoreBreakdown.severityImpactScore,
        frequencyScore: forecast.scoreBreakdown.trendVelocityScore,
        recencyScore: forecast.scoreBreakdown.incumbentInertiaScore,
        breadthScore: forecast.scoreBreakdown.marketTAMReadinessScore,
      },
      tags: [forecast.category, 'Forecasted Opportunity', 'High TAM'],
      status: 'validating',
      createdAt: new Date().toISOString(),
    };

    this.saveOpportunity(opp);
    this.save();
    this.logAudit('PROMOTE_FORECAST', 'Opportunity', opp.id, `Promoted predicted weakness "${forecast.weaknessTitle}" to product opportunity`);
    return opp;
  }

  // Opportunities
  getOpportunities(): Opportunity[] {
    return this.data.opportunities.sort((a, b) => b.priorityScore - a.priorityScore);
  }

  saveOpportunity(opp: Opportunity): Opportunity {
    // Recalculate score with transparent breakdown
    const scoreResult = calculateOpportunityScore({
      severity: opp.severity,
      complaintFrequency: opp.complaintFrequency,
      affectedAppCount: opp.supportingAppIds.length || 1,
    });
    opp.priorityScore = scoreResult.score;
    opp.scoreBreakdown = scoreResult.breakdown;

    const idx = this.data.opportunities.findIndex((o) => o.id === opp.id);
    if (idx >= 0) {
      this.data.opportunities[idx] = opp;
      this.logAudit('UPDATE', 'Opportunity', opp.id, `Updated product opportunity ${opp.title}`);
    } else {
      this.data.opportunities.unshift(opp);
      this.logAudit('CREATE', 'Opportunity', opp.id, `Created product opportunity ${opp.title}`);
    }
    this.save();
    return opp;
  }

  deleteOpportunity(id: string) {
    this.data.opportunities = this.data.opportunities.filter((o) => o.id !== id);
    this.save();
  }

  // Contacts
  getContacts(): Contact[] {
    return this.data.contacts;
  }

  saveContact(contact: Contact): Contact {
    const idx = this.data.contacts.findIndex((c) => c.id === contact.id);
    if (idx >= 0) {
      this.data.contacts[idx] = contact;
    } else {
      this.data.contacts.unshift(contact);
      this.logAudit('CREATE', 'Contact', contact.id, `Added business contact ${contact.name} (${contact.company})`);
    }
    this.save();
    return contact;
  }

  deleteContact(id: string) {
    this.data.contacts = this.data.contacts.filter((c) => c.id !== id);
    this.save();
  }

  // Suppression
  getSuppressionList(): SuppressionRecord[] {
    return this.data.suppression;
  }

  addSuppression(emailOrDomain: string, reason: SuppressionRecord['reason'] = 'manual_suppression'): SuppressionRecord {
    const record: SuppressionRecord = {
      id: `sup_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      emailOrDomain: emailOrDomain.trim().toLowerCase(),
      reason,
      createdAt: new Date().toISOString(),
    };
    this.data.suppression.push(record);
    this.logAudit('SUPPRESSION', 'SuppressionRecord', record.id, `Added ${emailOrDomain} to suppression list (${reason})`);
    this.save();
    return record;
  }

  removeSuppression(id: string) {
    this.data.suppression = this.data.suppression.filter((s) => s.id !== id);
    this.save();
  }

  // Campaigns
  getCampaigns(): Campaign[] {
    return this.data.campaigns;
  }

  saveCampaign(campaign: Campaign): Campaign {
    const idx = this.data.campaigns.findIndex((c) => c.id === campaign.id);
    if (idx >= 0) {
      this.data.campaigns[idx] = campaign;
    } else {
      this.data.campaigns.unshift(campaign);
      this.logAudit('CREATE', 'Campaign', campaign.id, `Created outreach campaign ${campaign.name}`);
    }
    this.save();
    return campaign;
  }

  async sendCampaign(id: string): Promise<{ success: boolean; sent: number; blocked: number; reasons: string[] }> {
    const camp = this.data.campaigns.find((c) => c.id === id);
    if (!camp) throw new Error(`Campaign ${id} not found`);

    const suppressionList = this.getSuppressionList();
    const { allowed, blocked } = filterSuppressedRecipients(camp.recipients, suppressionList);

    // Update recipient statuses
    for (const item of allowed) {
      item.status = 'sent';
      item.sentAt = new Date().toISOString();
    }
    for (const b of blocked) {
      b.recipient.status = 'suppressed';
    }

    camp.stats.sent = (camp.stats.sent || 0) + allowed.length;
    camp.stats.delivered = (camp.stats.delivered || 0) + allowed.length;
    camp.stats.suppressed = (camp.stats.suppressed || 0) + blocked.length;
    camp.status = 'completed';

    this.logAudit(
      'SEND_CAMPAIGN',
      'Campaign',
      id,
      `Delivered outreach to ${allowed.length} verified contacts; blocked ${blocked.length} suppressed/opted-out recipients.`
    );
    this.save();

    return {
      success: true,
      sent: allowed.length,
      blocked: blocked.length,
      reasons: blocked.map((b) => `${b.recipient.email}: ${b.reason}`),
    };
  }

  // Research Projects
  getProjects(): ResearchProject[] {
    return this.data.projects;
  }

  saveProject(proj: ResearchProject): ResearchProject {
    const idx = this.data.projects.findIndex((p) => p.id === proj.id);
    if (idx >= 0) {
      this.data.projects[idx] = proj;
    } else {
      this.data.projects.unshift(proj);
      this.logAudit('CREATE', 'ResearchProject', proj.id, `Created research project: ${proj.name}`);
    }
    this.save();
    return proj;
  }
}

export const store = new AppPulseStore();
