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
  Server
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

  const connectors = settingsData?.connectors || {
    steam: {
      status: 'operational',
      latencyMs: 42,
      message: 'Steam Community Public Reviews API fully operational',
      reviewCoverage: 'Steam PC games & tools',
    },
    googleplay: {
      status: 'operational',
      latencyMs: 84,
      message: 'Google Play Android Store indexed catalog active',
      reviewCoverage: 'Android Mobile & Tablet reviews',
    },
    microsoft: {
      status: 'operational',
      latencyMs: 110,
      message: 'Windows Display Catalog API active',
      reviewCoverage: 'Windows 10/11 desktop application reviews',
    },
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
        </div>
        <h2 className="text-base font-semibold text-white">System Settings & Data Governance</h2>
        <p className="text-xs text-slate-400 max-w-2xl">
          Inspect connector health, AI model routing, email delivery verification, data retention rules, and security audit logs.
        </p>
      </div>

      {/* Grid: Connectors & AI Routing */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Marketplace Connectors Health */}
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Server className="w-4 h-4 text-indigo-400" />
              <span>Marketplace Review Connectors</span>
            </h3>
            <span className="text-[11px] text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              All Verified
            </span>
          </div>

          <div className="space-y-3">
            {Object.entries(connectors).map(([key, conn]: [string, any]) => (
              <div key={key} className="p-3 rounded-lg bg-slate-800/40 border border-slate-800 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white capitalize">{key === 'googleplay' ? 'Google Play Store' : key === 'microsoft' ? 'Microsoft Store' : 'Steam'}</span>
                  <div className="flex items-center gap-2 font-mono text-[11px] tabular-nums">
                    <span className="text-emerald-400">{conn.latencyMs}ms</span>
                    <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/40 uppercase text-[10px]">
                      {conn.status}
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400">
                  {conn.message}
                </p>
                <div className="text-[10px] text-slate-500">
                  Coverage: {conn.reviewCoverage}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AI & Delivery Configuration */}
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Cpu className="w-4 h-4 text-indigo-400" />
            <span>AI Model & Outreach Delivery</span>
          </h3>

          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-800 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">Gemini 3.8 Intelligence Model</span>
                <span className="text-emerald-400 font-mono text-[11px]">gemini-3.8-flash</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Server-side @google/genai SDK configured with User-Agent telemetry. No client-side key exposure.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-800 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">Outreach Dispatch Provider</span>
                <span className="text-slate-300 font-mono text-[11px]">Sandboxed B2B Engine</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Enforces suppression verification, unsubscribe links, and human sign-off prior to delivery.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">Review Retention Policy</span>
                <span className="text-indigo-400 font-mono font-bold tabular-nums">{retentionDays} Days</span>
              </div>
              <input
                type="range"
                min="30"
                max="365"
                step="30"
                value={retentionDays}
                onChange={(e) => setRetentionDays(Number(e.target.value))}
                className="w-full"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Export Center */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Download className="w-4 h-4 text-indigo-400" />
          <span>Research Data Export Center</span>
        </h3>
        <p className="text-xs text-slate-400">
          Download clean, structured CSV or JSON files with full source attribution, timestamps, and classifications.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-white">Negative Reviews</div>
              <div className="text-[10px] text-slate-400">Verbatim text & ratings</div>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => onExport('reviews', 'csv')}
                className="px-2 py-1 text-xs font-mono bg-slate-700 hover:bg-slate-600 text-white rounded"
              >
                CSV
              </button>
              <button
                onClick={() => onExport('reviews', 'json')}
                className="px-2 py-1 text-xs font-mono bg-slate-700 hover:bg-slate-600 text-white rounded"
              >
                JSON
              </button>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-white">Product Opportunities</div>
              <div className="text-[10px] text-slate-400">Priority scores & solutions</div>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => onExport('opportunities', 'csv')}
                className="px-2 py-1 text-xs font-mono bg-slate-700 hover:bg-slate-600 text-white rounded"
              >
                CSV
              </button>
              <button
                onClick={() => onExport('opportunities', 'json')}
                className="px-2 py-1 text-xs font-mono bg-slate-700 hover:bg-slate-600 text-white rounded"
              >
                JSON
              </button>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-white">Business Contacts</div>
              <div className="text-[10px] text-slate-400">Publishers & channels</div>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => onExport('contacts', 'csv')}
                className="px-2 py-1 text-xs font-mono bg-slate-700 hover:bg-slate-600 text-white rounded"
              >
                CSV
              </button>
              <button
                onClick={() => onExport('contacts', 'json')}
                className="px-2 py-1 text-xs font-mono bg-slate-700 hover:bg-slate-600 text-white rounded"
              >
                JSON
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Security Audit Log */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Security & Compliance Audit Log</span>
          </h3>
          <span className="text-[11px] font-mono text-slate-400">{auditLogs.length} events logged</span>
        </div>

        <div className="max-h-56 overflow-y-auto divide-y divide-slate-800 border border-slate-800 rounded-lg text-xs bg-slate-850">
          {auditLogs.map((log) => (
            <div key={log.id} className="p-2.5 flex items-start justify-between gap-4 hover:bg-slate-800/40">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] uppercase font-bold text-indigo-400 bg-indigo-950 px-1.5 py-0.5 rounded">
                    {log.action}
                  </span>
                  <span className="font-medium text-slate-200">{log.entityType}</span>
                </div>
                <p className="text-[11px] text-slate-400">{log.details}</p>
              </div>
              <span className="text-[10px] font-mono text-slate-500 tabular-nums shrink-0">
                {log.timestamp.slice(11, 19)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
