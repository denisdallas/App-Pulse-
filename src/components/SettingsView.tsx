import React from 'react';
import type { AuditLog } from '../types.ts';
import { Activity, AlertTriangle, Clock3, Cpu, Download, FileText, Server, ShieldCheck } from 'lucide-react';

type ConnectorStatus = {
  marketplace: string;
  name: string;
  configuration: string;
  connectivity: string;
  capability: string;
  capabilities: { discovery: boolean; reviewCollection: boolean };
  latencyMs: number | null;
  lastTestedAt: string | null;
  lastSuccessfulRetrievalAt: string | null;
  message: string;
  reviewCoverage: string;
  nextAction: string;
};

type SettingsData = {
  connectors?: ConnectorStatus[];
  ai?: { provider?: string; model?: string; configuration?: string; connectivity?: string; status?: string; nextAction?: string };
  email?: { provider?: string | null; configuration?: string; connectivity?: string; status?: string; deliveryReady?: boolean; nextAction?: string };
  prospectDiscovery?: { configuration?: string; status?: string; nextAction?: string };
  storage?: { configuration?: string; connectivity?: string; migrations?: string; pendingMigrations?: string[]; nextAction?: string };
  jobs?: { executionMode?: string; configuration?: string; status?: string; activeWorkerCount?: number; nextAction?: string };
  dataRetention?: { status?: string; nextAction?: string };
  suppressionCount?: number;
};

interface SettingsViewProps {
  settingsData: SettingsData | null;
  auditLogs: AuditLog[];
  onExport: (type: 'reviews' | 'opportunities' | 'contacts', format: 'csv' | 'json' | 'xlsx') => void;
  onExportPdf: () => void;
}

function statusLabel(value?: string): string {
  return (value || 'unknown').replaceAll('_', ' ');
}

function statusClass(value?: string): string {
  if (['operational', 'active', 'current', 'reachable', 'runtime_available'].includes(value || '')) {
    return 'border-emerald-800/50 bg-emerald-950/40 text-emerald-300';
  }
  if (['configured_not_tested', 'partially_supported', 'worker_not_observed', 'pending'].includes(value || '')) {
    return 'border-amber-800/50 bg-amber-950/30 text-amber-300';
  }
  return 'border-slate-700 bg-slate-800 text-slate-300';
}

function StatusBadge({ value }: { value?: string }) {
  return <span className={`inline-flex rounded border px-2 py-1 text-[10px] font-medium capitalize ${statusClass(value)}`}>{statusLabel(value)}</span>;
}

function formatTime(value?: string | null): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleString();
}

const exportTypes: { type: 'reviews' | 'opportunities' | 'contacts'; title: string; description: string }[] = [
  { type: 'reviews', title: 'Stored reviews', description: 'Source IDs, timestamps, provenance, and review text.' },
  { type: 'opportunities', title: 'Product opportunities', description: 'Evidence-linked hypotheses and calculated scores.' },
  { type: 'contacts', title: 'Business contacts', description: 'Contact records, consent basis, and sourcing details.' },
];

export const SettingsView: React.FC<SettingsViewProps> = ({ settingsData, auditLogs, onExport, onExportPdf }) => {
  const connectors = settingsData?.connectors || [];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <header className="space-y-2 rounded-xl border border-slate-800 bg-slate-900 p-6">
        <span className="inline-flex items-center gap-1.5 rounded bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-300">
          <Server className="h-3.5 w-3.5 text-indigo-400" aria-hidden="true" /> Runtime and integration status
        </span>
        <h2 className="text-base font-semibold text-white">Settings & data governance</h2>
        <p className="max-w-3xl text-xs leading-relaxed text-slate-400">
          Status values come from configured runtime checks. “Not tested” means no successful retrieval is claimed; unsupported sources and unavailable services remain clearly marked.
        </p>
      </header>

      <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><Activity className="h-4 w-4 text-indigo-400" aria-hidden="true" />Marketplace connectors</h3>
            <p className="mt-1 text-xs text-slate-400">Catalog discovery and review collection are separate capabilities.</p>
          </div>
          <span className="text-[10px] text-slate-500">{connectors.length} sources checked</span>
        </div>
        {connectors.length ? (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {connectors.map((connector) => (
              <article key={connector.marketplace} className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-xs font-semibold text-white">{connector.name}</h4>
                  <StatusBadge value={connector.connectivity} />
                </div>
                <div className="flex flex-wrap gap-2 text-[10px]">
                  <span className={`rounded border px-2 py-1 ${connector.capabilities?.discovery ? 'border-indigo-800/50 bg-indigo-950/40 text-indigo-200' : 'border-slate-800 text-slate-500'}`}>Catalog discovery: {connector.capabilities?.discovery ? 'supported' : 'unavailable'}</span>
                  <span className={`rounded border px-2 py-1 ${connector.capabilities?.reviewCollection ? 'border-indigo-800/50 bg-indigo-950/40 text-indigo-200' : 'border-slate-800 text-slate-500'}`}>Review collection: {connector.capabilities?.reviewCollection ? 'implemented, not verified' : 'unavailable'}</span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-400">{connector.message}</p>
                <p className="text-[10px] text-slate-500">Coverage: {connector.reviewCoverage}</p>
                <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500">
                  <span>Probe: {connector.latencyMs === null ? 'not measured' : `${connector.latencyMs} ms`}</span>
                  <span>Last check: {formatTime(connector.lastTestedAt)}</span>
                  <span className="col-span-2">Last successful retrieval: {formatTime(connector.lastSuccessfulRetrievalAt)}</span>
                </div>
                <p className="border-t border-slate-800 pt-2 text-[11px] text-slate-300">Next: {connector.nextAction}</p>
              </article>
            ))}
          </div>
        ) : <p className="rounded-lg border border-slate-800 bg-slate-950/40 p-4 text-xs text-slate-400">Connector status has not loaded; no source is assumed to be healthy.</p>}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <article className="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><Cpu className="h-4 w-4 text-indigo-400" aria-hidden="true" />AI analysis</h3>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
            <div><p className="text-xs font-semibold text-white">{settingsData?.ai?.provider || 'AI provider'}</p><p className="mt-1 text-[11px] font-mono text-slate-400">{settingsData?.ai?.model || 'Model not reported'}</p></div>
            <StatusBadge value={settingsData?.ai?.status} />
          </div>
          <p className="text-[11px] text-slate-400">Connectivity: {statusLabel(settingsData?.ai?.connectivity)}. Model output is validated against stored source-review IDs; deterministic evidence-only results are used when generation is unavailable.</p>
          <p className="text-[11px] text-slate-300">Next: {settingsData?.ai?.nextAction || 'Runtime status unavailable.'}</p>
        </article>

        <article className="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><ShieldCheck className="h-4 w-4 text-amber-400" aria-hidden="true" />Outbound email</h3>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
            <div><p className="text-xs font-semibold text-white">{settingsData?.email?.provider || 'No delivery provider'}</p><p className="mt-1 text-[11px] text-slate-400">Delivery is {settingsData?.email?.deliveryReady ? 'enabled by configuration' : 'unavailable'}</p></div>
            <StatusBadge value={settingsData?.email?.status} />
          </div>
          <p className="text-[11px] text-slate-400">No email provider is currently implemented or connected. Campaign records are drafts; no send or delivery event is simulated.</p>
          <p className="text-[11px] text-slate-300">Next: {settingsData?.email?.nextAction || 'Configure an approved delivery provider before enabling dispatch.'}</p>
        </article>

        <article className="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><Server className="h-4 w-4 text-indigo-400" aria-hidden="true" />PostgreSQL persistence</h3>
          <div className="flex flex-wrap gap-2"><StatusBadge value={settingsData?.storage?.connectivity} /><StatusBadge value={settingsData?.storage?.migrations} /></div>
          <p className="text-[11px] text-slate-400">Configuration: {statusLabel(settingsData?.storage?.configuration)}. Pending migrations: {settingsData?.storage?.pendingMigrations?.length ? settingsData.storage.pendingMigrations.join(', ') : 'none reported'}.</p>
          <p className="text-[11px] text-slate-300">Next: {settingsData?.storage?.nextAction || 'Storage status unavailable.'}</p>
        </article>

        <article className="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><Clock3 className="h-4 w-4 text-indigo-400" aria-hidden="true" />Durable jobs & prospect discovery</h3>
          <div className="flex flex-wrap items-center gap-2"><StatusBadge value={settingsData?.jobs?.status} /><span className="text-[10px] text-slate-500">Mode: {settingsData?.jobs?.executionMode || 'not configured'} · active workers: {settingsData?.jobs?.activeWorkerCount ?? 0}</span></div>
          <p className="text-[11px] text-slate-300">Jobs: {settingsData?.jobs?.nextAction || 'Worker status unavailable.'}</p>
          <p className="text-[11px] text-slate-400">Prospects: {settingsData?.prospectDiscovery?.nextAction || 'No business-prospect source is configured.'}</p>
        </article>
      </section>

      <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><Download className="h-4 w-4 text-indigo-400" aria-hidden="true" />Research exports</h3>
          <p className="mt-1 text-xs text-slate-400">Exports contain workspace-scoped records and their available source attribution.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {exportTypes.map((item) => (
            <article key={item.type} className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/40 p-4">
              <div><h4 className="text-xs font-semibold text-white">{item.title}</h4><p className="mt-1 text-[10px] text-slate-400">{item.description}</p></div>
              <div className="flex flex-wrap gap-1.5">
                {(['csv', 'xlsx', 'json'] as const).map((format) => <button key={format} type="button" onClick={() => onExport(item.type, format)} className="rounded bg-slate-800 px-2.5 py-1 text-[10px] font-mono text-slate-200 transition-colors hover:bg-slate-700">{format.toUpperCase()}</button>)}
              </div>
            </article>
          ))}
          <article className="flex flex-col justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-4">
            <div><h4 className="text-xs font-semibold text-white">Research findings report</h4><p className="mt-1 text-[10px] text-slate-400">PDF summary with source and sample limitations.</p></div>
            <button type="button" onClick={onExportPdf} className="inline-flex w-fit items-center gap-1.5 rounded bg-indigo-600 px-2.5 py-1.5 text-[10px] font-semibold text-white transition-colors hover:bg-indigo-500"><FileText className="h-3.5 w-3.5" aria-hidden="true" />Download PDF</button>
          </article>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><ShieldCheck className="h-4 w-4 text-indigo-400" aria-hidden="true" />Security & audit events</h3>
          <span className="text-[10px] font-mono text-slate-500">Suppression entries: {settingsData?.suppressionCount ?? 0} · {auditLogs.length} audit events loaded</span>
        </div>
        <div className="mt-3 max-h-64 divide-y divide-slate-800 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/40">
          {auditLogs.length ? auditLogs.map((log) => (
            <div key={log.id} className="flex items-start justify-between gap-4 p-3 text-xs">
              <div><div className="flex flex-wrap items-center gap-2"><span className="rounded bg-indigo-950 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase text-indigo-300">{log.action}</span><span className="text-slate-300">{log.entityType}</span></div><p className="mt-1 text-[11px] text-slate-400">{log.details}</p></div>
              <time className="shrink-0 text-[10px] font-mono text-slate-500" dateTime={log.timestamp}>{formatTime(log.timestamp)}</time>
            </div>
          )) : <p className="p-4 text-xs text-slate-500">No audit events are available for this workspace.</p>}
        </div>
        <p className="mt-3 flex items-start gap-2 text-[11px] text-slate-500"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />Automatic retention/deletion is not configured. {settingsData?.dataRetention?.nextAction || 'Stored records are retained until manually removed where deletion is available.'}</p>
      </section>
    </div>
  );
};
