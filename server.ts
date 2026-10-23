import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { db } from './server/db/database.ts';
import { runMigrations, hashPassword } from './server/db/migrations.ts';
import { repository } from './server/db/repository.ts';
import { connectorRegistry } from './server/connectors/index.ts';
import { analyzeComplaintsWithAI, generateOpportunitiesWithAI, draftOutreachEmailWithAI, forecastFutureWeaknessesWithAI } from './server/ai.ts';
import { jsonToCsv, parseCsv } from './src/lib/csv.ts';
import { Application, Contact, Opportunity, CollectionJob, Campaign, ReportRecord, Marketplace } from './src/types.ts';
import { generateResearchPdf, generateResearchXlsx, escapeSpreadsheetValue } from './server/reports/generator.ts';
import { getEmailProviderConfig, sendOutreachEmail } from './server/outreach/delivery.ts';
import { filterSuppressedRecipients } from './src/lib/suppression.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Ensure reports directory exists
const reportsDir = path.join(__dirname, 'server', 'data', 'reports');
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

// Session & Workspace Context Middleware
interface AuthenticatedRequest extends express.Request {
  user?: any;
  workspaceId: string;
}

app.use(async (req: any, res, next) => {
  const authHeader = req.headers.authorization;
  const sessionToken = req.headers['x-session-token'] || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null);
  const workspaceHeader = req.headers['x-workspace-id'];

  let wsId = 'ws_default';
  let user = null;

  if (sessionToken && typeof sessionToken === 'string') {
    const session = await repository.validateSession(sessionToken);
    if (session) {
      user = session.user;
      wsId = workspaceHeader ? String(workspaceHeader) : session.workspaceId;
    }
  }

  // Development / default fallback session
  if (!user) {
    user = {
      id: 'usr_admin_01',
      email: 'admin@apppulse.io',
      name: 'Denis Dallas (Lead)',
      role: 'admin',
      createdAt: new Date().toISOString(),
    };
    wsId = workspaceHeader ? String(workspaceHeader) : 'ws_default';
  }

  req.user = user;
  req.workspaceId = wsId;
  next();
});

// Request logging
app.use((req: any, res, next) => {
  if (req.path.startsWith('/api')) {
    console.log(`[API] ${req.method} ${req.path} [WS: ${req.workspaceId}]`);
  }
  next();
});

// --- AUTHENTICATION & WORKSPACE ROUTES ---

app.post('/api/auth/register', async (req: any, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    const existing = await repository.getUserByEmail(email);
    if (existing) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const userId = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const passwordHash = hashPassword(password);
    const user = await repository.createUser({ id: userId, email, passwordHash, name, role: 'member' });
    const token = await repository.createSession(userId, req.workspaceId);

    res.json({ user, token, workspaceId: req.workspaceId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req: any, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const userRecord = await repository.getUserByEmail(email);
    if (!userRecord) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const inputHash = hashPassword(password);
    if (userRecord.password_hash !== inputHash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = await repository.createSession(userRecord.id, req.workspaceId);
    res.json({
      token,
      user: {
        id: userRecord.id,
        email: userRecord.email,
        name: userRecord.name,
        role: userRecord.role,
        createdAt: userRecord.created_at,
      },
      workspaceId: req.workspaceId,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', (req: any, res) => {
  res.json({
    user: req.user,
    workspaceId: req.workspaceId,
  });
});

app.get('/api/workspaces', async (req: any, res) => {
  try {
    const workspaces = await repository.getWorkspaces();
    res.json({ workspaces, activeWorkspaceId: req.workspaceId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- CORE APPLICATION INTELLIGENCE ROUTES ---

// 1. Dashboard Stats
app.get('/api/stats', async (req: any, res) => {
  try {
    const stats = await repository.getStats(req.workspaceId);
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Applications
app.get('/api/apps', async (req: any, res) => {
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

    let apps = await repository.getApplications(req.workspaceId);

    if (query) {
      const q = String(query).toLowerCase().trim();
      apps = apps.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.publisher.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          a.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    if (category && category !== 'all') {
      apps = apps.filter((a) => a.category.toLowerCase() === String(category).toLowerCase());
    }

    if (marketplace && marketplace !== 'all') {
      apps = apps.filter((a) => a.marketplace === marketplace);
    }

    if (minRating) {
      apps = apps.filter((a) => a.rating >= Number(minRating));
    }
    if (maxRating) {
      apps = apps.filter((a) => a.rating <= Number(maxRating));
    }

    if (hasBugMentions === 'true') {
      apps = apps.filter((a) => a.hasBugMentions);
    }
    if (hasFeatureRequests === 'true') {
      apps = apps.filter((a) => a.hasFeatureRequests);
    }

    res.json(apps);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/apps/:id', async (req: any, res) => {
  try {
    const appItem = await repository.getApplicationById(req.workspaceId, req.params.id);
    if (!appItem) return res.status(404).json({ error: 'App not found' });
    const reviews = await repository.getReviews(req.workspaceId, { appId: req.params.id });
    res.json({ app: appItem, reviews: reviews.slice(0, 100), totalReviews: reviews.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Online marketplace search (queries real connectors e.g. Steam, Apple App Store)
app.post('/api/apps/search-online', async (req: any, res) => {
  try {
    const { query, marketplace } = req.body;
    const mkt = marketplace || 'steam';
    const connector = connectorRegistry.get(mkt as any);
    
    if (!connector) {
      return res.status(400).json({ error: `Marketplace ${mkt} not supported` });
    }

    const liveApps = await connector.searchApps({ query, limit: 12 });
    
    // Save any newly found apps to workspace database
    for (const appItem of liveApps) {
      await repository.saveApplication(req.workspaceId, appItem);
    }

    res.json({ apps: liveApps, count: liveApps.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Durable Collection Jobs
app.get('/api/jobs', async (req: any, res) => {
  try {
    const jobs = await repository.getJobs(req.workspaceId);
    res.json(jobs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/apps/collect', async (req: any, res) => {
  try {
    const { appId, negativeOnly } = req.body;
    if (!appId) return res.status(400).json({ error: 'appId is required' });

    const appItem = await repository.getApplicationById(req.workspaceId, appId);
    if (!appItem) return res.status(404).json({ error: `App with ID ${appId} not found` });

    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const job: CollectionJob = {
      id: jobId,
      workspaceId: req.workspaceId,
      appId,
      appName: appItem.name,
      marketplace: appItem.marketplace,
      status: 'running',
      progress: 15,
      collectedCount: 0,
      deduplicatedCount: 0,
      retryCount: 0,
      startedAt: new Date().toISOString(),
    };

    await repository.createJob(req.workspaceId, job);

    // Asynchronous background collection with durable job updates
    setTimeout(async () => {
      try {
        const connector = connectorRegistry.get(appItem.marketplace);
        if (!connector) {
          job.status = 'failed';
          job.error = `No connector registered for marketplace ${appItem.marketplace}`;
          job.completedAt = new Date().toISOString();
          await repository.updateJob(req.workspaceId, job);
          return;
        }

        job.progress = 40;
        await repository.updateJob(req.workspaceId, job);

        const result = await connector.fetchReviews(appId, {
          negativeOnly: negativeOnly ?? true,
          limit: 40,
        });

        job.progress = 75;
        await repository.updateJob(req.workspaceId, job);

        if (result.reviews.length > 0) {
          const { inserted, duplicates } = await repository.saveReviews(req.workspaceId, result.reviews);
          job.collectedCount = result.reviews.length;
          job.deduplicatedCount = duplicates;
          job.progress = 100;
          job.status = 'completed';
          job.completedAt = new Date().toISOString();
          await repository.logAudit(
            req.workspaceId,
            'COLLECT_REVIEWS',
            'CollectionJob',
            jobId,
            `Collected ${result.reviews.length} genuine reviews for ${appItem.name} (${duplicates} duplicates discarded)`
          );
        } else {
          // STRICT RULE: Zero synthetic reviews created!
          job.collectedCount = 0;
          job.deduplicatedCount = 0;
          job.progress = 100;
          job.status = result.error ? 'failed' : 'completed';
          job.error = result.error || 'Marketplace returned 0 reviews matching query filter.';
          job.completedAt = new Date().toISOString();
        }

        await repository.updateJob(req.workspaceId, job);
      } catch (err: any) {
        console.error(`[CollectionJob] Error running job ${jobId}:`, err);
        job.status = 'failed';
        job.error = err.message;
        job.completedAt = new Date().toISOString();
        await repository.updateJob(req.workspaceId, job);
      }
    }, 50);

    res.json({ job, message: 'Durable collection job initiated' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/jobs/:id/cancel', async (req: any, res) => {
  try {
    const success = await repository.cancelJob(req.workspaceId, req.params.id);
    res.json({ success, message: success ? 'Job cancelled' : 'Job could not be cancelled' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Reviews
app.get('/api/reviews', async (req: any, res) => {
  try {
    const {
      appId,
      marketplace,
      negativeOnly,
      starRating,
      category,
      searchQuery,
      limit,
      offset,
    } = req.query;

    let reviews = await repository.getReviews(req.workspaceId, {
      appId: appId ? String(appId) : undefined,
      marketplace: marketplace ? String(marketplace) : undefined,
      negativeOnly: negativeOnly === 'true',
    });

    if (starRating) {
      reviews = reviews.filter((r) => r.starRating === Number(starRating));
    }

    if (category && category !== 'all') {
      reviews = reviews.filter((r) => r.classification?.category === category);
    }

    if (searchQuery) {
      const q = String(searchQuery).toLowerCase().trim();
      reviews = reviews.filter(
        (r) =>
          r.text.toLowerCase().includes(q) ||
          r.appName.toLowerCase().includes(q) ||
          r.classification?.keywords.some((k) => k.toLowerCase().includes(q))
      );
    }

    const total = reviews.length;
    const l = limit ? Number(limit) : 50;
    const o = offset ? Number(offset) : 0;
    const paged = reviews.slice(o, o + l);

    res.json({ reviews: paged, total });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. AI Complaint Analysis & Themes
app.get('/api/themes', async (req: any, res) => {
  try {
    const themes = await repository.getComplaintThemes(req.workspaceId);
    res.json(themes);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/analyze', async (req: any, res) => {
  try {
    const { appIds, category } = req.body;
    let reviews = await repository.getReviews(req.workspaceId, { negativeOnly: true });

    if (Array.isArray(appIds) && appIds.length > 0) {
      reviews = reviews.filter((r) => appIds.includes(r.appId));
    }
    if (category && category !== 'all') {
      reviews = reviews.filter((r) => r.classification?.category === category);
    }

    const allApps = await repository.getApplications(req.workspaceId);
    const affectedApps = Array.isArray(appIds) && appIds.length > 0
      ? allApps.filter((a) => appIds.includes(a.id))
      : allApps;

    const themes = await analyzeComplaintsWithAI(reviews.slice(0, 120), affectedApps);

    // Link extracted themes directly to real review evidence IDs
    for (const theme of themes) {
      const matched = reviews.filter((r) => theme.affectedApps.includes(r.appId));
      theme.evidenceReviewIds = matched.slice(0, 6).map((r) => r.id);
      theme.isDemo = false;
      await repository.saveComplaintTheme(req.workspaceId, theme);
    }

    res.json({ themes, count: themes.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Competitor Comparison
app.get('/api/compare', async (req: any, res) => {
  try {
    const { appIds } = req.query;
    if (!appIds) return res.status(400).json({ error: 'appIds parameter required' });

    const ids = String(appIds).split(',').filter(Boolean);
    const allApps = await repository.getApplications(req.workspaceId);
    const apps = allApps.filter((a) => ids.includes(a.id));

    const comparisonData = await Promise.all(
      apps.map(async (app) => {
        const appReviews = await repository.getReviews(req.workspaceId, { appId: app.id });
        const negativeReviews = appReviews.filter((r) => r.starRating <= 2);
        const featureRequests = appReviews.filter((r) => r.classification?.isFeatureRequest);

        const complaintCats: Record<string, number> = {};
        for (const r of negativeReviews) {
          const cat = r.classification?.category || 'Other';
          complaintCats[cat] = (complaintCats[cat] || 0) + 1;
        }

        return {
          app,
          totalReviewsSampled: appReviews.length,
          negativeReviewsCount: negativeReviews.length,
          negativeRate: appReviews.length > 0 ? negativeReviews.length / appReviews.length : 0,
          featureRequestsCount: featureRequests.length,
          topComplaints: Object.entries(complaintCats)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4)
            .map(([name, count]) => ({ name, count })),
        };
      })
    );

    res.json({ comparison: comparisonData });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Opportunities
app.get('/api/opportunities', async (req: any, res) => {
  try {
    const opps = await repository.getOpportunities(req.workspaceId);
    res.json(opps);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/opportunities/generate', async (req: any, res) => {
  try {
    const themes = await repository.getComplaintThemes(req.workspaceId);
    const apps = await repository.getApplications(req.workspaceId);
    const opps = await generateOpportunitiesWithAI(themes, apps);

    for (const opp of opps) {
      opp.isDemo = false;
      await repository.saveOpportunity(req.workspaceId, opp);
    }

    res.json({ opportunities: opps, count: opps.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/opportunities', async (req: any, res) => {
  try {
    const opp: Opportunity = req.body;
    if (!opp.title) return res.status(400).json({ error: 'Title is required' });
    const saved = await repository.saveOpportunity(req.workspaceId, opp);
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Outreach Contacts & Studio
app.get('/api/contacts', async (req: any, res) => {
  try {
    const contacts = await repository.getContacts(req.workspaceId);
    res.json(contacts);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/contacts', async (req: any, res) => {
  try {
    const contact: Contact = req.body;
    if (!contact.email) return res.status(400).json({ error: 'Email is required' });
    const saved = await repository.saveContact(req.workspaceId, contact);
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/contacts/import-csv', async (req: any, res) => {
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
        verifiedSource: 'CSV Import File',
        isVerified: true,
        confidence: 0.9,
        isDemo: false,
        createdAt: new Date().toISOString(),
      };

      await repository.saveContact(req.workspaceId, contact);
      addedContacts.push(contact);
    }

    res.json({ imported: addedContacts.length, contacts: addedContacts });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Suppression Management
app.get('/api/suppression', async (req: any, res) => {
  try {
    const list = await repository.getSuppressionList(req.workspaceId);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/suppression', async (req: any, res) => {
  try {
    const { emailOrDomain, reason } = req.body;
    if (!emailOrDomain) return res.status(400).json({ error: 'emailOrDomain is required' });
    const record = await repository.addSuppression(req.workspaceId, emailOrDomain, reason);
    res.json(record);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Campaigns & Real Delivery
app.get('/api/campaigns', async (req: any, res) => {
  try {
    const campaigns = await repository.getCampaigns(req.workspaceId);
    res.json(campaigns);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/campaigns', async (req: any, res) => {
  try {
    const camp = req.body;
    const saved = await repository.saveCampaign(req.workspaceId, camp);
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/campaigns/:id/send', async (req: any, res) => {
  try {
    const campaigns = await repository.getCampaigns(req.workspaceId);
    const camp = campaigns.find((c) => c.id === req.params.id);
    if (!camp) return res.status(404).json({ error: 'Campaign not found' });

    const emailConfig = getEmailProviderConfig();
    const suppressionList = await repository.getSuppressionList(req.workspaceId);
    const { allowed, blocked } = filterSuppressedRecipients(camp.recipients, suppressionList);

    // Enforce suppression
    for (const b of blocked) {
      b.recipient.status = 'suppressed';
    }

    if (!emailConfig.isReady) {
      // ZERO SIMULATED DELIVERY RULE
      camp.stats.suppressed = blocked.length;
      camp.status = 'approved';
      await repository.saveCampaign(req.workspaceId, camp);

      return res.status(400).json({
        success: false,
        sent: 0,
        blocked: blocked.length,
        message: 'No live email provider configured. Please configure SMTP or Resend credentials in Settings. Simulated outreach delivery is disabled to preserve operational integrity.',
      });
    }

    let sentCount = 0;
    let failedCount = 0;

    for (const item of allowed) {
      const outcome = await sendOutreachEmail({
        recipient: item,
        subject: item.personalizedSubject || camp.templateSubject,
        body: item.personalizedBody || camp.templateBody,
      });

      if (outcome.success) {
        item.status = 'sent';
        item.providerMessageId = outcome.providerMessageId;
        item.sentAt = new Date().toISOString();
        sentCount++;
      } else {
        item.status = 'failed';
        item.errorReason = outcome.error;
        failedCount++;
      }
    }

    camp.stats.sent = (camp.stats.sent || 0) + sentCount;
    camp.stats.delivered = (camp.stats.delivered || 0) + sentCount;
    camp.stats.suppressed = (camp.stats.suppressed || 0) + blocked.length;
    camp.status = 'completed';

    await repository.saveCampaign(req.workspaceId, camp);
    await repository.logAudit(
      req.workspaceId,
      'SEND_CAMPAIGN',
      'Campaign',
      camp.id,
      `Real outbound email dispatch: ${sentCount} accepted by provider, ${failedCount} failed, ${blocked.length} suppressed.`
    );

    res.json({
      success: true,
      sent: sentCount,
      failed: failedCount,
      blocked: blocked.length,
      provider: emailConfig.provider,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Research Projects & Report History
app.get('/api/projects', async (req: any, res) => {
  try {
    const projects = await repository.getProjects(req.workspaceId);
    res.json(projects);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Reports Generation & Download
app.get('/api/reports', async (req: any, res) => {
  try {
    const reports = await repository.getReports(req.workspaceId);
    res.json(reports);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reports/generate', async (req: any, res) => {
  try {
    const { projectId, title, fileType } = req.body;
    const format = fileType || 'pdf';
    const reportTitle = title || `Market Research Intelligence Dossier — ${new Date().toISOString().split('T')[0]}`;
    const reportId = `rep_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // Gather live workspace data
    const apps = await repository.getApplications(req.workspaceId);
    const reviews = await repository.getReviews(req.workspaceId);
    const themes = await repository.getComplaintThemes(req.workspaceId);
    const opportunities = await repository.getOpportunities(req.workspaceId);
    const prospects = await repository.getContacts(req.workspaceId);
    const projects = await repository.getProjects(req.workspaceId);
    const project = projectId ? projects.find((p) => p.id === projectId) : undefined;

    const reportData = {
      title: reportTitle,
      project,
      apps,
      reviews,
      themes,
      opportunities,
      prospects,
    };

    let filename = `${reportId}.${format}`;
    let filePath = path.join(reportsDir, filename);
    let fileSize = 0;

    if (format === 'pdf') {
      fileSize = await generateResearchPdf(reportData, filePath);
    } else if (format === 'xlsx') {
      fileSize = generateResearchXlsx(reportData, filePath);
    } else {
      // CSV
      const csvStr = jsonToCsv(reviews, [
        { key: 'id', header: 'Review ID' },
        { key: 'appName', header: 'App Name' },
        { key: 'marketplace', header: 'Marketplace' },
        { key: 'starRating', header: 'Star Rating' },
        { key: 'reviewDate', header: 'Review Date' },
        { key: 'text', header: 'Review Text' },
        { key: 'appVersion', header: 'App Version' },
        { key: 'helpfulVotes', header: 'Helpful Votes' },
      ]);
      fs.writeFileSync(filePath, csvStr, 'utf8');
      fileSize = fs.statSync(filePath).size;
    }

    const downloadUrl = `/api/reports/${reportId}/download`;
    const record: ReportRecord = {
      id: reportId,
      workspaceId: req.workspaceId,
      projectId,
      title: reportTitle,
      fileType: format as any,
      filePath,
      fileSize,
      status: 'completed',
      downloadUrl,
      generatedAt: new Date().toISOString(),
    };

    await repository.saveReport(req.workspaceId, record);
    res.json({ report: record });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reports/:id/download', async (req: any, res) => {
  try {
    const reports = await repository.getReports(req.workspaceId);
    const report = reports.find((r) => r.id === req.params.id);
    if (!report || !fs.existsSync(report.filePath)) {
      return res.status(404).json({ error: 'Report file not found or unauthorized' });
    }

    const ext = report.fileType === 'pdf' ? 'pdf' : (report.fileType === 'xlsx' ? 'xlsx' : 'csv');
    const contentType = 
      report.fileType === 'pdf' ? 'application/pdf' :
      (report.fileType === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv');

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${report.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.${ext}"`);
    res.sendFile(report.filePath);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 10. Settings & Integration Health
app.get('/api/settings', async (req: any, res) => {
  try {
    const statuses = await connectorRegistry.getAllStatuses();
    const hasAiKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY');
    const emailConfig = getEmailProviderConfig();
    const suppressionList = await repository.getSuppressionList(req.workspaceId);

    res.json({
      workspaceId: req.workspaceId,
      workspaceName: 'Main Production Workspace',
      databaseEngine: db.getEngineName(),
      databaseActive: true,
      aiModel: 'gemini-3.8-flash',
      aiStatus: hasAiKey ? 'active' : 'deterministic_fallback',
      connectors: statuses,
      emailProvider: emailConfig.provider === 'unconfigured' 
        ? 'Unconfigured (SMTP or Resend required)' 
        : `${emailConfig.provider.toUpperCase()} Active`,
      emailDeliveryReady: emailConfig.isReady,
      dataRetentionDays: 90,
      suppressionCount: suppressionList.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 11. Legacy Data Export (Reviews / Opportunities / Contacts)
app.get('/api/export', async (req: any, res) => {
  try {
    const { type, format } = req.query;
    const isJson = format === 'json';

    if (type === 'reviews') {
      const reviews = await repository.getReviews(req.workspaceId);
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
      ]);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="apppulse_reviews.csv"');
      return res.send(csv);
    }

    if (type === 'opportunities') {
      const opps = await repository.getOpportunities(req.workspaceId);
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
        { key: 'status', header: 'Validation Status' },
      ]);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="apppulse_opportunities.csv"');
      return res.send(csv);
    }

    if (type === 'contacts') {
      const contacts = await repository.getContacts(req.workspaceId);
      if (isJson) {
        res.setHeader('Content-Disposition', 'attachment; filename="apppulse_contacts.json"');
        return res.json(contacts);
      }
      const csv = jsonToCsv(contacts, [
        { key: 'name', header: 'Contact Name' },
        { key: 'title', header: 'Title' },
        { key: 'company', header: 'Company' },
        { key: 'email', header: 'Email' },
        { key: 'channel', header: 'Channel' },
        { key: 'status', header: 'Status' },
        { key: 'verifiedSource', header: 'Verified Source' },
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

// --- VITE DEV & PRODUCTION SERVER ---

async function startServer() {
  // 1. Run migrations and initialize database
  await runMigrations();
  await repository.initAndSeedIfEmpty();

  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
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
    console.log(`[AppPulse Server] Running on http://0.0.0.0:${PORT} (${db.getEngineName()})`);
  });
}

startServer().catch((err) => {
  console.error('[AppPulse Server] Fatal startup error:', err);
  process.exit(1);
});
