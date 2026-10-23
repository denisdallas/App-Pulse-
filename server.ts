import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { store } from './server/store.ts';
import { connectorRegistry } from './server/connectors/index.ts';
import { analyzeComplaintsWithAI, generateOpportunitiesWithAI, draftOutreachEmailWithAI, forecastFutureWeaknessesWithAI } from './server/ai.ts';
import { jsonToCsv, parseCsv } from './src/lib/csv.ts';
import { Application, Contact, Opportunity } from './src/types.ts';
import { generateResearchReport } from './server/reports.ts';
import { databaseConfigured } from './server/db.ts';
import { migrate } from './server/migrate.ts';
import { authMiddleware, currentSession, login, logout, register, requestToken, tokenCookie } from './server/auth.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Baseline response hardening. These headers are safe for the existing local and hosted UI.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// Request logging
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    console.log(`[API] ${req.method} ${req.path}`);
  }
  next();
});

// --- API ROUTES ---

app.post('/api/auth/register', async (req, res) => {
  if (!databaseConfigured()) return res.status(503).json({ error: 'Authentication requires DATABASE_URL configuration' });
  try {
    const session = await register(String(req.body.email || ''), String(req.body.password || ''), String(req.body.workspaceName || 'My Workspace'));
    tokenCookie(res, session.token, session.expires);
    res.status(201).json({ user: session.user, expiresAt: session.expires.toISOString() });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  if (!databaseConfigured()) return res.status(503).json({ error: 'Authentication requires DATABASE_URL configuration' });
  try {
    const session = await login(String(req.body.email || ''), String(req.body.password || ''));
    tokenCookie(res, session.token, session.expires);
    res.json({ user: session.user, expiresAt: session.expires.toISOString() });
  } catch (error: any) {
    res.status(401).json({ error: error.message || 'Login failed' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  await logout(requestToken(req));
  res.setHeader('Set-Cookie', 'apppulse_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax');
  res.status(204).end();
});

app.get('/api/auth/session', async (req, res) => {
  if (!databaseConfigured()) return res.status(503).json({ error: 'Authentication requires DATABASE_URL configuration' });
  try {
    const session = await currentSession(requestToken(req));
    if (!session) return res.status(401).json({ error: 'Authentication required' });
    res.json({ user: session });
  } catch {
    res.status(503).json({ error: 'Authentication service unavailable' });
  }
});

// Domain APIs are public only for the explicitly local JSON-development mode.
// Production and database-backed deployments require a server-validated session.
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth/') || req.path === '/integrations/status') return next();
  if (!databaseConfigured() && process.env.NODE_ENV !== 'production') return next();
  return authMiddleware(req, res, next);
});

// 1. Dashboard Stats
app.get('/api/stats', (req, res) => {
  try {
    const stats = store.getStats();
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Research report export. The report is generated from the current stored scope only.
app.get('/api/reports/research.pdf', async (req, res) => {
  try {
    const requestedAppIds = typeof req.query.appIds === 'string' ? req.query.appIds.split(',').filter(Boolean) : [];
    const apps = store.getApps().filter((item) => requestedAppIds.length === 0 || requestedAppIds.includes(item.id));
    const appIds = new Set(apps.map((item) => item.id));
    const reviews = store.getReviews({ limit: 5000 }).reviews.filter((item) => appIds.size === 0 || appIds.has(item.appId));
    const themes = store.getThemes().filter((theme) => appIds.size === 0 || theme.affectedApps.some((appId) => appIds.has(appId)));
    const opportunities = store.getOpportunities().filter((opportunity) => appIds.size === 0 || opportunity.supportingAppIds.some((appId) => appIds.has(appId)));
    const report = await generateResearchReport({ title: 'AppPulse Intelligence Research Report', apps, reviews, themes, opportunities });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="apppulse-research-report.pdf"');
    res.send(report);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Unable to generate research report' });
  }
});

// Connector readiness is configuration-based until an actual retrieval test succeeds.
app.get('/api/integrations/status', (_req, res) => {
  const statuses = connectorRegistry.getAll().map((connector) => ({
    marketplace: connector.marketplace,
    name: connector.displayName,
    capabilities: { discovery: true, reviews: connector.marketplace === 'steam' || connector.marketplace === 'apple' },
    status: connector.marketplace === 'steam' ? 'partially_supported' : 'configuration_required',
    lastTestedAt: null,
    lastSuccessfulRetrievalAt: null,
    nextAction: connector.marketplace === 'steam'
      ? 'Run a live discovery/review retrieval test before treating this connector as verified.'
      : 'Configure and verify the permitted catalog or review access for this marketplace.',
  }));
  res.json({ generatedAt: new Date().toISOString(), statuses, email: {
    status: process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS ? 'configured_not_tested' : 'not_configured',
    nextAction: 'Configure and test a provider before sending any message.',
  }, ai: { status: process.env.API_KEY ? 'configured_not_tested' : 'not_configured' } });
});

// 2. Applications
app.get('/api/apps', (req, res) => {
  try {
    const {
      query,
      category,
      marketplace,
      minRating,
      maxRating,
      minVersion,
      maxVersion,
      updateFrequency,
      hasBugMentions,
      hasFeatureRequests,
    } = req.query;

    const apps = store.getApps({
      query: query ? String(query) : undefined,
      category: category ? String(category) : undefined,
      marketplace: marketplace ? String(marketplace) : undefined,
      minRating: minRating ? Number(minRating) : undefined,
      maxRating: maxRating ? Number(maxRating) : undefined,
      minVersion: minVersion ? String(minVersion) : undefined,
      maxVersion: maxVersion ? String(maxVersion) : undefined,
      updateFrequency: updateFrequency ? String(updateFrequency) : undefined,
      hasBugMentions: hasBugMentions === 'true',
      hasFeatureRequests: hasFeatureRequests === 'true',
    });
    res.json(apps);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/apps/:id', (req, res) => {
  try {
    const appItem = store.getAppById(req.params.id);
    if (!appItem) return res.status(404).json({ error: 'App not found' });
    const reviewsData = store.getReviews({ appId: req.params.id, limit: 100 });
    res.json({ app: appItem, reviews: reviewsData.reviews, totalReviews: reviewsData.total });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Online marketplace search (queries real connectors e.g. Steam)
app.post('/api/apps/search-online', async (req, res) => {
  try {
    const { query, marketplace } = req.body;
    const mkt = marketplace || 'steam';
    const connector = connectorRegistry.get(mkt as any);
    
    if (!connector) {
      return res.status(400).json({ error: `Marketplace ${mkt} not supported` });
    }

    const liveApps = await connector.searchApps({ query, limit: 12 });
    // Save any newly found apps to store
    for (const appItem of liveApps) {
      store.saveApp(appItem);
    }

    res.json({ apps: liveApps, count: liveApps.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Collection Jobs
app.get('/api/jobs', (req, res) => {
  try {
    const jobs = store.getJobs();
    res.json(jobs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/apps/collect', async (req, res) => {
  try {
    const { appId, negativeOnly } = req.body;
    if (!appId) return res.status(400).json({ error: 'appId is required' });

    const job = await store.startCollectionJob(appId, { negativeOnly });
    res.json({ job, message: 'Collection job started. Poll /api/jobs for the persisted result.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Reviews
app.get('/api/reviews', (req, res) => {
  try {
    const {
      appId,
      marketplace,
      negativeOnly,
      starRating,
      category,
      searchQuery,
      featureRequestsOnly,
      bugsOnly,
      pricingOnly,
      limit,
      offset,
    } = req.query;

    const result = store.getReviews({
      appId: appId ? String(appId) : undefined,
      marketplace: marketplace ? String(marketplace) : undefined,
      negativeOnly: negativeOnly === 'true',
      starRating: starRating ? Number(starRating) : undefined,
      category: category ? String(category) : undefined,
      searchQuery: searchQuery ? String(searchQuery) : undefined,
      featureRequestsOnly: featureRequestsOnly === 'true',
      bugsOnly: bugsOnly === 'true',
      pricingOnly: pricingOnly === 'true',
      limit: limit ? Number(limit) : 50,
      offset: offset ? Number(offset) : 0,
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reviews/:id/tag', (req, res) => {
  try {
    const { id } = req.params;
    const { notes, savedToCollection, tagList } = req.body;
    const updated = store.updateReview(id, { notes, savedToCollection, tagList });
    if (!updated) return res.status(404).json({ error: 'Review not found' });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. AI Complaint Analysis
app.get('/api/themes', (req, res) => {
  try {
    const themes = store.getThemes();
    res.json(themes);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/analyze', async (req, res) => {
  try {
    const { appIds, category } = req.body;
    let reviews = store.getReviews({ negativeOnly: true, limit: 120 }).reviews;

    if (Array.isArray(appIds) && appIds.length > 0) {
      reviews = reviews.filter((r) => appIds.includes(r.appId));
    }
    if (category && category !== 'all') {
      reviews = reviews.filter((r) => r.classification?.category === category);
    }

    const allApps = store.getApps();
    const affectedApps = Array.isArray(appIds) && appIds.length > 0
      ? allApps.filter((a) => appIds.includes(a.id))
      : allApps;

    const themes = await analyzeComplaintsWithAI(reviews, affectedApps);
    store.saveThemes(themes);

    res.json({ themes, count: themes.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5b. Future Competitor Weakness & Market Gap Forecasts
app.get('/api/forecasts', (req, res) => {
  try {
    const forecasts = store.getForecasts();
    res.json(forecasts);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/forecasts/generate', async (req, res) => {
  try {
    const reviews = store.getReviews({ negativeOnly: true, limit: 100 }).reviews;
    const apps = store.getApps();
    const themes = store.getThemes();

    const predicted = await forecastFutureWeaknessesWithAI(reviews, apps, themes);
    for (const p of predicted) {
      store.saveForecast(p);
    }

    res.json({ forecasts: predicted, count: predicted.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/forecasts/:id/promote', (req, res) => {
  try {
    const opp = store.promoteForecastToOpportunity(req.params.id);
    if (!opp) return res.status(404).json({ error: 'Forecast not found' });
    res.json({ success: true, opportunity: opp });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Competitor Comparison
app.get('/api/compare', (req, res) => {
  try {
    const { appIds } = req.query;
    if (!appIds) return res.status(400).json({ error: 'appIds parameter required' });

    const ids = String(appIds).split(',').filter(Boolean);
    const apps = ids.map((id) => store.getAppById(id)).filter(Boolean) as Application[];

    const comparisonData = apps.map((app) => {
      const appReviews = store.getReviews({ appId: app.id, limit: 500 }).reviews;
      const negativeReviews = appReviews.filter((r) => r.starRating <= 2);
      const featureRequests = appReviews.filter((r) => r.classification?.isFeatureRequest);

      // Top complaints
      const complaintCats: Record<string, number> = {};
      for (const r of negativeReviews) {
        const cat = r.classification?.category || 'Other';
        complaintCats[cat] = (complaintCats[cat] || 0) + 1;
      }

      return {
        app,
        totalReviewsSampled: appReviews.length,
        negativeReviewsCount: negativeReviews.length,
        negativeRate: appReviews.length > 0 ? (negativeReviews.length / appReviews.length) : 0,
        featureRequestsCount: featureRequests.length,
        topComplaints: Object.entries(complaintCats)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([name, count]) => ({ name, count })),
      };
    });

    res.json({ comparison: comparisonData });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Opportunity Finder
app.get('/api/opportunities', (req, res) => {
  try {
    const opps = store.getOpportunities();
    res.json(opps);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/opportunities/generate', async (req, res) => {
  try {
    const themes = store.getThemes();
    const apps = store.getApps();
    const opps = await generateOpportunitiesWithAI(themes, apps);

    for (const opp of opps) {
      store.saveOpportunity(opp);
    }

    res.json({ opportunities: opps, count: opps.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/opportunities', (req, res) => {
  try {
    const opp: Opportunity = req.body;
    if (!opp.title) return res.status(400).json({ error: 'Title is required' });
    const saved = store.saveOpportunity(opp);
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/opportunities/:id', (req, res) => {
  try {
    store.deleteOpportunity(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Outreach Contacts & Studio
app.get('/api/contacts', (req, res) => {
  try {
    const contacts = store.getContacts();
    res.json(contacts);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/contacts', (req, res) => {
  try {
    const contact: Contact = req.body;
    if (!contact.email) return res.status(400).json({ error: 'Email is required' });
    const saved = store.saveContact(contact);
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/contacts/:id', (req, res) => {
  try {
    store.deleteContact(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/contacts/import-csv', (req, res) => {
  try {
    const { csvContent } = req.body;
    if (!csvContent) return res.status(400).json({ error: 'csvContent is required' });

    const rows = parseCsv(csvContent);
    const addedContacts: Contact[] = [];

    for (const r of rows) {
      const email = r['email'] || r['Email'] || r['contact_email'];
      if (!email) continue;

      const contact: Contact = {
        id: `cnt_csv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: r['name'] || r['Name'] || 'Business Contact',
        title: r['title'] || r['Title'] || 'Product Lead',
        company: r['company'] || r['Company'] || 'Technology Publisher',
        email: email.trim().toLowerCase(),
        phone: r['phone'] || r['Phone'] || undefined,
        website: r['website'] || r['Website'] || undefined,
        channel: 'email',
        sourceUrl: r['sourceUrl'] || r['Source'] || 'CSV Import',
        status: 'New',
        consentBasis: 'Public Publisher Info',
        notes: 'Imported via CSV',
        createdAt: new Date().toISOString(),
      };

      store.saveContact(contact);
      addedContacts.push(contact);
    }

    res.json({ imported: addedContacts.length, contacts: addedContacts });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Suppression & Unsubscribe Management
app.get('/api/suppression', (req, res) => {
  try {
    const suppressionList = store.getSuppressionList();
    res.json(suppressionList);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/suppression', (req, res) => {
  try {
    const { emailOrDomain, reason } = req.body;
    if (!emailOrDomain) return res.status(400).json({ error: 'emailOrDomain is required' });
    const record = store.addSuppression(emailOrDomain, reason);
    res.json(record);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/suppression/:id', (req, res) => {
  try {
    store.removeSuppression(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// AI Outreach Draft Generation
app.post('/api/outreach/draft', async (req, res) => {
  try {
    const { contactId, opportunityId, appId, objective, tone } = req.body;
    const contact = store.getContacts().find((c) => c.id === contactId);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    const opportunity = opportunityId ? store.getOpportunities().find((o) => o.id === opportunityId) : undefined;
    const appItem = appId ? store.getAppById(appId) : undefined;

    const draft = await draftOutreachEmailWithAI({
      contact,
      opportunity,
      app: appItem,
      objective: objective || 'Product Partnership',
      tone: tone || 'Consultative',
    });

    res.json(draft);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Campaigns
app.get('/api/campaigns', (req, res) => {
  try {
    const campaigns = store.getCampaigns();
    res.json(campaigns);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/campaigns', (req, res) => {
  try {
    const camp = req.body;
    const saved = store.saveCampaign(camp);
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/campaigns/:id/send', async (req, res) => {
  try {
    const result = await store.sendCampaign(req.params.id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Research Projects
app.get('/api/projects', (req, res) => {
  try {
    const projects = store.getProjects();
    res.json(projects);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/projects', (req, res) => {
  try {
    const proj = req.body;
    const saved = store.saveProject(proj);
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 10. Audit Logs & Settings
app.get('/api/audit-logs', (req, res) => {
  try {
    const logs = store.getAuditLogs();
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/settings', async (req, res) => {
  try {
    const statuses = await connectorRegistry.getAllStatuses();
    const hasAiKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY');

    res.json({
      workspaceName: 'AppPulse Core Intelligence',
      aiModel: 'gemini-3.8-flash',
      aiStatus: hasAiKey ? 'active' : 'fallback_clustering',
      connectors: statuses,
      emailProvider: process.env.SMTP_HOST ? 'SMTP configured; delivery adapter unavailable in Phase 1' : 'Not configured',
      emailDeliveryReady: false,
      dataRetentionDays: 90,
      suppressionCount: store.getSuppressionList().length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 11. Data Export (CSV and JSON)
app.get('/api/export', (req, res) => {
  try {
    const { type, format } = req.query;
    const isJson = format === 'json';

    if (type === 'reviews') {
      const { reviews } = store.getReviews({ limit: 1000 });
      if (isJson) {
        res.setHeader('Content-Disposition', 'attachment; filename="apppulse_reviews.json"');
        return res.json(reviews);
      }
      const csv = jsonToCsv(reviews, [
        { key: 'id', header: 'Review ID' },
        { key: 'appName', header: 'App Name' },
        { key: 'marketplace', header: 'Marketplace' },
        { key: 'starRating', header: 'Star Rating' },
        { key: 'reviewDate', header: 'Review Date' },
        { key: 'text', header: 'Review Text' },
        { key: 'helpfulVotes', header: 'Helpful Votes' },
        { key: 'appVersion', header: 'App Version' },
        { key: 'collectedAt', header: 'Collected At' },
        { key: 'provenance', header: 'Provenance' },
        { key: 'sourceReviewId', header: 'Source Review ID' },
        { key: 'reviewUrl', header: 'Source URL' },
      ]);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="apppulse_reviews.csv"');
      return res.send(csv);
    }

    if (type === 'opportunities') {
      const opps = store.getOpportunities();
      if (isJson) {
        res.setHeader('Content-Disposition', 'attachment; filename="apppulse_opportunities.json"');
        return res.json(opps);
      }
      const csv = jsonToCsv(opps, [
        { key: 'id', header: 'Opportunity ID' },
        { key: 'title', header: 'Opportunity Title' },
        { key: 'severity', header: 'Severity' },
        { key: 'priorityScore', header: 'Priority Score (0-100)' },
        { key: 'complaintFrequency', header: 'Complaint Count' },
        { key: 'problemStatement', header: 'Problem Statement' },
        { key: 'proposedConcept', header: 'Proposed Concept' },
        { key: 'differentiationHypothesis', header: 'Differentiation' },
        { key: 'status', header: 'Validation Status' },
      ]);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="apppulse_opportunities.csv"');
      return res.send(csv);
    }

    if (type === 'contacts') {
      const contacts = store.getContacts();
      if (isJson) {
        res.setHeader('Content-Disposition', 'attachment; filename="apppulse_contacts.json"');
        return res.json(contacts);
      }
      const csv = jsonToCsv(contacts, [
        { key: 'name', header: 'Contact Name' },
        { key: 'title', header: 'Title' },
        { key: 'company', header: 'Company' },
        { key: 'email', header: 'Email' },
        { key: 'website', header: 'Website' },
        { key: 'status', header: 'Status' },
        { key: 'consentBasis', header: 'Consent Basis' },
      ]);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="apppulse_contacts.csv"');
      return res.send(csv);
    }

    res.status(400).json({ error: 'Invalid export type. Use reviews, opportunities, or contacts.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 12. Audit Report PDF Download
app.get(['/api/audit-report/download', '/AppPulse_Implementation_Audit_Report.pdf'], (req, res) => {
  const filePath = path.resolve(__dirname, 'AppPulse_Implementation_Audit_Report.pdf');
  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="AppPulse_Implementation_Audit_Report.pdf"');
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'Audit PDF report not found.' });
  }
});

// --- VITE MIDDLEWARE INTEGRATION (FULL-STACK DEV & PRODUCTION) ---

async function startServer() {
  if (process.env.NODE_ENV === 'production' && !databaseConfigured()) {
    throw new Error('DATABASE_URL is required in production; refusing to start with JSON persistence');
  }
  if (databaseConfigured()) {
    if (!process.env.AUTH_SESSION_SECRET) {
      throw new Error('AUTH_SESSION_SECRET is required when DATABASE_URL is configured');
    }
    await migrate();
    console.log('[AppPulse Server] PostgreSQL migrations applied');
  }
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
const vite = await createViteServer({
    server: {
      middlewareMode: true,
      // Express owns the HTTP server in this development setup. There is no
      // Vite WebSocket server to accept the injected HMR client connection.
      hmr: false,
    },
    appType: 'spa',
  });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[AppPulse Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[AppPulse Server] Fatal startup error:', err);
  process.exit(1);
});
