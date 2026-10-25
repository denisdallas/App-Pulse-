-- Workspace-scoped runtime persistence and a durable, claimable job queue.
-- This migration is transactional and the migration runner records each version once.

-- Existing IDs were globally unique. Make domain primary keys workspace-scoped so the
-- same public marketplace/source ID can safely exist in more than one workspace.
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_application_id_fkey;
ALTER TABLE collection_jobs DROP CONSTRAINT IF EXISTS collection_jobs_application_id_fkey;
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_project_id_fkey;

ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_pkey;
ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_workspace_id_id_pk;
ALTER TABLE applications ADD CONSTRAINT applications_workspace_id_id_pk PRIMARY KEY (workspace_id, id);

ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_pkey;
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_workspace_id_id_pk;
ALTER TABLE reviews ADD CONSTRAINT reviews_workspace_id_id_pk PRIMARY KEY (workspace_id, id);

ALTER TABLE research_projects DROP CONSTRAINT IF EXISTS research_projects_pkey;
ALTER TABLE research_projects DROP CONSTRAINT IF EXISTS research_projects_workspace_id_id_pk;
ALTER TABLE research_projects ADD CONSTRAINT research_projects_workspace_id_id_pk PRIMARY KEY (workspace_id, id);

ALTER TABLE collection_jobs DROP CONSTRAINT IF EXISTS collection_jobs_pkey;
ALTER TABLE collection_jobs DROP CONSTRAINT IF EXISTS collection_jobs_workspace_id_id_pk;
ALTER TABLE collection_jobs ADD CONSTRAINT collection_jobs_workspace_id_id_pk PRIMARY KEY (workspace_id, id);

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_pkey;
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_workspace_id_id_pk;
ALTER TABLE reports ADD CONSTRAINT reports_workspace_id_id_pk PRIMARY KEY (workspace_id, id);

ALTER TABLE opportunities DROP CONSTRAINT IF EXISTS opportunities_pkey;
ALTER TABLE opportunities DROP CONSTRAINT IF EXISTS opportunities_workspace_id_id_pk;
ALTER TABLE opportunities ADD CONSTRAINT opportunities_workspace_id_id_pk PRIMARY KEY (workspace_id, id);

ALTER TABLE applications ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE research_projects ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_workspace_application_fk;
ALTER TABLE reviews ADD CONSTRAINT reviews_workspace_application_fk
  FOREIGN KEY (workspace_id, application_id) REFERENCES applications(workspace_id, id) ON DELETE CASCADE;

ALTER TABLE collection_jobs DROP CONSTRAINT IF EXISTS collection_jobs_workspace_application_fk;
ALTER TABLE collection_jobs ADD CONSTRAINT collection_jobs_workspace_application_fk
  FOREIGN KEY (workspace_id, application_id) REFERENCES applications(workspace_id, id) ON DELETE CASCADE;

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_workspace_project_fk;
ALTER TABLE reports ADD CONSTRAINT reports_workspace_project_fk
  FOREIGN KEY (workspace_id, project_id) REFERENCES research_projects(workspace_id, id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS applications_workspace_marketplace_idx ON applications(workspace_id, marketplace);
CREATE INDEX IF NOT EXISTS reviews_workspace_marketplace_date_idx ON reviews(workspace_id, marketplace, review_date DESC);
CREATE INDEX IF NOT EXISTS collection_jobs_workspace_status_idx ON collection_jobs(workspace_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS reports_workspace_project_idx ON reports(workspace_id, project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS complaint_themes (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, id)
);
CREATE INDEX IF NOT EXISTS complaint_themes_workspace_created_idx ON complaint_themes(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS predicted_weaknesses (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  score NUMERIC NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, id)
);
CREATE INDEX IF NOT EXISTS predicted_weaknesses_workspace_score_idx ON predicted_weaknesses(workspace_id, score DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS theme_applications (
  workspace_id TEXT NOT NULL,
  theme_id TEXT NOT NULL,
  application_id TEXT NOT NULL,
  PRIMARY KEY (workspace_id, theme_id, application_id),
  FOREIGN KEY (workspace_id, theme_id) REFERENCES complaint_themes(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, application_id) REFERENCES applications(workspace_id, id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS theme_reviews (
  workspace_id TEXT NOT NULL,
  theme_id TEXT NOT NULL,
  review_id TEXT NOT NULL,
  PRIMARY KEY (workspace_id, theme_id, review_id),
  FOREIGN KEY (workspace_id, theme_id) REFERENCES complaint_themes(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, review_id) REFERENCES reviews(workspace_id, id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS forecast_applications (
  workspace_id TEXT NOT NULL,
  forecast_id TEXT NOT NULL,
  application_id TEXT NOT NULL,
  PRIMARY KEY (workspace_id, forecast_id, application_id),
  FOREIGN KEY (workspace_id, forecast_id) REFERENCES predicted_weaknesses(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, application_id) REFERENCES applications(workspace_id, id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS forecast_reviews (
  workspace_id TEXT NOT NULL,
  forecast_id TEXT NOT NULL,
  review_id TEXT NOT NULL,
  PRIMARY KEY (workspace_id, forecast_id, review_id),
  FOREIGN KEY (workspace_id, forecast_id) REFERENCES predicted_weaknesses(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, review_id) REFERENCES reviews(workspace_id, id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS opportunity_applications (
  workspace_id TEXT NOT NULL,
  opportunity_id TEXT NOT NULL,
  application_id TEXT NOT NULL,
  PRIMARY KEY (workspace_id, opportunity_id, application_id),
  FOREIGN KEY (workspace_id, opportunity_id) REFERENCES opportunities(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, application_id) REFERENCES applications(workspace_id, id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS opportunity_reviews (
  workspace_id TEXT NOT NULL,
  opportunity_id TEXT NOT NULL,
  review_id TEXT NOT NULL,
  PRIMARY KEY (workspace_id, opportunity_id, review_id),
  FOREIGN KEY (workspace_id, opportunity_id) REFERENCES opportunities(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, review_id) REFERENCES reviews(workspace_id, id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS research_project_applications (
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  application_id TEXT NOT NULL,
  PRIMARY KEY (workspace_id, project_id, application_id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES research_projects(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, application_id) REFERENCES applications(workspace_id, id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS research_project_reviews (
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  review_id TEXT NOT NULL,
  PRIMARY KEY (workspace_id, project_id, review_id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES research_projects(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, review_id) REFERENCES reviews(workspace_id, id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS research_project_themes (
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  theme_id TEXT NOT NULL,
  PRIMARY KEY (workspace_id, project_id, theme_id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES research_projects(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, theme_id) REFERENCES complaint_themes(workspace_id, id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS research_project_opportunities (
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  opportunity_id TEXT NOT NULL,
  PRIMARY KEY (workspace_id, project_id, opportunity_id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES research_projects(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, opportunity_id) REFERENCES opportunities(workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS contacts (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  email TEXT NOT NULL,
  application_id TEXT,
  opportunity_id TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, application_id) REFERENCES applications(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, opportunity_id) REFERENCES opportunities(workspace_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS contacts_workspace_email_idx ON contacts(workspace_id, lower(email));

CREATE TABLE IF NOT EXISTS suppression_records (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  normalized_value TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('unsubscribed','manual_suppression','bounce','opt_out')),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, normalized_value)
);
CREATE INDEX IF NOT EXISTS suppression_workspace_created_idx ON suppression_records(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS campaigns (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','approved','sending','completed')),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, id)
);
CREATE INDEX IF NOT EXISTS campaigns_workspace_status_idx ON campaigns(workspace_id, status, created_at DESC);
CREATE TABLE IF NOT EXISTS campaign_recipients (
  workspace_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','approved','queued','sent','delivered','failed','bounced','unsubscribed','suppressed')),
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, campaign_id, contact_id),
  FOREIGN KEY (workspace_id, campaign_id) REFERENCES campaigns(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, contact_id) REFERENCES contacts(workspace_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS campaign_recipients_workspace_status_idx ON campaign_recipients(workspace_id, status);

CREATE TABLE IF NOT EXISTS delivery_attempts (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','sent','delivered','failed','bounced','suppressed')),
  safe_error TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, campaign_id) REFERENCES campaigns(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, contact_id) REFERENCES contacts(workspace_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS delivery_attempts_workspace_campaign_idx ON delivery_attempts(workspace_id, campaign_id, attempted_at DESC);

CREATE TABLE IF NOT EXISTS background_jobs (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  job_type TEXT NOT NULL CHECK (job_type IN ('collection','analysis','forecast','opportunities','export','report')),
  requested_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','running','completed','failed','cancelled')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  safe_error TEXT,
  idempotency_key TEXT,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  heartbeat_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  lease_owner TEXT,
  lease_token UUID,
  PRIMARY KEY (workspace_id, id),
  CHECK (attempts <= max_attempts)
);
CREATE INDEX IF NOT EXISTS background_jobs_claim_idx ON background_jobs(status, available_at, created_at);
CREATE INDEX IF NOT EXISTS background_jobs_workspace_idx ON background_jobs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS background_jobs_workspace_type_idx ON background_jobs(workspace_id, job_type, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS background_jobs_idempotency_idx
  ON background_jobs(workspace_id, requested_by, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Carry forward the legacy PostgreSQL collection-job rows, without creating new
-- collection results or assuming any old in-memory job actually completed.
INSERT INTO background_jobs (
  workspace_id, id, job_type, requested_by, status, progress, attempts, max_attempts,
  input, result, safe_error, created_at, started_at, completed_at
)
SELECT
  workspace_id,
  id,
  'collection',
  requested_by,
  CASE
    WHEN status = 'running' THEN 'pending'
    WHEN status = 'pending' AND attempts >= max_attempts THEN 'failed'
    WHEN status = 'completed' AND (result IS NULL OR result = '{}'::jsonb) THEN 'failed'
    ELSE status
  END,
  CASE WHEN status = 'running' THEN 0 WHEN status = 'completed' AND (result IS NULL OR result = '{}'::jsonb) THEN 100 ELSE progress END,
  LEAST(GREATEST(COALESCE(attempts, 0), 0), LEAST(GREATEST(COALESCE(max_attempts, 3), 1), 10)),
  LEAST(GREATEST(COALESCE(max_attempts, 3), 1), 10),
  jsonb_build_object('appId', application_id, 'marketplace', marketplace) || COALESCE(input, '{}'::jsonb),
  NULLIF(result, '{}'::jsonb),
  CASE
    WHEN status = 'running' THEN 'Legacy running job was re-queued during migration.'
    WHEN status = 'completed' AND (result IS NULL OR result = '{}'::jsonb) THEN 'Legacy completion had no verifiable result and was not treated as success.'
    ELSE error_message
  END,
  created_at,
  CASE WHEN status = 'running' THEN NULL ELSE started_at END,
  CASE WHEN status = 'running' THEN NULL WHEN status = 'completed' AND (result IS NULL OR result = '{}'::jsonb) THEN NOW() ELSE completed_at END
FROM collection_jobs
ON CONFLICT (workspace_id, id) DO NOTHING;

CREATE TABLE IF NOT EXISTS job_workers (
  id TEXT PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS job_workers_last_seen_idx ON job_workers(last_seen_at DESC);

-- Hydrate payloads for rows written by the earlier normalized schema before the
-- application switched to JSONB-backed API contracts.
UPDATE applications
SET payload = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
  'id', id, 'name', name, 'publisher', COALESCE(publisher, 'Not provided'),
  'marketplace', marketplace, 'description', COALESCE(metadata->>'description', ''),
  'category', COALESCE(metadata->>'category', 'Other'), 'rating', COALESCE((metadata->>'rating')::numeric, 0),
  'ratingCount', COALESCE((metadata->>'ratingCount')::integer, 0), 'reviewCount', COALESCE((metadata->>'reviewCount')::integer, 0),
  'metadataStatus', COALESCE(metadata->>'metadataStatus', 'unknown'), 'platform', COALESCE(metadata->>'platform', 'Not provided'),
  'releaseDate', COALESCE(metadata->>'releaseDate', 'Not provided'), 'lastUpdated', COALESCE(metadata->>'lastUpdated', 'Not provided'),
  'currentVersion', COALESCE(metadata->>'currentVersion', 'Not provided'), 'updateFrequency', COALESCE(metadata->>'updateFrequency', 'Unknown'),
  'storeUrl', COALESCE(source_url, ''), 'collectionAvailable', false, 'status', 'active',
  'tags', COALESCE(metadata->'tags', '[]'::jsonb)
)
WHERE payload = '{}'::jsonb;

UPDATE reviews
SET payload = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
  'id', id, 'appId', application_id,
  'appName', COALESCE((SELECT name FROM applications WHERE workspace_id = reviews.workspace_id AND id = reviews.application_id), 'Unknown application'),
  'marketplace', marketplace, 'text', COALESCE(body, ''), 'starRating', COALESCE(rating, 0),
  'reviewDate', COALESCE(review_date::text, ''), 'ratingScale', COALESCE(metadata->>'ratingScale', 'stars'), 'language', COALESCE(metadata->>'language', 'und'),
  'reviewUrl', COALESCE(source_url, ''), 'helpfulVotes', COALESCE((metadata->>'helpfulVotes')::integer, 0),
  'collectedAt', COALESCE(collected_at::text, created_at::text), 'fingerprint', COALESCE(fingerprint, ''),
  'provenance', CASE provenance WHEN 'live' THEN 'live_marketplace' WHEN 'seed' THEN 'seed' WHEN 'imported' THEN 'imported' ELSE 'live_marketplace' END
)
WHERE payload = '{}'::jsonb;

UPDATE research_projects
SET payload = jsonb_build_object(
  'id', id, 'name', name, 'description', COALESCE(description, ''),
  'savedAppIds', '[]'::jsonb, 'savedReviewIds', '[]'::jsonb, 'savedThemeIds', '[]'::jsonb,
  'savedOpportunityIds', '[]'::jsonb, 'createdAt', created_at::text, 'updatedAt', updated_at::text
)
WHERE payload = '{}'::jsonb;

UPDATE opportunities
SET payload = COALESCE(evidence, '{}'::jsonb) || jsonb_build_object(
  'id', id, 'title', title, 'problemStatement', COALESCE(problem_statement, ''),
  'targetUser', '', 'supportingAppIds', '[]'::jsonb, 'supportingAppNames', '[]'::jsonb,
  'supportingReviewIds', COALESCE(evidence->'supportingReviewIds', '[]'::jsonb),
  'complaintFrequency', 0, 'severity', 'High', 'existingSolutions', '', 'proposedConcept', '',
  'differentiationHypothesis', '', 'validationQuestions', '[]'::jsonb, 'nextSteps', '[]'::jsonb,
  'priorityScore', COALESCE(score, 0), 'scoreBreakdown', jsonb_build_object('severityScore', 0, 'frequencyScore', 0, 'recencyScore', 0, 'breadthScore', 0),
  'tags', '[]'::jsonb, 'status', 'validating', 'createdAt', created_at::text
)
WHERE payload = '{}'::jsonb;
