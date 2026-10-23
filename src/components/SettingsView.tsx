import React, { useState } from 'react';
import { AuditLog } from '../types.ts';
import { 
  Settings, 
  Cpu, 
  CheckCircle2, 
  AlertTriangle, 
  Activity, 
  Download, 
  FileSpreadsheet, 
  Clock, 
  ShieldCheck, 
  Server,
  Database,
  Mail,
  Key,
  Info
} from 'lucide-react';

interface SettingsViewProps {
  settingsData: any;
  auditLogs: AuditLog[];
  onExport: (type: 'reviews' | 'opportunities' | 'contacts', format: 'csv' | 'json') => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settingsData,
  auditLogs,
  onExport,
}) => {
  const [retentionDays, setRetentionDays] = useState(90);

  const connectors = settingsData?.connectors || {};
  const dbEngine = settingsData?.databaseEngine || 'SQLite (Durable Relational)';
  const emailStatus = settingsData?.emailProvider || 'Unconfigured (SMTP or Resend required)';
  const emailReady = Boolean(settingsData?.emailDeliveryReady);
  const aiStatus = settingsData?.aiStatus === 'active' ? 'Active (Gemini 3.8 Flash)' : 'Deterministic Fallback (Rule-Based Analysis)';

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'connected_verified':
      case 'operational':
        return <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/40 text-[10px] font-semibold uppercase">Connected & Verified</span>;
      case 'not_configured':
        return <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800/40 text-[10px] font-semibold uppercase">Credentials Required</span>;
      case 'rate_limited':
        return <span className="px-2 py-0.5 rounded bg-orange-950 text-orange-300 border border-orange-800/40 text-[10px] font-semibold uppercase">Rate Limited</span>;
      case 'temporarily_unavailable':
        return <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800/40 text-[10px] font-semibold uppercase">Unavailable</span>;
      default:
        return <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-semibold uppercase">{status}</span>;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-300 bg-slate-800 px-2 py-0.5 rounded flex items-center gap-1">
            <Settings className="w-3 h-3 text-slate-400" />
            Infrastructure & Integration Status
          </span>
          <span className="text-xs text-indigo-400 font-mono">Workspace: {settingsData?.workspaceName || 'Main Production Workspace'}</span>
        </div>
        <h2 className="text-base font-semibold text-white">System Settings & Data Governance</h2>
        <p className="text-xs text-slate-400 max-w-2xl">
          Inspect real-time marketplace connector health, relational database persistence, AI model routing, and outbound email verification.
        </p>
      </div>

      {/* Grid: Connectors & Database Persistence */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Marketplace Connectors Health */}
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Server className="w-4 h-4 text-indigo-400" />
              <span>Marketplace Review Connectors</span>
            </h3>
            <span className="text-[11px] text-slate-400">Live Health Checks</span>
          </div>

          <div className="space-y-3">
            {Object.entries(connectors).map(([key, conn]: [string, any]) => {
              const displayName = 
                key === 'steam' ? 'Steam (Valve Public API)' :
                key === 'appstore' ? 'Apple App Store (Official RSS & Search)' :
                key === 'googleplay' ? 'Google Play Store (Developer API)' :
                key === 'microsoft' ? 'Microsoft Store (Windows Display Catalog)' : key;

              return (
                <div key={key} className="p-3.5 rounded-lg bg-slate-800/40 border border-slate-800 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">{displayName}</span>
                    <div className="flex items-center gap-2 font-mono text-[11px] tabular-nums">
                      {conn.latencyMs > 0 && <span className="text-slate-400">{conn.latencyMs}ms</span>}
                      {getStatusBadge(conn.status)}
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    {conn.message}
                  </p>
                  <div className="text-[10px] text-slate-400 bg-slate-900/60 p-2 rounded border border-slate-800/60">
                    <span className="text-slate-500 block mb-0.5 font-medium">Coverage & Terms:</span>
                    {conn.reviewCoverage}
                  </div>
                  {conn.requiredCredentials && conn.requiredCredentials.length > 0 && conn.status === 'not_configured' && (
                    <div className="text-[10px] text-amber-300/90 flex items-start gap-1">
                      <Key className="w-3 h-3 mt-0.5 shrink-0 text-amber-400" />
                      <span>Setup Required: {conn.requiredCredentials.join(', ')}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Database & Platform Infrastructure */}
        <div className="space-y-6">
          {/* Relational Database Persistence */}
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-400" />
              <span>Relational Database & ACID Persistence</span>
            </h3>

            <div className="p-3.5 rounded-lg bg-slate-800/40 border border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">Active Database Engine</span>
                <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/40 text-[10px] font-semibold uppercase">
                  {dbEngine}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Relational schema with 14 isolated tables, foreign key constraints, SHA-256 review fingerprint uniqueness, and transactional write integrity.
              </p>
              <div className="text-[10px] text-slate-400 bg-slate-900/60 p-2 rounded border border-slate-800/60 font-mono">
                Location: server/data/apppulse.db (WAL Mode Enabled)
              </div>
            </div>

            {/* Email Dispatch Transport */}
            <div className="p-3.5 rounded-lg bg-slate-800/40 border border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Outreach Email Transport</span>
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase border ${
                  emailReady 
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-800/40' 
                    : 'bg-amber-950 text-amber-300 border-amber-800/40'
                }`}>
                  {emailReady ? 'Verified Active' : 'Unconfigured'}
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                {emailStatus}
              </p>
              {!emailReady && (
                <p className="text-[10px] text-amber-400/90 bg-amber-950/40 p-2 rounded border border-amber-800/30">
                  ⚠️ Simulated delivery is permanently disabled. Provide SMTP credentials (SMTP_HOST, SMTP_USER, SMTP_PASS) or RESEND_API_KEY in server environment to enable actual email dispatch.
                </p>
              )}
            </div>

            {/* AI Intelligence Model */}
            <div className="p-3.5 rounded-lg bg-slate-800/40 border border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-purple-400" />
                  <span>AI Synthesis Engine</span>
                </span>
                <span className="text-purple-300 font-mono text-[11px]">gemini-3.8-flash</span>
              </div>
              <p className="text-[11px] text-slate-300">
                Status: {aiStatus}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Export Section */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Download className="w-4 h-4 text-indigo-400" />
          <span>Raw Data Export (RFC-4180 CSV / JSON)</span>
        </h3>
        <p className="text-xs text-slate-400">
          Export verified dataset records directly from the database with formula-injection escaping.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-3.5 rounded-lg bg-slate-800/40 border border-slate-800 space-y-2 text-xs">
            <span className="font-semibold text-white block">Marketplace Reviews</span>
            <p className="text-[11px] text-slate-400">Export verified reviews with sentiment, ratings, and fingerprints.</p>
            <div className="flex gap-2 pt-1">
              <a
                href="/api/export?type=reviews&format=csv"
                download
                className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium"
              >
                Download CSV
              </a>
              <a
                href="/api/export?type=reviews&format=json"
                download
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium border border-slate-700"
              >
                JSON
              </a>
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-800/40 border border-slate-800 space-y-2 text-xs">
            <span className="font-semibold text-white block">Product Opportunities</span>
            <p className="text-[11px] text-slate-400">Export opportunity dossiers with multi-factor priority scores.</p>
            <div className="flex gap-2 pt-1">
              <a
                href="/api/export?type=opportunities&format=csv"
                download
                className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium"
              >
                Download CSV
              </a>
              <a
                href="/api/export?type=opportunities&format=json"
                download
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium border border-slate-700"
              >
                JSON
              </a>
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-800/40 border border-slate-800 space-y-2 text-xs">
            <span className="font-semibold text-white block">B2B Contacts</span>
            <p className="text-[11px] text-slate-400">Export verified business contacts with provenance and channel info.</p>
            <div className="flex gap-2 pt-1">
              <a
                href="/api/export?type=contacts&format=csv"
                download
                className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium"
              >
                Download CSV
              </a>
              <a
                href="/api/export?type=contacts&format=json"
                download
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium border border-slate-700"
              >
                JSON
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
