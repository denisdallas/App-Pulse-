import React from 'react';
import { Application, Review } from '../types.ts';
import { Star, AlertTriangle, Layers, CheckCircle2, X, Plus } from 'lucide-react';

interface CompetitorCompareViewProps {
  allApps: Application[];
  selectedCompareIds: string[];
  onToggleCompare: (appId: string) => void;
  reviews: Review[];
}

export const CompetitorCompareView: React.FC<CompetitorCompareViewProps> = ({
  allApps,
  selectedCompareIds,
  onToggleCompare,
  reviews,
}) => {
  const comparedApps = allApps.filter((a) => selectedCompareIds.includes(a.id));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Selector Strip */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Competitor Benchmarking Matrix</h2>
            <p className="text-xs text-slate-400">Select 2 to 4 applications to compare weaknesses, negative rates, and top complaints side-by-side</p>
          </div>

          <div className="text-xs text-slate-400 font-mono tabular-nums">
            {comparedApps.length}/4 competitors selected
          </div>
        </div>

        {/* Selected Apps Badges & Quick Picker */}
        <div className="flex flex-wrap items-center gap-2">
          {allApps.map((app) => {
            const isSelected = selectedCompareIds.includes(app.id);
            return (
              <button
                key={app.id}
                onClick={() => onToggleCompare(app.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700/60'
                }`}
              >
                <span>{app.name}</span>
                {isSelected ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3 text-slate-500" />}
              </button>
            );
          })}
        </div>
      </div>

      {comparedApps.length < 2 ? (
        <div className="p-12 text-center rounded-xl bg-slate-900 border border-slate-800 space-y-3">
          <Layers className="w-8 h-8 text-indigo-400 mx-auto" />
          <h3 className="text-sm font-semibold text-slate-200">Select at least 2 competitors</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Choose applications above (or from App Discovery) to generate a detailed head-to-head vulnerability analysis.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[760px] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {comparedApps.map((app) => {
              const appReviews = reviews.filter((r) => r.appId === app.id);
              const negativeReviews = appReviews.filter((r) => r.starRating <= 2);
              const negRate = appReviews.length > 0 ? Math.round((negativeReviews.length / appReviews.length) * 100) : 0;
              const featureRequests = appReviews.filter((r) => r.classification?.isFeatureRequest);

              // Top complaint categories
              const catCounts: Record<string, number> = {};
              for (const r of negativeReviews) {
                const cat = r.classification?.category || 'Other';
                catCounts[cat] = (catCounts[cat] || 0) + 1;
              }
              const topCategories = Object.entries(catCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3);

              return (
                <div
                  key={app.id}
                  className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-5 flex flex-col justify-between"
                >
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[10px] font-mono uppercase text-slate-400 tracking-wider">
                          {app.marketplace} · {app.category}
                        </span>
                        <h3 className="text-sm font-bold text-white mt-0.5">{app.name}</h3>
                        <div className="text-xs text-slate-400">{app.publisher}</div>
                      </div>

                      <button
                        onClick={() => onToggleCompare(app.id)}
                        className="text-slate-500 hover:text-slate-300 p-1"
                        title="Remove from comparison"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Ratings & Metrics */}
                    <div className="grid grid-cols-2 gap-2 p-3 rounded-lg bg-slate-800/60 border border-slate-800 text-xs font-mono tabular-nums">
                      <div>
                        <span className="text-[10px] text-slate-400 block font-sans">Store Rating</span>
                        <span className="text-amber-400 font-bold flex items-center gap-1 mt-0.5">
                          <Star className="w-3.5 h-3.5 fill-amber-400" />
                          {app.rating.toFixed(1)} / 5.0
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block font-sans">Total Volume</span>
                        <span className="text-slate-200 font-bold mt-0.5 block">
                          {app.ratingCount.toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block font-sans">Negative Ratio</span>
                        <span className="text-rose-400 font-bold mt-0.5 block">
                          {negRate}%
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block font-sans">Feature Requests</span>
                        <span className="text-indigo-400 font-bold mt-0.5 block">
                          {featureRequests.length} logged
                        </span>
                      </div>
                    </div>

                    {/* Top Complaints */}
                    <div className="space-y-2">
                      <span className="text-xs font-semibold text-slate-200">
                        Top Customer Complaints:
                      </span>
                      <div className="space-y-1.5">
                        {topCategories.map(([cat, count]) => (
                          <div key={cat} className="flex items-center justify-between text-xs p-2 rounded bg-slate-800/40 border border-slate-800">
                            <span className="text-slate-300">{cat}</span>
                            <span className="text-amber-400 font-mono tabular-nums">{count} reviews</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Verbatim Vulnerability Quote */}
                    {negativeReviews[0] && (
                      <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-900/40 text-xs space-y-1">
                        <span className="text-[10px] font-semibold text-rose-400 block uppercase">
                          Exemplary Customer Friction:
                        </span>
                        <p className="text-slate-300 italic text-[11px] leading-relaxed">
                          "{negativeReviews[0].text.slice(0, 140)}..."
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Summary Conclusion */}
                  <div className="pt-3 border-t border-slate-800 text-[11px] text-slate-400">
                    <span className="font-semibold text-slate-300">Strategic Moat / Weakness: </span>
                    {app.tags.join(', ')}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
