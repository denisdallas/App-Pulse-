CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  marketplace TEXT NOT NULL,
  source_id TEXT,
  name TEXT NOT NULL,
  publisher TEXT,
  source_url TEXT,
  provenance TEXT NOT NULL DEFAULT 'live' CHECK (provenance IN ('seed','imported','live')),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_collected_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (workspace_id, marketplace, source_id)
);
CREATE INDEX IF NOT EXISTS applications_workspace_idx ON applications(workspace_id);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  marketplace TEXT NOT NULL,
  source_id TEXT,
  source_url TEXT,
  body TEXT NOT NULL,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  review_date TIMESTAMPTZ,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  provenance TEXT NOT NULL DEFAULT 'live' CHECK (provenance IN ('seed','imported','live')),
  fingerprint TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (workspace_id, marketplace, source_id),
  UNIQUE (workspace_id, fingerprint)
);
CREATE INDEX IF NOT EXISTS reviews_workspace_app_idx ON reviews(workspace_id, application_id);
CREATE INDEX IF NOT EXISTS reviews_workspace_date_idx ON reviews(workspace_id, review_date DESC);

CREATE TABLE IF NOT EXISTS research_projects (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS research_projects_workspace_idx ON research_projects(workspace_id);

CREATE TABLE IF NOT EXISTS collection_jobs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  requested_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  application_id TEXT REFERENCES applications(id) ON DELETE SET NULL,
  marketplace TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','running','completed','failed','cancelled')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS collection_jobs_workspace_idx ON collection_jobs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS collection_jobs_claim_idx ON collection_jobs(status, created_at);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  requested_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES research_projects(id) ON DELETE SET NULL,
  format TEXT NOT NULL CHECK (format IN ('pdf','csv','xlsx','json')),
  status TEXT NOT NULL CHECK (status IN ('pending','completed','failed')),
  file_path TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS reports_workspace_idx ON reports(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS opportunities (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  problem_statement TEXT,
  provenance TEXT NOT NULL DEFAULT 'calculated' CHECK (provenance IN ('seed','calculated','ai')),
  score NUMERIC,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS opportunities_workspace_idx ON opportunities(workspace_id);
