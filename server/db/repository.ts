import { db } from './database.ts';
import { 
  Application, 
  Review, 
  ComplaintTheme, 
  Opportunity, 
  CollectionJob, 
  Contact, 
  Campaign, 
  SuppressionRecord, 
  ResearchProject, 
  AuditLog, 
  SystemStats, 
  User, 
  Workspace, 
  ReportRecord, 
  IntegrationSetting,
  Marketplace
} from '../../src/types.ts';
import { generateReviewFingerprint } from '../../src/lib/dedup.ts';
import { SEED_APPS, getSeedReviews, SEED_THEMES, getSeedOpportunities, SEED_CONTACTS, SEED_CAMPAIGNS, SEED_SUPPRESSION, SEED_PROJECTS } from '../seedData.ts';
import crypto from 'crypto';

export class AppPulseRepository {
  private defaultWorkspaceId = 'ws_default';

  async initAndSeedIfEmpty(): Promise<void> {
    const existingApps = await db.query('SELECT count(*) as count FROM applications');
    const count = Number(existingApps[0]?.count || 0);

    if (count === 0) {
      console.log('[Repository] Database empty, seeding initial demo records with isDemo=true and provenance="seed"...');
      await this.seedInitialData();
    }
  }

  private async seedInitialData(): Promise<void> {
    const wsId = this.defaultWorkspaceId;
    const now = new Date().toISOString();

    await db.transaction(async () => {
      // 1. Seed Apps
      for (const app of SEED_APPS) {
        await db.execute(
          `INSERT INTO applications (
            id, workspace_id, name, icon_url, publisher, marketplace, description, 
            category, rating, rating_count, review_count, platform, release_date, 
            last_updated, current_version, update_frequency, store_url, collection_available, 
            status, tags_json, is_demo, provenance, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
          ON CONFLICT(id) DO NOTHING`,
          [
            app.id, wsId, app.name, app.iconUrl || '', app.publisher, app.marketplace, app.description,
            app.category, app.rating, app.ratingCount, app.reviewCount, app.platform, app.releaseDate,
            app.lastUpdated, app.currentVersion, app.updateFrequency, app.storeUrl, app.collectionAvailable ? 1 : 0,
            app.status, JSON.stringify(app.tags || []), 1, 'seed', now
          ]
        );
      }

      // 2. Seed Reviews
      const seedReviews = getSeedReviews();
      for (const r of seedReviews) {
        const fp = r.fingerprint || generateReviewFingerprint(r.appId, r.text, r.starRating, r.reviewDate);
        await db.execute(
          `INSERT INTO reviews (
            id, workspace_id, app_id, app_name, marketplace, text, star_rating, 
            review_date, language, review_url, helpful_votes, app_version, collected_at, 
            fingerprint, classification_json, notes, saved_to_collection, tag_list_json, 
            provenance, source_record_id, source_url, is_demo
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
          ON CONFLICT(fingerprint) DO NOTHING`,
          [
            r.id, wsId, r.appId, r.appName, r.marketplace, r.text, r.starRating,
            r.reviewDate, r.language || 'en', r.reviewUrl || '', r.helpfulVotes || 0, r.appVersion || '', r.collectedAt || now,
            fp, JSON.stringify(r.classification || {}), r.notes || '', r.savedToCollection ? 1 : 0, JSON.stringify(r.tagList || []),
            'seed', r.id, r.reviewUrl || '', 1
          ]
        );
      }

      // 3. Seed Complaint Themes
      for (const t of SEED_THEMES) {
        // Link to actual seed reviews for affected apps
        const matchingReviews = seedReviews.filter((r) => t.affectedApps.includes(r.appId));
        const evidenceReviewIds = matchingReviews.slice(0, 5).map((r) => r.id);

        await db.execute(
          `INSERT INTO complaint_themes (
            id, workspace_id, title, category, summary, review_count, affected_apps_json, 
            affected_app_names_json, representative_quotes_json, earliest_date, latest_date, 
            severity, confidence_score, potential_improvement, validation_hypothesis, 
            validation_steps_json, trend, evidence_review_ids_json, is_demo, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
          ON CONFLICT(id) DO NOTHING`,
          [
            t.id, wsId, t.title, t.category, t.summary, t.reviewCount, JSON.stringify(t.affectedApps),
            JSON.stringify(t.affectedAppNames), JSON.stringify(t.representativeQuotes), t.earliestDate, t.latestDate,
            t.severity, t.confidenceScore || 0.85, t.potentialImprovement, t.validationHypothesis,
            JSON.stringify(t.validationSteps || []), t.trend || 'stable', JSON.stringify(evidenceReviewIds), 1, t.createdAt || now
          ]
        );
      }

      // 4. Seed Opportunities
      const seedOpps = getSeedOpportunities();
      for (const o of seedOpps) {
        await db.execute(
          `INSERT INTO opportunities (
            id, workspace_id, title, problem_statement, target_user, supporting_app_ids_json, 
            supporting_app_names_json, supporting_review_ids_json, complaint_frequency, severity, 
            existing_solutions, proposed_concept, differentiation_hypothesis, validation_questions_json, 
            next_steps_json, priority_score, score_breakdown_json, tags_json, status, 
            evidence_strength, confidence_score, is_estimate, validation_step, is_demo, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
          ON CONFLICT(id) DO NOTHING`,
          [
            o.id, wsId, o.title, o.problemStatement, o.targetUser, JSON.stringify(o.supportingAppIds),
            JSON.stringify(o.supportingAppNames), JSON.stringify(o.supportingReviewIds), o.complaintFrequency, o.severity,
            o.existingSolutions, o.proposedConcept, o.differentiationHypothesis, JSON.stringify(o.validationQuestions || []),
            JSON.stringify(o.nextSteps || []), o.priorityScore, JSON.stringify(o.scoreBreakdown || {}), JSON.stringify(o.tags || []),
            o.status, 'High', 0.88, 1, 'Conduct 5 user discovery interviews with affected accountants', 1, o.createdAt || now
          ]
        );
      }

      // 5. Seed Contacts
      for (const c of SEED_CONTACTS) {
        await db.execute(
          `INSERT INTO contacts (
            id, workspace_id, name, title, company, email, phone, website, channel, 
            source_url, app_id, app_name, opportunity_id, status, consent_basis, notes, 
            verified_source, is_verified, confidence, is_demo, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
          ON CONFLICT(id) DO NOTHING`,
          [
            c.id, wsId, c.name, c.title, c.company, c.email, c.phone || '', c.website || '', c.channel,
            c.sourceUrl, c.appId || '', c.appName || '', c.opportunityId || '', c.status, c.consentBasis, c.notes || '',
            'Public Verified Publisher Contact Page', 1, 0.95, 1, c.createdAt || now
          ]
        );
      }

      // 6. Seed Suppression
      for (const s of SEED_SUPPRESSION) {
        await db.execute(
          `INSERT INTO suppression (id, workspace_id, email_or_domain, reason, created_at)
           VALUES ($1, $2, $3, $4, $5) ON CONFLICT(id) DO NOTHING`,
          [s.id, wsId, s.emailOrDomain, s.reason, s.createdAt || now]
        );
      }

      // 7. Seed Campaigns
      for (const camp of SEED_CAMPAIGNS) {
        await db.execute(
          `INSERT INTO campaigns (
            id, workspace_id, name, objective, tone, target_category, template_subject, 
            template_body, recipients_json, status, stats_json, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT(id) DO NOTHING`,
          [
            camp.id, wsId, camp.name, camp.objective, camp.tone, camp.targetCategory,
            camp.templateSubject, camp.templateBody, JSON.stringify(camp.recipients || []),
            camp.status, JSON.stringify(camp.stats || {}), camp.createdAt || now
          ]
        );
      }

      // 8. Seed Research Projects
      for (const proj of SEED_PROJECTS) {
        await db.execute(
          `INSERT INTO research_projects (
            id, workspace_id, name, description, saved_app_ids_json, saved_review_ids_json, 
            saved_theme_ids_json, saved_opportunity_ids_json, notes, tags_json, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT(id) DO NOTHING`,
          [
            proj.id, wsId, proj.name, proj.description, JSON.stringify(proj.savedAppIds || []),
            JSON.stringify(proj.savedReviewIds || []), JSON.stringify(proj.savedThemeIds || []),
            JSON.stringify(proj.savedOpportunityIds || []), proj.notes || '', JSON.stringify(proj.tags || []),
            proj.createdAt || now, proj.updatedAt || now
          ]
        );
      }

      console.log('[Repository] Seed records created with clear isDemo=1 provenance.');
    });
  }

  // ---------------- WORKSPACES & USERS ----------------

  async getWorkspaces(): Promise<Workspace[]> {
    const rows = await db.query('SELECT * FROM workspaces ORDER BY created_at ASC');
    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      createdAt: r.created_at,
    }));
  }

  async getWorkspaceById(id: string): Promise<Workspace | null> {
    const rows = await db.query('SELECT * FROM workspaces WHERE id = $1', [id]);
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      createdAt: r.created_at,
    };
  }

  async getUserByEmail(email: string): Promise<any | null> {
    const rows = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    return rows[0] || null;
  }

  async getUserById(id: string): Promise<User | null> {
    const rows = await db.query('SELECT id, email, name, role, created_at FROM users WHERE id = $1', [id]);
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      email: r.email,
      name: r.name,
      role: r.role,
      createdAt: r.created_at,
    };
  }

  async createUser(user: { id: string; email: string; passwordHash: string; name: string; role?: string }): Promise<User> {
    const now = new Date().toISOString();
    await db.execute(
      'INSERT INTO users (id, email, password_hash, name, role, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [user.id, user.email.toLowerCase().trim(), user.passwordHash, user.name, user.role || 'member', now]
    );

    // Add user to default workspace
    await db.execute(
      'INSERT INTO workspace_members (workspace_id, user_id, role, joined_at) VALUES ($1, $2, $3, $4)',
      [this.defaultWorkspaceId, user.id, user.role || 'member', now]
    );

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: (user.role as any) || 'member',
      createdAt: now,
    };
  }

  async createSession(userId: string, workspaceId: string): Promise<string> {
    const token = `sess_${crypto.randomBytes(24).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days
    const now = new Date().toISOString();

    await db.execute(
      'INSERT INTO sessions (token, user_id, workspace_id, expires_at, created_at) VALUES ($1, $2, $3, $4, $5)',
      [token, userId, workspaceId, expiresAt, now]
    );
    return token;
  }

  async validateSession(token: string): Promise<{ user: User; workspaceId: string } | null> {
    const rows = await db.query(
      `SELECT s.workspace_id, u.id, u.email, u.name, u.role, u.created_at, s.expires_at 
       FROM sessions s 
       JOIN users u ON s.user_id = u.id 
       WHERE s.token = $1`,
      [token]
    );

    if (rows.length === 0) return null;
    const r = rows[0];

    // Check expiration
    if (new Date(r.expires_at).getTime() < Date.now()) {
      await db.execute('DELETE FROM sessions WHERE token = $1', [token]);
      return null;
    }

    return {
      workspaceId: r.workspace_id,
      user: {
        id: r.id,
        email: r.email,
        name: r.name,
        role: r.role,
        createdAt: r.created_at,
      },
    };
  }

  async deleteSession(token: string): Promise<void> {
    await db.execute('DELETE FROM sessions WHERE token = $1', [token]);
  }

  // ---------------- APPLICATIONS ----------------

  async getApplications(workspaceId: string): Promise<Application[]> {
    const rows = await db.query(
      'SELECT * FROM applications WHERE workspace_id = $1 ORDER BY rating_count DESC',
      [workspaceId]
    );

    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      iconUrl: r.icon_url,
      publisher: r.publisher,
      marketplace: r.marketplace as Marketplace,
      description: r.description,
      category: r.category,
      rating: r.rating,
      ratingCount: r.rating_count,
      reviewCount: r.review_count,
      platform: r.platform,
      releaseDate: r.release_date,
      lastUpdated: r.last_updated,
      currentVersion: r.current_version,
      updateFrequency: r.update_frequency,
      storeUrl: r.store_url,
      collectionAvailable: Boolean(r.collection_available),
      status: r.status,
      tags: JSON.parse(r.tags_json || '[]'),
      isDemo: Boolean(r.is_demo),
      provenance: r.provenance,
    }));
  }

  async getApplicationById(workspaceId: string, appId: string): Promise<Application | null> {
    const rows = await db.query(
      'SELECT * FROM applications WHERE workspace_id = $1 AND id = $2',
      [workspaceId, appId]
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      name: r.name,
      iconUrl: r.icon_url,
      publisher: r.publisher,
      marketplace: r.marketplace as Marketplace,
      description: r.description,
      category: r.category,
      rating: r.rating,
      ratingCount: r.rating_count,
      reviewCount: r.review_count,
      platform: r.platform,
      releaseDate: r.release_date,
      lastUpdated: r.last_updated,
      currentVersion: r.current_version,
      updateFrequency: r.update_frequency,
      storeUrl: r.store_url,
      collectionAvailable: Boolean(r.collection_available),
      status: r.status,
      tags: JSON.parse(r.tags_json || '[]'),
      isDemo: Boolean(r.is_demo),
      provenance: r.provenance,
    };
  }

  async saveApplication(workspaceId: string, app: Application): Promise<Application> {
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO applications (
        id, workspace_id, name, icon_url, publisher, marketplace, description, 
        category, rating, rating_count, review_count, platform, release_date, 
        last_updated, current_version, update_frequency, store_url, collection_available, 
        status, tags_json, is_demo, provenance, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        icon_url = excluded.icon_url,
        publisher = excluded.publisher,
        rating = excluded.rating,
        rating_count = excluded.rating_count,
        review_count = excluded.review_count,
        last_updated = excluded.last_updated,
        current_version = excluded.current_version,
        store_url = excluded.store_url,
        tags_json = excluded.tags_json`,
      [
        app.id, workspaceId, app.name, app.iconUrl || '', app.publisher, app.marketplace, app.description || '',
        app.category, app.rating, app.ratingCount, app.reviewCount, app.platform, app.releaseDate,
        app.lastUpdated, app.currentVersion, app.updateFrequency, app.storeUrl, app.collectionAvailable ? 1 : 0,
        app.status, JSON.stringify(app.tags || []), app.isDemo ? 1 : 0, app.provenance || 'live', now
      ]
    );
    return app;
  }

  // ---------------- REVIEWS ----------------

  async getReviews(workspaceId: string, options?: { appId?: string; marketplace?: string; negativeOnly?: boolean }): Promise<Review[]> {
    let sql = 'SELECT * FROM reviews WHERE workspace_id = $1';
    const params: any[] = [workspaceId];

    if (options?.appId) {
      params.push(options.appId);
      sql += ` AND app_id = $${params.length}`;
    }
    if (options?.marketplace) {
      params.push(options.marketplace);
      sql += ` AND marketplace = $${params.length}`;
    }
    if (options?.negativeOnly) {
      sql += ' AND star_rating <= 2';
    }

    sql += ' ORDER BY review_date DESC';

    const rows = await db.query(sql, params);
    return rows.map((r: any) => ({
      id: r.id,
      appId: r.app_id,
      appName: r.app_name,
      marketplace: r.marketplace as Marketplace,
      text: r.text,
      starRating: r.star_rating,
      reviewDate: r.review_date,
      language: r.language,
      reviewUrl: r.review_url,
      helpfulVotes: r.helpful_votes,
      appVersion: r.app_version,
      collectedAt: r.collected_at,
      fingerprint: r.fingerprint,
      classification: r.classification_json ? JSON.parse(r.classification_json) : undefined,
      notes: r.notes,
      savedToCollection: Boolean(r.saved_to_collection),
      tagList: JSON.parse(r.tag_list_json || '[]'),
      provenance: r.provenance,
      sourceRecordId: r.source_record_id,
      sourceUrl: r.source_url,
      isDemo: Boolean(r.is_demo),
    }));
  }

  async saveReviews(workspaceId: string, incomingReviews: Omit<Review, 'fingerprint'>[]): Promise<{ inserted: number; duplicates: number }> {
    let inserted = 0;
    let duplicates = 0;

    for (const r of incomingReviews) {
      const fp = generateReviewFingerprint(r.appId, r.text, r.starRating, r.reviewDate);
      const res = await db.execute(
        `INSERT INTO reviews (
          id, workspace_id, app_id, app_name, marketplace, text, star_rating, 
          review_date, language, review_url, helpful_votes, app_version, collected_at, 
          fingerprint, classification_json, notes, saved_to_collection, tag_list_json, 
          provenance, source_record_id, source_url, is_demo
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
        ON CONFLICT(fingerprint) DO NOTHING`,
        [
          r.id, workspaceId, r.appId, r.appName, r.marketplace, r.text, r.starRating,
          r.reviewDate, r.language || 'en', r.reviewUrl || '', r.helpfulVotes || 0, r.appVersion || '', r.collectedAt || new Date().toISOString(),
          fp, JSON.stringify(r.classification || {}), r.notes || '', r.savedToCollection ? 1 : 0, JSON.stringify(r.tagList || []),
          r.provenance || 'live', r.sourceRecordId || r.id, r.sourceUrl || '', r.isDemo ? 1 : 0
        ]
      );

      if (res.rowCount > 0) {
        inserted++;
      } else {
        duplicates++;
      }
    }

    return { inserted, duplicates };
  }

  // ---------------- COMPLAINT THEMES ----------------

  async getComplaintThemes(workspaceId: string): Promise<ComplaintTheme[]> {
    const rows = await db.query(
      'SELECT * FROM complaint_themes WHERE workspace_id = $1 ORDER BY review_count DESC',
      [workspaceId]
    );

    return rows.map((r: any) => ({
      id: r.id,
      title: r.title,
      category: r.category,
      summary: r.summary,
      reviewCount: r.review_count,
      affectedApps: JSON.parse(r.affected_apps_json || '[]'),
      affectedAppNames: JSON.parse(r.affected_app_names_json || '[]'),
      representativeQuotes: JSON.parse(r.representative_quotes_json || '[]'),
      earliestDate: r.earliest_date,
      latestDate: r.latest_date,
      severity: r.severity,
      confidenceScore: r.confidence_score,
      potentialImprovement: r.potential_improvement,
      validationHypothesis: r.validation_hypothesis,
      validationSteps: JSON.parse(r.validation_steps_json || '[]'),
      trend: r.trend,
      evidenceReviewIds: JSON.parse(r.evidence_review_ids_json || '[]'),
      isDemo: Boolean(r.is_demo),
      createdAt: r.created_at,
    }));
  }

  async saveComplaintTheme(workspaceId: string, theme: ComplaintTheme): Promise<ComplaintTheme> {
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO complaint_themes (
        id, workspace_id, title, category, summary, review_count, affected_apps_json, 
        affected_app_names_json, representative_quotes_json, earliest_date, latest_date, 
        severity, confidence_score, potential_improvement, validation_hypothesis, 
        validation_steps_json, trend, evidence_review_ids_json, is_demo, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        summary = excluded.summary,
        review_count = excluded.review_count,
        affected_apps_json = excluded.affected_apps_json,
        affected_app_names_json = excluded.affected_app_names_json,
        representative_quotes_json = excluded.representative_quotes_json,
        evidence_review_ids_json = excluded.evidence_review_ids_json,
        severity = excluded.severity,
        confidence_score = excluded.confidence_score`,
      [
        theme.id, workspaceId, theme.title, theme.category, theme.summary, theme.reviewCount,
        JSON.stringify(theme.affectedApps || []), JSON.stringify(theme.affectedAppNames || []),
        JSON.stringify(theme.representativeQuotes || []), theme.earliestDate, theme.latestDate,
        theme.severity, theme.confidenceScore || 0.85, theme.potentialImprovement, theme.validationHypothesis,
        JSON.stringify(theme.validationSteps || []), theme.trend || 'stable',
        JSON.stringify(theme.evidenceReviewIds || []), theme.isDemo ? 1 : 0, theme.createdAt || now
      ]
    );
    return theme;
  }

  // ---------------- OPPORTUNITIES ----------------

  async getOpportunities(workspaceId: string): Promise<Opportunity[]> {
    const rows = await db.query(
      'SELECT * FROM opportunities WHERE workspace_id = $1 ORDER BY priority_score DESC',
      [workspaceId]
    );

    return rows.map((r: any) => ({
      id: r.id,
      title: r.title,
      problemStatement: r.problem_statement,
      targetUser: r.target_user,
      supportingAppIds: JSON.parse(r.supporting_app_ids_json || '[]'),
      supportingAppNames: JSON.parse(r.supporting_app_names_json || '[]'),
      supportingReviewIds: JSON.parse(r.supporting_review_ids_json || '[]'),
      complaintFrequency: r.complaint_frequency,
      severity: r.severity,
      existingSolutions: r.existing_solutions,
      proposedConcept: r.proposed_concept,
      differentiationHypothesis: r.differentiation_hypothesis,
      validationQuestions: JSON.parse(r.validation_questions_json || '[]'),
      nextSteps: JSON.parse(r.next_steps_json || '[]'),
      priorityScore: r.priority_score,
      scoreBreakdown: JSON.parse(r.score_breakdown_json || '{}'),
      tags: JSON.parse(r.tags_json || '[]'),
      status: r.status,
      evidenceStrength: r.evidence_strength,
      confidenceScore: r.confidence_score,
      isEstimate: Boolean(r.is_estimate),
      validationStep: r.validation_step,
      isDemo: Boolean(r.is_demo),
      createdAt: r.created_at,
    }));
  }

  async saveOpportunity(workspaceId: string, opp: Opportunity): Promise<Opportunity> {
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO opportunities (
        id, workspace_id, title, problem_statement, target_user, supporting_app_ids_json, 
        supporting_app_names_json, supporting_review_ids_json, complaint_frequency, severity, 
        existing_solutions, proposed_concept, differentiation_hypothesis, validation_questions_json, 
        next_steps_json, priority_score, score_breakdown_json, tags_json, status, 
        evidence_strength, confidence_score, is_estimate, validation_step, is_demo, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        problem_statement = excluded.problem_statement,
        target_user = excluded.target_user,
        supporting_app_ids_json = excluded.supporting_app_ids_json,
        supporting_app_names_json = excluded.supporting_app_names_json,
        supporting_review_ids_json = excluded.supporting_review_ids_json,
        proposed_concept = excluded.proposed_concept,
        priority_score = excluded.priority_score,
        score_breakdown_json = excluded.score_breakdown_json,
        status = excluded.status`,
      [
        opp.id, workspaceId, opp.title, opp.problemStatement, opp.targetUser,
        JSON.stringify(opp.supportingAppIds || []), JSON.stringify(opp.supportingAppNames || []),
        JSON.stringify(opp.supportingReviewIds || []), opp.complaintFrequency, opp.severity,
        opp.existingSolutions, opp.proposedConcept, opp.differentiationHypothesis,
        JSON.stringify(opp.validationQuestions || []), JSON.stringify(opp.nextSteps || []),
        opp.priorityScore, JSON.stringify(opp.scoreBreakdown || {}), JSON.stringify(opp.tags || []),
        opp.status, opp.evidenceStrength || 'Medium', opp.confidenceScore || 0.85, opp.isEstimate ? 1 : 0,
        opp.validationStep || '', opp.isDemo ? 1 : 0, opp.createdAt || now
      ]
    );
    return opp;
  }

  // ---------------- COLLECTION JOBS (DURABLE) ----------------

  async getJobs(workspaceId: string): Promise<CollectionJob[]> {
    const rows = await db.query(
      'SELECT * FROM collection_jobs WHERE workspace_id = $1 ORDER BY started_at DESC LIMIT 50',
      [workspaceId]
    );

    return rows.map((r: any) => ({
      id: r.id,
      workspaceId: r.workspace_id,
      appId: r.app_id,
      appName: r.app_name,
      marketplace: r.marketplace as Marketplace,
      status: r.status,
      progress: r.progress,
      collectedCount: r.collected_count,
      deduplicatedCount: r.deduplicated_count,
      error: r.error_message,
      retryCount: r.retry_count,
      startedAt: r.started_at,
      completedAt: r.completed_at,
    }));
  }

  async getJobById(workspaceId: string, jobId: string): Promise<CollectionJob | null> {
    const rows = await db.query(
      'SELECT * FROM collection_jobs WHERE workspace_id = $1 AND id = $2',
      [workspaceId, jobId]
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      workspaceId: r.workspace_id,
      appId: r.app_id,
      appName: r.app_name,
      marketplace: r.marketplace as Marketplace,
      status: r.status,
      progress: r.progress,
      collectedCount: r.collected_count,
      deduplicatedCount: r.deduplicated_count,
      error: r.error_message,
      retryCount: r.retry_count,
      startedAt: r.started_at,
      completedAt: r.completed_at,
    };
  }

  async createJob(workspaceId: string, job: CollectionJob): Promise<CollectionJob> {
    await db.execute(
      `INSERT INTO collection_jobs (
        id, workspace_id, app_id, app_name, marketplace, status, progress, 
        collected_count, deduplicated_count, error_message, retry_count, started_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        job.id, workspaceId, job.appId, job.appName, job.marketplace, job.status,
        job.progress, job.collectedCount, job.deduplicatedCount, job.error || '',
        job.retryCount || 0, job.startedAt
      ]
    );
    return job;
  }

  async updateJob(workspaceId: string, job: CollectionJob): Promise<void> {
    await db.execute(
      `UPDATE collection_jobs SET 
        status = $1, 
        progress = $2, 
        collected_count = $3, 
        deduplicated_count = $4, 
        error_message = $5, 
        retry_count = $6, 
        completed_at = $7 
       WHERE workspace_id = $8 AND id = $9`,
      [
        job.status, job.progress, job.collectedCount, job.deduplicatedCount,
        job.error || '', job.retryCount || 0, job.completedAt || null, workspaceId, job.id
      ]
    );
  }

  async cancelJob(workspaceId: string, jobId: string): Promise<boolean> {
    const res = await db.execute(
      `UPDATE collection_jobs SET status = 'cancelled', completed_at = $1 
       WHERE workspace_id = $2 AND id = $3 AND status IN ('queued', 'running')`,
      [new Date().toISOString(), workspaceId, jobId]
    );
    return res.rowCount > 0;
  }

  // ---------------- CONTACTS & SUPPRESSION ----------------

  async getContacts(workspaceId: string): Promise<Contact[]> {
    const rows = await db.query(
      'SELECT * FROM contacts WHERE workspace_id = $1 ORDER BY created_at DESC',
      [workspaceId]
    );

    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      title: r.title,
      company: r.company,
      email: r.email,
      phone: r.phone,
      website: r.website,
      channel: r.channel,
      sourceUrl: r.source_url,
      appId: r.app_id,
      appName: r.app_name,
      opportunityId: r.opportunity_id,
      status: r.status,
      consentBasis: r.consent_basis,
      notes: r.notes,
      verifiedSource: r.verified_source,
      isVerified: Boolean(r.is_verified),
      confidence: r.confidence,
      isDemo: Boolean(r.is_demo),
      createdAt: r.created_at,
    }));
  }

  async saveContact(workspaceId: string, contact: Contact): Promise<Contact> {
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO contacts (
        id, workspace_id, name, title, company, email, phone, website, channel, 
        source_url, app_id, app_name, opportunity_id, status, consent_basis, notes, 
        verified_source, is_verified, confidence, is_demo, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        title = excluded.title,
        company = excluded.company,
        email = excluded.email,
        status = excluded.status,
        notes = excluded.notes`,
      [
        contact.id, workspaceId, contact.name, contact.title, contact.company, contact.email,
        contact.phone || '', contact.website || '', contact.channel, contact.sourceUrl,
        contact.appId || '', contact.appName || '', contact.opportunityId || '', contact.status,
        contact.consentBasis, contact.notes || '', contact.verifiedSource || 'Verified B2B Directory',
        contact.isVerified ? 1 : 0, contact.confidence || 0.9, contact.isDemo ? 1 : 0, contact.createdAt || now
      ]
    );
    return contact;
  }

  async getSuppressionList(workspaceId: string): Promise<SuppressionRecord[]> {
    const rows = await db.query(
      'SELECT * FROM suppression WHERE workspace_id = $1 ORDER BY created_at DESC',
      [workspaceId]
    );
    return rows.map((r: any) => ({
      id: r.id,
      emailOrDomain: r.email_or_domain,
      reason: r.reason,
      createdAt: r.created_at,
    }));
  }

  async addSuppression(workspaceId: string, item: string, reason: SuppressionRecord['reason'] = 'manual_suppression'): Promise<SuppressionRecord> {
    const id = `sup_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();
    const clean = item.trim().toLowerCase();

    await db.execute(
      'INSERT INTO suppression (id, workspace_id, email_or_domain, reason, created_at) VALUES ($1, $2, $3, $4, $5)',
      [id, workspaceId, clean, reason, now]
    );

    return { id, emailOrDomain: clean, reason, createdAt: now };
  }

  // ---------------- CAMPAIGNS ----------------

  async getCampaigns(workspaceId: string): Promise<Campaign[]> {
    const rows = await db.query(
      'SELECT * FROM campaigns WHERE workspace_id = $1 ORDER BY created_at DESC',
      [workspaceId]
    );

    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      objective: r.objective,
      tone: r.tone,
      targetCategory: r.target_category,
      templateSubject: r.template_subject,
      templateBody: r.template_body,
      recipients: JSON.parse(r.recipients_json || '[]'),
      status: r.status,
      stats: JSON.parse(r.stats_json || '{}'),
      createdAt: r.created_at,
    }));
  }

  async saveCampaign(workspaceId: string, campaign: Campaign): Promise<Campaign> {
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO campaigns (
        id, workspace_id, name, objective, tone, target_category, template_subject, 
        template_body, recipients_json, status, stats_json, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        template_subject = excluded.template_subject,
        template_body = excluded.template_body,
        recipients_json = excluded.recipients_json,
        status = excluded.status,
        stats_json = excluded.stats_json`,
      [
        campaign.id, workspaceId, campaign.name, campaign.objective, campaign.tone,
        campaign.targetCategory, campaign.templateSubject, campaign.templateBody,
        JSON.stringify(campaign.recipients || []), campaign.status, JSON.stringify(campaign.stats || {}),
        campaign.createdAt || now
      ]
    );
    return campaign;
  }

  // ---------------- RESEARCH PROJECTS & REPORTS ----------------

  async getProjects(workspaceId: string): Promise<ResearchProject[]> {
    const rows = await db.query(
      'SELECT * FROM research_projects WHERE workspace_id = $1 ORDER BY updated_at DESC',
      [workspaceId]
    );

    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      savedAppIds: JSON.parse(r.saved_app_ids_json || '[]'),
      savedReviewIds: JSON.parse(r.saved_review_ids_json || '[]'),
      savedThemeIds: JSON.parse(r.saved_theme_ids_json || '[]'),
      savedOpportunityIds: JSON.parse(r.saved_opportunity_ids_json || '[]'),
      notes: r.notes,
      tags: JSON.parse(r.tags_json || '[]'),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  async getReports(workspaceId: string): Promise<ReportRecord[]> {
    const rows = await db.query(
      'SELECT * FROM reports WHERE workspace_id = $1 ORDER BY generated_at DESC',
      [workspaceId]
    );

    return rows.map((r: any) => ({
      id: r.id,
      workspaceId: r.workspace_id,
      projectId: r.project_id,
      title: r.title,
      fileType: r.file_type as any,
      filePath: r.file_path,
      fileSize: r.file_size,
      status: r.status as any,
      downloadUrl: r.download_url,
      generatedAt: r.generated_at,
    }));
  }

  async saveReport(workspaceId: string, report: ReportRecord): Promise<ReportRecord> {
    await db.execute(
      `INSERT INTO reports (
        id, workspace_id, project_id, title, file_type, file_path, file_size, status, download_url, generated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        report.id, workspaceId, report.projectId || '', report.title, report.fileType,
        report.filePath, report.fileSize, report.status, report.downloadUrl, report.generatedAt
      ]
    );
    return report;
  }

  // ---------------- STATS ----------------

  async getStats(workspaceId: string): Promise<SystemStats> {
    const appsRow = await db.query('SELECT count(*) as c FROM applications WHERE workspace_id = $1', [workspaceId]);
    const reviewsRow = await db.query('SELECT count(*) as c FROM reviews WHERE workspace_id = $1', [workspaceId]);
    const negReviewsRow = await db.query('SELECT count(*) as c FROM reviews WHERE workspace_id = $1 AND star_rating <= 2', [workspaceId]);
    const themesRow = await db.query('SELECT count(*) as c FROM complaint_themes WHERE workspace_id = $1', [workspaceId]);
    const oppsRow = await db.query('SELECT count(*) as c FROM opportunities WHERE workspace_id = $1', [workspaceId]);
    const contactsRow = await db.query('SELECT count(*) as c FROM contacts WHERE workspace_id = $1', [workspaceId]);
    const campaignsRow = await db.query('SELECT count(*) as c FROM campaigns WHERE workspace_id = $1', [workspaceId]);
    const supRow = await db.query('SELECT count(*) as c FROM suppression WHERE workspace_id = $1', [workspaceId]);

    const catRows = await db.query(
      'SELECT category, count(*) as count FROM complaint_themes WHERE workspace_id = $1 GROUP BY category',
      [workspaceId]
    );

    const mktRows = await db.query(
      'SELECT marketplace, count(*) as count FROM applications WHERE workspace_id = $1 GROUP BY marketplace',
      [workspaceId]
    );

    return {
      totalApps: Number(appsRow[0]?.c || 0),
      totalReviews: Number(reviewsRow[0]?.c || 0),
      negativeReviews: Number(negReviewsRow[0]?.c || 0),
      totalThemes: Number(themesRow[0]?.c || 0),
      totalOpportunities: Number(oppsRow[0]?.c || 0),
      totalContacts: Number(contactsRow[0]?.c || 0),
      activeCampaigns: Number(campaignsRow[0]?.c || 0),
      suppressionCount: Number(supRow[0]?.c || 0),
      complaintBreakdown: catRows.map((r: any) => ({ category: r.category, count: Number(r.count) })),
      marketplacesBreakdown: mktRows.map((r: any) => ({ marketplace: r.marketplace as Marketplace, count: Number(r.count) })),
    };
  }

  async logAudit(workspaceId: string, action: string, entityType: string, entityId: string, details: string): Promise<void> {
    const id = `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await db.execute(
      'INSERT INTO audit_logs (id, workspace_id, action, entity_type, entity_id, details, timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, workspaceId, action, entityType, entityId, details, new Date().toISOString()]
    );
  }
}

export const repository = new AppPulseRepository();
