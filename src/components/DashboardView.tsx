import React from 'react';
import { SystemStats, ComplaintTheme, Opportunity, CollectionJob, Campaign } from '../types.ts';
import { ViewTab } from './Sidebar.tsx';
import { 
  AppWindow, 
  MessageSquareWarning, 
  TrendingUp, 
  Lightbulb, 
  Send, 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  ArrowRight
} from 'lucide-react';

interface DashboardViewProps {
  stats: SystemStats | null;
  themes: ComplaintTheme[];
  opportunities: Opportunity[];
  jobs: CollectionJob[];
  campaigns: Campaign[];
  onNavigate: (tab: ViewTab) => void;
  onSelectOpportunity?: (opp: Opportunity) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  stats,
  themes,
  opportunities,
  jobs,
  campaigns,
  onNavigate,
  onSelectOpportunity,
}) => {
  if (!stats) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-slate-400 text-sm animate-pulse">Loading intelligence telemetry...</div>
      </div>
    );
  }

  const negativeRate = stats.totalReviews > 0 ? Math.round((stats.negativeReviews / stats.totalReviews) * 100) : 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Discovered Apps</span>
            <AppWindow className="w-4 h-4 text-slate-500" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-white">
            {stats.totalApps}
          </div>
          <div className="text-[11px] text-slate-400">
            Across Steam, Google Play, MS Store
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Negative Feedback</span>
            <MessageSquareWarning className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-amber-400">
            {stats.negativeReviews}
            <span className="text-xs font-normal text-slate-400 ml-1.5 font-sans">
              ({negativeRate}% of total)
            </span>
          </div>
          <div className="text-[11px] text-slate-400">
            1-star and 2-star complaints prioritized
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Identified Opportunities</span>
            <Lightbulb className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-indigo-400">
            {stats.totalOpportunities}
          </div>
          <div className="text-[11px] text-slate-400">
            Scored product concepts from churn
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>B2B Outreach Prospects</span>
            <Send className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-white">
            {stats.totalContacts}
          </div>
          <div className="text-[11px] text-slate-400">
            {stats.activeCampaigns} campaigns in flight
          </div>
        </div>
      </div>

      {/* Main Grid: Complaints Breakdown & Emerging Themes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Complaint Categories Breakdown & Emerging Themes */}
        <div className="lg:col-span-2 space-y-6">
          {/* Top Complaint Categories */}
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Top Friction & Complaint Categories</h3>
                <p className="text-xs text-slate-400">Distribution of classified customer pain points across all apps</p>
              </div>
              <button
                onClick={() => onNavigate('reviews')}
                className="text-xs font-medium text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
              >
                <span>View all reviews</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3">
              {stats.complaintBreakdown.slice(0, 6).map((item) => {
                const maxCount = Math.max(...stats.complaintBreakdown.map((b) => b.count), 1);
                const pct = Math.round((item.count / maxCount) * 100);
                return (
                  <div key={item.category} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-300 font-medium">{item.category}</span>
                      <span className="font-mono text-slate-400 tabular-nums">
                        {item.count} reviews
                      </span>
                    </div>
                    <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-amber-500 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Emerging Complaint Themes */}
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Emerging Complaint Themes</h3>
                <p className="text-xs text-slate-400">AI-clustered recurring patterns across multiple competing applications</p>
              </div>
              <button
                onClick={() => onNavigate('analytics')}
                className="text-xs font-medium text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
              >
                <span>Deep dive</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="divide-y divide-slate-800">
              {themes.slice(0, 3).map((theme) => (
                <div key={theme.id} className="py-3.5 first:pt-0 last:pb-0 space-y-2">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h4 className="text-xs font-semibold text-slate-200">{theme.title}</h4>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                        <span className="text-amber-400 font-medium">{theme.category}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{theme.reviewCount} matching reviews</span>
                        <span aria-hidden="true">·</span>
                        <span>Severity: {theme.severity}</span>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-300 shrink-0">
                      {theme.trend}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 line-clamp-2">
                    {theme.summary}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Col: High-Priority Opportunities & Recent Ingestion Jobs */}
        <div className="space-y-6">
          {/* Top Opportunities */}
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Top Opportunities</h3>
              <button
                onClick={() => onNavigate('opportunities')}
                className="text-xs font-medium text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
              >
                <span>View all</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3">
              {opportunities.slice(0, 3).map((opp) => (
                <div
                  key={opp.id}
                  onClick={() => onSelectOpportunity?.(opp)}
                  className="p-3 rounded-lg bg-slate-800/60 border border-slate-700/60 hover:border-indigo-500/50 cursor-pointer transition-all space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-200 truncate pr-2">
                      {opp.title}
                    </span>
                    <span className="font-mono text-xs font-bold text-indigo-400 tabular-nums shrink-0">
                      {opp.priorityScore}/100
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 line-clamp-2">
                    {opp.problemStatement}
                  </p>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400">
                    <span>{opp.supportingAppNames.length} competing apps</span>
                    <span aria-hidden="true">·</span>
                    <span className="capitalize">{opp.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Collection Jobs */}
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Review Ingestion Jobs</h3>
              <span className="text-[11px] font-mono text-slate-400">{jobs.length} total</span>
            </div>

            <div className="space-y-3">
              {jobs.slice(0, 4).map((job) => (
                <div key={job.id} className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-800 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-200 truncate">{job.appName}</span>
                    <span className="flex items-center gap-1 text-[11px] capitalize text-slate-400">
                      {job.status === 'completed' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      ) : job.status === 'running' ? (
                        <Clock className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                      )}
                      {job.status}
                    </span>
                  </div>
                  {job.status === 'running' ? (
                    <div className="w-full bg-slate-700 h-1 rounded-full overflow-hidden">
                      <div className="bg-indigo-500 h-full transition-all" style={{ width: `${job.progress}%` }} />
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-400 font-mono tabular-nums flex items-center justify-between">
                      <span>{job.collectedCount} reviews</span>
                      <span>{job.deduplicatedCount} dupes discarded</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
