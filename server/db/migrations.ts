import { db } from './database.ts';
import crypto from 'node:crypto';
import { hashPassword } from '../auth/security.ts';

export { hashPassword } from '../auth/security.ts';

export async function runMigrations(): Promise<void> {
  console.log(`[Migrations] Running relational database migrations on ${db.getEngineName()}...`);

  const ddlStatements = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      created_at TEXT NOT NULL
    );`,

    `CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL
    );`,

    `CREATE TABLE IF NOT EXISTS workspace_members (
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      joined_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, user_id)
    );`,

    `CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );`,

    `CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      icon_url TEXT,
      publisher TEXT NOT NULL,
      marketplace TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL,
      rating REAL NOT NULL,
      rating_count INTEGER NOT NULL,
      review_count INTEGER NOT NULL,
      platform TEXT NOT NULL,
      release_date TEXT,
      last_updated TEXT,
      current_version TEXT,
      update_frequency TEXT,
      store_url TEXT,
      collection_available INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active',
      tags_json TEXT NOT NULL DEFAULT '[]',
      is_demo INTEGER NOT NULL DEFAULT 0,
      provenance TEXT NOT NULL DEFAULT 'live',
      created_at TEXT NOT NULL
    );`,

    `CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      app_id TEXT NOT NULL,
      app_name TEXT NOT NULL,
      marketplace TEXT NOT NULL,
      text TEXT NOT NULL,
      star_rating INTEGER NOT NULL,
      review_date TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'en',
      review_url TEXT,
      helpful_votes INTEGER NOT NULL DEFAULT 0,
      app_version TEXT,
      collected_at TEXT NOT NULL,
      fingerprint TEXT UNIQUE NOT NULL,
      classification_json TEXT,
      notes TEXT,
      saved_to_collection INTEGER NOT NULL DEFAULT 0,
      tag_list_json TEXT NOT NULL DEFAULT '[]',
      provenance TEXT NOT NULL DEFAULT 'live',
      source_record_id TEXT,
      source_url TEXT,
      is_demo INTEGER NOT NULL DEFAULT 0
    );`,

    `CREATE TABLE IF NOT EXISTS complaint_themes (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      summary TEXT NOT NULL,
      review_count INTEGER NOT NULL,
      affected_apps_json TEXT NOT NULL DEFAULT '[]',
      affected_app_names_json TEXT NOT NULL DEFAULT '[]',
      representative_quotes_json TEXT NOT NULL DEFAULT '[]',
      earliest_date TEXT,
      latest_date TEXT,
      severity TEXT NOT NULL DEFAULT 'Medium',
      confidence_score REAL NOT NULL DEFAULT 0.8,
      potential_improvement TEXT,
      validation_hypothesis TEXT,
      validation_steps_json TEXT NOT NULL DEFAULT '[]',
      trend TEXT NOT NULL DEFAULT 'stable',
      evidence_review_ids_json TEXT NOT NULL DEFAULT '[]',
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );`,

    `CREATE TABLE IF NOT EXISTS opportunities (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      title TEXT NOT NULL,
      problem_statement TEXT NOT NULL,
      target_user TEXT NOT NULL,
      supporting_app_ids_json TEXT NOT NULL DEFAULT '[]',
      supporting_app_names_json TEXT NOT NULL DEFAULT '[]',
      supporting_review_ids_json TEXT NOT NULL DEFAULT '[]',
      complaint_frequency INTEGER NOT NULL DEFAULT 0,
      severity TEXT NOT NULL DEFAULT 'Medium',
      existing_solutions TEXT,
      proposed_concept TEXT NOT NULL,
      differentiation_hypothesis TEXT,
      validation_questions_json TEXT NOT NULL DEFAULT '[]',
      next_steps_json TEXT NOT NULL DEFAULT '[]',
      priority_score REAL NOT NULL DEFAULT 50,
      score_breakdown_json TEXT NOT NULL DEFAULT '{}',
      tags_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'planned',
      evidence_strength TEXT DEFAULT 'Medium',
      confidence_score REAL DEFAULT 0.85,
      is_estimate INTEGER DEFAULT 1,
      validation_step TEXT,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );`,

    `CREATE TABLE IF NOT EXISTS collection_jobs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      app_id TEXT NOT NULL,
      app_name TEXT NOT NULL,
      marketplace TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      progress INTEGER NOT NULL DEFAULT 0,
      collected_count INTEGER NOT NULL DEFAULT 0,
      deduplicated_count INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL,
      completed_at TEXT
    );`,

    `CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      title TEXT NOT NULL,
      company TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      website TEXT,
      channel TEXT NOT NULL DEFAULT 'email',
      source_url TEXT NOT NULL,
      app_id TEXT,
      app_name TEXT,
      opportunity_id TEXT,
      status TEXT NOT NULL DEFAULT 'New',
      consent_basis TEXT NOT NULL,
      notes TEXT,
      verified_source TEXT,
      is_verified INTEGER NOT NULL DEFAULT 1,
      confidence REAL DEFAULT 0.9,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );`,

    `CREATE TABLE IF NOT EXISTS suppression (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      email_or_domain TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT 'manual_suppression',
      created_at TEXT NOT NULL
    );`,

    `CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      objective TEXT NOT NULL,
      tone TEXT NOT NULL,
      target_category TEXT NOT NULL,
      template_subject TEXT NOT NULL,
      template_body TEXT NOT NULL,
      recipients_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'draft',
      stats_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );`,

    `CREATE TABLE IF NOT EXISTS research_projects (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      saved_app_ids_json TEXT NOT NULL DEFAULT '[]',
      saved_review_ids_json TEXT NOT NULL DEFAULT '[]',
      saved_theme_ids_json TEXT NOT NULL DEFAULT '[]',
      saved_opportunity_ids_json TEXT NOT NULL DEFAULT '[]',
      notes TEXT,
      tags_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,

    `CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id TEXT,
      title TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'completed',
      download_url TEXT NOT NULL,
      generated_at TEXT NOT NULL
    );`,

    `CREATE TABLE IF NOT EXISTS integration_settings (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      marketplace TEXT NOT NULL,
      display_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'not_configured',
      latency_ms INTEGER NOT NULL DEFAULT 0,
      message TEXT,
      review_coverage TEXT,
      last_tested_at TEXT,
      last_test_outcome TEXT,
      has_credentials INTEGER NOT NULL DEFAULT 0,
      required_credentials_json TEXT NOT NULL DEFAULT '[]'
    );`,

    `CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      details TEXT,
      timestamp TEXT NOT NULL
    );`,

    // Indices for performance and constraints
    `CREATE INDEX IF NOT EXISTS idx_reviews_ws_app ON reviews (workspace_id, app_id);`,
    `CREATE INDEX IF NOT EXISTS idx_reviews_fingerprint ON reviews (fingerprint);`,
    `CREATE INDEX IF NOT EXISTS idx_jobs_ws_status ON collection_jobs (workspace_id, status);`,
    `CREATE INDEX IF NOT EXISTS idx_contacts_ws_email ON contacts (workspace_id, email);`,
    `CREATE INDEX IF NOT EXISTS idx_suppression_ws_item ON suppression (workspace_id, email_or_domain);`,
    `CREATE INDEX IF NOT EXISTS idx_themes_ws ON complaint_themes (workspace_id);`,
    `CREATE INDEX IF NOT EXISTS idx_opps_ws ON opportunities (workspace_id);`,
  ];

  for (const sql of ddlStatements) {
    await db.execute(sql);
  }

  // Ensure default admin user and workspace exist
  await seedDefaultAuthAndWorkspace();
  console.log('[Migrations] Relational schema and initial constraints applied successfully.');
}

async function seedDefaultAuthAndWorkspace() {
  const timestamp = new Date().toISOString();
  const defaultWsId = 'ws_default';

  const existingWs = await db.query('SELECT id FROM workspaces WHERE id = $1', [defaultWsId]);
  if (existingWs.length === 0) {
    await db.execute(
      'INSERT INTO workspaces (id, name, slug, created_at) VALUES ($1, $2, $3, $4)',
      [defaultWsId, 'Main Workspace', 'main-workspace', timestamp]
    );
  }

  // Disable the exact legacy seeded administrator credential without deleting the account or its data.
  const legacySeededAdmin = await db.query(
    'SELECT id FROM users WHERE id = $1 AND email = $2 AND password_hash = $3',
    ['usr_admin_01', 'admin@apppulse.io', '591655aed082b3c8a45834fc104d3ba7da7a4dc60f267a82a2f6dbed3b64c6a8']
  );
  if (legacySeededAdmin.length > 0) {
    const id = legacySeededAdmin[0].id;
    await db.execute('UPDATE users SET password_hash = $1, role = $2 WHERE id = $3', [hashPassword(crypto.randomBytes(48).toString('hex')), 'member', id]);
    await db.execute('UPDATE workspace_members SET role = $1 WHERE user_id = $2 AND workspace_id = $3', ['member', id, defaultWsId]);
  }

  // Optional one-time bootstrap: credentials must be explicitly supplied through
  // deployment secrets. No default administrator or password is created.
  const bootstrapEmail = process.env.APP_BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const bootstrapPassword = process.env.APP_BOOTSTRAP_ADMIN_PASSWORD;
  const bootstrapName = process.env.APP_BOOTSTRAP_ADMIN_NAME?.trim() || 'Workspace Administrator';
  if (bootstrapEmail && bootstrapPassword && bootstrapPassword.length >= 12) {
    const existingAdmins = await db.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
    if (existingAdmins.length === 0) {
      const userId = `usr_${crypto.randomBytes(16).toString('hex')}`;
      await db.execute(
        'INSERT INTO users (id, email, password_hash, name, role, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [userId, bootstrapEmail, hashPassword(bootstrapPassword), bootstrapName, 'admin', timestamp]
      );
      await db.execute(
        'INSERT INTO workspace_members (workspace_id, user_id, role, joined_at) VALUES ($1, $2, $3, $4)',
        [defaultWsId, userId, 'admin', timestamp]
      );
    }
  }
}
