import crypto from 'node:crypto';
import type { PoolClient, QueryResultRow } from 'pg';
import { query, transaction } from './db.ts';
import type { WorkspaceActor } from './domain-store.ts';

export type JobType = 'collection' | 'analysis' | 'forecast' | 'opportunities' | 'export' | 'report';
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface DurableJob extends QueryResultRow {
  id: string;
  workspace_id: string;
  job_type: JobType;
  requested_by: string | null;
  status: JobStatus;
  progress: number;
  attempts: number;
  max_attempts: number;
  input: Record<string, unknown>;
  result: Record<string, unknown> | null;
  safe_error: string | null;
  idempotency_key: string | null;
  available_at: Date;
  created_at: Date;
  started_at: Date | null;
  heartbeat_at: Date | null;
  completed_at: Date | null;
  lease_owner: string | null;
  lease_token: string | null;
}

export interface JobView {
  id: string;
  type: JobType;
  status: JobStatus;
  progress: number;
  attempts: number;
  maxAttempts: number;
  input: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  heartbeatAt: string | null;
  completedAt: string | null;
}

const acceptedTypes = new Set<JobType>(['collection', 'analysis', 'forecast', 'opportunities', 'export', 'report']);
const staleLeaseSeconds = Math.max(30, Math.min(900, Number(process.env.JOB_STALE_SECONDS) || 180));

export function retryDelayMs(attempt: number): number {
  const safeAttempt = Math.max(1, Math.min(10, Math.trunc(attempt)));
  return Math.min(5 * 60_000, 5_000 * 2 ** (safeAttempt - 1));
}

export function safeJobError(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Job failed';
  return raw
    .replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/gi, '[database URL]')
    .replace(/\bBearer\s+[^\s'"<>]+/gi, 'Bearer [redacted]')
    .replace(/\b(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted key]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500) || 'Job failed';
}

export function toJobView(job: DurableJob): JobView {
  return {
    id: job.id,
    type: job.job_type,
    status: job.status,
    progress: job.progress,
    attempts: job.attempts,
    maxAttempts: job.max_attempts,
    input: job.input || {},
    result: job.status === 'completed' ? job.result : null,
    error: job.status === 'failed' ? job.safe_error : null,
    createdAt: job.created_at.toISOString(),
    startedAt: job.started_at?.toISOString() || null,
    heartbeatAt: job.heartbeat_at?.toISOString() || null,
    completedAt: job.completed_at?.toISOString() || null,
  };
}

async function auditJob(client: PoolClient, actor: WorkspaceActor, action: string, jobId: string, details: Record<string, unknown> = {}): Promise<void> {
  await client.query(
    `INSERT INTO audit_events(id,workspace_id,user_id,action,entity_type,entity_id,details)
     VALUES ($1,$2,$3,$4,'BackgroundJob',$5,$6::jsonb)`,
    [`audit_${crypto.randomUUID()}`, actor.workspaceId, actor.userId, action, jobId, JSON.stringify(details)],
  );
}

export async function enqueueJob(
  actor: WorkspaceActor,
  type: JobType,
  input: Record<string, unknown>,
  idempotencyKey?: string,
  maxAttempts = 3,
): Promise<JobView> {
  if (!acceptedTypes.has(type)) throw new Error('Unsupported job type');
  const serialized = JSON.stringify(input ?? {});
  if (Buffer.byteLength(serialized) > 500_000) throw new Error('Job input exceeds the allowed size');
  const key = idempotencyKey?.trim().slice(0, 160) || null;
  const attempts = Math.max(1, Math.min(5, Math.trunc(maxAttempts)));

  return transaction(async (client) => {
    const membership = await client.query('SELECT 1 FROM workspace_members WHERE workspace_id=$1 AND user_id=$2', [actor.workspaceId, actor.userId]);
    if (!membership.rowCount) throw new Error('Workspace membership is no longer active');
    const id = `job_${crypto.randomUUID()}`;
    const inserted = await client.query<DurableJob>(
      `INSERT INTO background_jobs(workspace_id,id,job_type,requested_by,status,progress,attempts,max_attempts,input,idempotency_key)
       VALUES ($1,$2,$3,$4,'pending',0,0,$5,$6::jsonb,$7)
       ON CONFLICT (workspace_id,requested_by,idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
       RETURNING *`,
      [actor.workspaceId, id, type, actor.userId, attempts, serialized, key],
    );
    let job = inserted.rows[0];
    if (!job && key) {
      const existing = await client.query<DurableJob>(
        'SELECT * FROM background_jobs WHERE workspace_id=$1 AND requested_by=$2 AND idempotency_key=$3 LIMIT 1',
        [actor.workspaceId, actor.userId, key],
      );
      job = existing.rows[0];
    }
    if (!job) throw new Error('Unable to persist job request');
    if (inserted.rowCount) await auditJob(client, actor, 'JOB_QUEUED', job.id, { type, maxAttempts: attempts });
    return toJobView(job);
  });
}

export async function listJobs(actor: WorkspaceActor, type?: JobType, limit = 100): Promise<JobView[]> {
  const rows = type
    ? await query<DurableJob>('SELECT * FROM background_jobs WHERE workspace_id=$1 AND job_type=$2 ORDER BY created_at DESC LIMIT $3', [actor.workspaceId, type, Math.max(1, Math.min(250, limit))])
    : await query<DurableJob>('SELECT * FROM background_jobs WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT $2', [actor.workspaceId, Math.max(1, Math.min(250, limit))]);
  return rows.map(toJobView);
}

export async function getJob(actor: WorkspaceActor, id: string): Promise<JobView | undefined> {
  const rows = await query<DurableJob>('SELECT * FROM background_jobs WHERE workspace_id=$1 AND id=$2 LIMIT 1', [actor.workspaceId, id]);
  return rows[0] ? toJobView(rows[0]) : undefined;
}

export async function cancelJob(actor: WorkspaceActor, id: string): Promise<'cancelled' | 'running' | 'terminal' | 'not_found'> {
  return transaction(async (client) => {
    const rows = await client.query<DurableJob>(
      'SELECT * FROM background_jobs WHERE workspace_id=$1 AND id=$2 FOR UPDATE',
      [actor.workspaceId, id],
    );
    const job = rows.rows[0];
    if (!job) return 'not_found';
    if (job.status === 'running') return 'running';
    if (job.status !== 'pending') return 'terminal';
    await client.query(
      `UPDATE background_jobs SET status='cancelled',progress=0,completed_at=NOW(),safe_error=NULL,lease_owner=NULL,lease_token=NULL
       WHERE workspace_id=$1 AND id=$2 AND status='pending'`,
      [actor.workspaceId, id],
    );
    await auditJob(client, actor, 'JOB_CANCELLED', id);
    return 'cancelled';
  });
}

async function recoverStaleJobs(client: PoolClient): Promise<void> {
  await client.query(
    `UPDATE background_jobs
     SET status=CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
         safe_error='Worker lease expired; the job was recovered.',
         available_at=NOW(),
         progress=CASE WHEN attempts >= max_attempts THEN 100 ELSE 0 END,
         completed_at=CASE WHEN attempts >= max_attempts THEN NOW() ELSE NULL END,
         heartbeat_at=NULL,lease_owner=NULL,lease_token=NULL
     WHERE status='running'
       AND COALESCE(heartbeat_at,started_at,created_at) < NOW() - ($1 * INTERVAL '1 second')`,
    [staleLeaseSeconds],
  );
}

async function touchWorker(client: PoolClient, workerId: string): Promise<void> {
  await client.query(
    `INSERT INTO job_workers(id,last_seen_at,metadata) VALUES ($1,NOW(),$2::jsonb)
     ON CONFLICT (id) DO UPDATE SET last_seen_at=NOW(),metadata=EXCLUDED.metadata`,
    [workerId, JSON.stringify({ pid: process.pid })],
  );
}

export async function getActiveJobWorkerCount(maxAgeSeconds = 120): Promise<number> {
  const rows = await query<{ active_count: number }>(
    `SELECT COUNT(*)::integer AS active_count FROM job_workers WHERE last_seen_at > NOW() - ($1 * INTERVAL '1 second')`,
    [Math.max(30, Math.min(900, Math.trunc(maxAgeSeconds)))],
  );
  return rows[0]?.active_count || 0;
}

export async function claimNextJob(workerId: string): Promise<DurableJob | undefined> {
  const safeWorkerId = workerId.replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, 160) || `worker_${process.pid}`;
  return transaction(async (client) => {
    await touchWorker(client, safeWorkerId);
    await recoverStaleJobs(client);
    const rows = await client.query<DurableJob>(
      `WITH candidate AS (
         SELECT workspace_id,id FROM background_jobs
         WHERE status='pending' AND available_at <= NOW() AND attempts < max_attempts
         ORDER BY available_at,created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       UPDATE background_jobs AS job
       SET status='running',attempts=job.attempts+1,progress=GREATEST(job.progress,1),
           started_at=COALESCE(job.started_at,NOW()),heartbeat_at=NOW(),lease_owner=$1,lease_token=$2
       FROM candidate
       WHERE job.workspace_id=candidate.workspace_id AND job.id=candidate.id
       RETURNING job.*`,
      [safeWorkerId, crypto.randomUUID()],
    );
    return rows.rows[0];
  });
}

export async function heartbeatJob(job: DurableJob, progress: number): Promise<boolean> {
  const rows = await query(
    `UPDATE background_jobs SET heartbeat_at=NOW(),progress=$4
     WHERE workspace_id=$1 AND id=$2 AND status='running' AND lease_token=$3`,
    [job.workspace_id, job.id, job.lease_token, Math.max(1, Math.min(99, Math.trunc(progress)))],
  );
  if (rows.length && job.lease_owner) {
    await query(
      `INSERT INTO job_workers(id,last_seen_at,metadata) VALUES ($1,NOW(),$2::jsonb)
       ON CONFLICT (id) DO UPDATE SET last_seen_at=NOW(),metadata=EXCLUDED.metadata`,
      [job.lease_owner, JSON.stringify({ pid: process.pid })],
    );
  }
  return rows.length > 0;
}

export async function completeJob(job: DurableJob, result: Record<string, unknown>): Promise<boolean> {
  const rows = await query(
    `UPDATE background_jobs SET status='completed',progress=100,result=$4::jsonb,safe_error=NULL,completed_at=NOW(),heartbeat_at=NOW(),lease_owner=NULL,lease_token=NULL
     WHERE workspace_id=$1 AND id=$2 AND status='running' AND lease_token=$3`,
    [job.workspace_id, job.id, job.lease_token, JSON.stringify(result)],
  );
  return rows.length > 0;
}

export async function failJob(job: DurableJob, error: unknown, retryable = true): Promise<JobStatus | undefined> {
  const message = safeJobError(error);
  const willRetry = retryable && job.attempts < job.max_attempts;
  const delay = retryDelayMs(job.attempts);
  const rows = await query<{ status: JobStatus }>(
    `UPDATE background_jobs
     SET status=$4,progress=CASE WHEN $4='failed' THEN 100 ELSE 0 END,
         available_at=CASE WHEN $4='pending' THEN NOW() + ($5 * INTERVAL '1 millisecond') ELSE available_at END,
         safe_error=$6,completed_at=CASE WHEN $4='failed' THEN NOW() ELSE NULL END,
         heartbeat_at=NOW(),lease_owner=NULL,lease_token=NULL
     WHERE workspace_id=$1 AND id=$2 AND status='running' AND lease_token=$3
     RETURNING status`,
    [job.workspace_id, job.id, job.lease_token, willRetry ? 'pending' : 'failed', delay, message],
  );
  return rows[0]?.status;
}

export async function recoverStaleJobsNow(): Promise<number> {
  return transaction(async (client) => {
    const result = await client.query(
      `UPDATE background_jobs
       SET status=CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
           safe_error='Worker lease expired; the job was recovered.',available_at=NOW(),
           progress=CASE WHEN attempts >= max_attempts THEN 100 ELSE 0 END,
           completed_at=CASE WHEN attempts >= max_attempts THEN NOW() ELSE NULL END,
           heartbeat_at=NULL,lease_owner=NULL,lease_token=NULL
       WHERE status='running'
         AND COALESCE(heartbeat_at,started_at,created_at) < NOW() - ($1 * INTERVAL '1 second')`,
      [staleLeaseSeconds],
    );
    return result.rowCount || 0;
  });
}
