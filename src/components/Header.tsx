import React from 'react';
import { ViewTab } from './Sidebar.tsx';
import { Download, Sparkles, RefreshCw } from 'lucide-react';

interface HeaderProps {
  currentTab: ViewTab;
  onRefresh: () => void;
  onExport: (type: 'reviews' | 'opportunities' | 'contacts') => void;
  onRunAI?: () => void;
  isAnalyzing?: boolean;
  onToggleMobileMenu?: () => void;
}

const tabTitles: Record<ViewTab, { title: string; subtitle: string }> = {
  dashboard: { title: 'Executive Overview', subtitle: 'Cross-platform app telemetry, review velocity, and complaint vectors' },
  discovery: { title: 'Application Discovery', subtitle: 'Search digital marketplaces, inspect metadata, and schedule review ingestion' },
  reviews: { title: 'Negative Review Intelligence', subtitle: '1-Star and 2-Star complaints, feature gaps, and failure patterns' },
  analytics: { title: 'AI Complaint Clustering', subtitle: 'Automated complaint taxonomy, root cause summaries, and evidence quotes' },
  compare: { title: 'Competitor Comparison', subtitle: 'Side-by-side weakness benchmarking and market vulnerability analysis' },
  opportunities: { title: 'Product Opportunity Finder', subtitle: 'Prioritized product opportunities backed by real user churn evidence' },
  outreach: { title: 'B2B Outreach Studio', subtitle: 'Verified business contacts, ethical personalized pitches, and suppression lists' },
  projects: { title: 'Research Collections', subtitle: 'Curated research workspaces, competitor dossiers, and analyst notes' },
  settings: { title: 'System & Connector Settings', subtitle: 'Marketplace connectors, rate-limits, Gemini model status, and audit logs' },
};

export const Header: React.FC<HeaderProps> = ({ currentTab, onRefresh, onExport, onRunAI, isAnalyzing, onToggleMobileMenu }) => {
  const current = tabTitles[currentTab];

  return (
    <header className="h-16 px-4 md:px-6 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md flex items-center justify-between gap-4 shrink-0 z-10 sticky top-0">
      {/* Zone 1: Contextual Title & Breadcrumb + Mobile Menu Toggle */}
      <div className="flex items-center gap-3 min-w-0">
        {onToggleMobileMenu && (
          <button
            onClick={onToggleMobileMenu}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white md:hidden hover:bg-slate-800"
            title="Toggle Menu"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}

        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>AppPulse</span>
            <span aria-hidden="true">/</span>
            <span className="text-slate-200 font-medium capitalize">{currentTab}</span>
          </div>
          <h1 className="text-sm font-semibold text-white tracking-tight truncate">
            {current.title}
          </h1>
        </div>
      </div>

      {/* Zone 2: Subtitle descriptor */}
      <div className="hidden lg:block text-xs text-slate-400 truncate max-w-md">
        {current.subtitle}
      </div>

      {/* Zone 3: Primary Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onRefresh}
          className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          title="Refresh Data"
        >
          <RefreshCw className="w-4 h-4" />
        </button>

        {onRunAI && (
          <button
            onClick={onRunAI}
            disabled={isAnalyzing}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-indigo-200 bg-indigo-950 border border-indigo-700/50 hover:bg-indigo-900 rounded-lg transition-all shadow-sm shadow-indigo-950 disabled:opacity-50"
            title="Run AI Analysis"
          >
            <Sparkles className={`w-3.5 h-3.5 text-indigo-400 ${isAnalyzing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isAnalyzing ? 'Analyzing...' : 'Run AI Analysis'}</span>
          </button>
        )}

        <button
          onClick={() => onExport(currentTab === 'opportunities' ? 'opportunities' : currentTab === 'outreach' ? 'contacts' : 'reviews')}
          className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
          title="Export CSV"
        >
          <Download className="w-3.5 h-3.5 text-slate-400" />
          <span className="hidden sm:inline">Export CSV</span>
        </button>
      </div>
    </header>
  );
};
