import React, { useState } from 'react';
import { ComplaintTheme, Application, Review, PredictedWeakness } from '../types.ts';
import { 
  BrainCircuit, 
  Sparkles, 
  Quote, 
  CheckCircle, 
  AlertTriangle, 
  Layers, 
  Lightbulb, 
  Calendar, 
  ShieldCheck, 
  ArrowRight,
  TrendingUp,
  Clock,
  Target,
  Zap,
  ArrowUpRight,
  BarChart3,
  Flame,
  CheckCircle2
} from 'lucide-react';

interface ComplaintAnalyticsViewProps {
  themes: ComplaintTheme[];
  apps: Application[];
  reviews: Review[];
  forecasts: PredictedWeakness[];
  onTriggerAI: () => void;
  isAnalyzing: boolean;
  onTriggerForecast: () => void;
  isForecasting: boolean;
  onPromoteForecast: (id: string) => void;
  onGenerateOpportunities: () => void;
  isGeneratingOpps: boolean;
}

export const ComplaintAnalyticsView: React.FC<ComplaintAnalyticsViewProps> = ({
  themes,
  apps,
  reviews,
  forecasts,
  onTriggerAI,
  isAnalyzing,
  onTriggerForecast,
  isForecasting,
  onPromoteForecast,
  onGenerateOpportunities,
  isGeneratingOpps,
}) => {
  const [activeTab, setActiveTab] = useState<'forecasts' | 'themes'>('forecasts');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedThemeId, setExpandedThemeId] = useState<string | null>(null);
  const [expandedForecastId, setExpandedForecastId] = useState<string | null>(null);
  const [promotedIds, setPromotedIds] = useState<Set<string>>(new Set());

  const categories = ['all', ...Array.from(new Set(themes.map((t) => t.category)))];

  const filteredThemes = themes.filter((t) => {
    if (selectedCategory !== 'all' && t.category !== selectedCategory) return false;
    return true;
  });

  const filteredForecasts = forecasts.filter((f) => {
    if (selectedCategory !== 'all' && f.category !== selectedCategory) return false;
    return true;
  });

  const handlePromote = (id: string) => {
    onPromoteForecast(id);
    setPromotedIds((prev) => new Set(prev).add(id));
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-400 bg-emerald-950/60 border-emerald-500/50';
    if (score >= 65) return 'text-amber-400 bg-amber-950/60 border-amber-500/50';
    return 'text-sky-400 bg-sky-950/60 border-sky-500/50';
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner & AI Controls */}
      <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-indigo-400 bg-indigo-950 border border-indigo-800/40 px-2 py-0.5 rounded flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-indigo-400" />
              Gemini 3.8 Intelligence Engine
            </span>
            <span className="text-xs text-slate-400">
              Clustered across {reviews.length} negative reviews
            </span>
          </div>
          <h2 className="text-base font-semibold text-white">
            Predictive Weakness Engine & Complaint Intelligence
          </h2>
          <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
            Forecast upcoming competitor vulnerabilities, calculate Future Opportunity Scores, and distill recurring friction into actionable software wedges before incumbents react.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            onClick={onTriggerForecast}
            disabled={isForecasting}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors disabled:opacity-50"
          >
            <TrendingUp className={`w-3.5 h-3.5 ${isForecasting ? 'animate-spin' : ''}`} />
            <span>{isForecasting ? 'Forecasting Gaps...' : 'Predict Market Gaps'}</span>
          </button>

          <button
            onClick={onTriggerAI}
            disabled={isAnalyzing}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors disabled:opacity-50"
          >
            <BrainCircuit className={`w-3.5 h-3.5 ${isAnalyzing ? 'animate-spin' : ''}`} />
            <span>{isAnalyzing ? 'Clustering...' : 'Re-Cluster Complaints'}</span>
          </button>

          <button
            onClick={onGenerateOpportunities}
            disabled={isGeneratingOpps}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-amber-200 bg-amber-950/60 hover:bg-amber-900 border border-amber-700/50 rounded-lg transition-colors disabled:opacity-50"
          >
            <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
            <span>{isGeneratingOpps ? 'Extracting...' : 'Turn into Opportunities'}</span>
          </button>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('forecasts')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'forecasts'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Predictive Weakness & Market Gap Forecasts</span>
            <span className="font-mono text-[11px] px-1.5 py-0.2 bg-black/30 rounded">
              {forecasts.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('themes')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'themes'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Current Complaint Themes</span>
            <span className="font-mono text-[11px] px-1.5 py-0.2 bg-black/30 rounded">
              {themes.length}
            </span>
          </button>
        </div>

        {/* Category Filter */}
        <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
          {categories.slice(0, 5).map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2.5 py-1 rounded text-[11px] transition-colors ${
                selectedCategory === cat
                  ? 'bg-slate-800 text-indigo-300 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {cat === 'all' ? 'All Categories' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: Predictive Weakness Forecasts */}
      {activeTab === 'forecasts' && (
        <div className="space-y-4">
          {/* Methodology Banner */}
          <div className="p-3.5 rounded-lg bg-slate-900/60 border border-slate-800 text-xs text-slate-400 flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Future Opportunity Score:</strong> Weighted research heuristic using review-sample trend (35%), classified severity (30%), catalog update cadence (20%), and the number of applications linked to supporting reviews (15%). It does not estimate churn or market size.
              </span>
            </div>
            <span className="text-[11px] font-mono text-indigo-400 shrink-0">
              Forecast Horizon: 3 to 12 Months
            </span>
          </div>

          {filteredForecasts.length === 0 ? (
            <div className="p-12 text-center rounded-xl bg-slate-900 border border-slate-800 space-y-3">
              <TrendingUp className="w-8 h-8 text-slate-500 mx-auto" />
              <p className="text-xs text-slate-300">No weakness forecasts match your filter.</p>
              <button
                onClick={onTriggerForecast}
                className="px-3 py-1.5 bg-indigo-600 text-white rounded text-xs"
              >
                Run Predictive Gap Forecast
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredForecasts.map((forecast) => {
                const isExpanded = expandedForecastId === forecast.id;
                const isPromoted = promotedIds.has(forecast.id) || forecast.status === 'promoted_to_opportunity';
                const scoreColorClass = getScoreColor(forecast.futureOpportunityScore);

                return (
                  <div
                    key={forecast.id}
                    className="p-5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all space-y-4"
                  >
                    {/* Forecast Header Strip */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-indigo-400">
                            {forecast.category}
                          </span>
                          <span aria-hidden="true" className="text-slate-400">·</span>
                          <span className="text-[11px] text-slate-400 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {forecast.forecastedWindowMonths}-Month Validation Horizon
                          </span>
                          <span aria-hidden="true" className="text-slate-400">·</span>
                          <span className="text-[11px] text-rose-400 font-mono font-medium">
                            {forecast.riskBasis === 'negative_review_share_proxy' ? `${forecast.negativeReviewSharePct ?? 0}% negative in sample` : 'Rating coverage insufficient'}
                          </span>
                        </div>
                        <h3 className="text-sm font-semibold text-white">
                          {forecast.weaknessTitle}
                        </h3>
                        <p className="text-[11px] text-slate-500">
                          {forecast.negativeReviewCount ?? 0} negative of {forecast.ratingSampleCount ?? 0} rated reviews in the collected sample
                          {forecast.coverageStartDate && forecast.coverageEndDate ? ` · ${forecast.coverageStartDate.slice(0, 10)} to ${forecast.coverageEndDate.slice(0, 10)}` : ''}
                        </p>
                      </div>

                      {/* Future Opportunity Score Badge */}
                      <div className="flex items-center gap-3 shrink-0">
                        <div className={`px-3 py-1.5 rounded-lg border flex flex-col items-end ${scoreColorClass}`}>
                          <div className="flex items-center gap-1">
                            <Flame className="w-3.5 h-3.5" />
                            <span className="text-base font-bold font-mono tabular-nums leading-none">
                              {forecast.futureOpportunityScore}
                            </span>
                            <span className="text-[10px] text-slate-400 leading-none">/ 100</span>
                          </div>
                          <span className="text-[9px] uppercase tracking-wider font-semibold opacity-80 mt-0.5">
                            Future Opp Score
                          </span>
                        </div>

                        <button
                          onClick={() => handlePromote(forecast.id)}
                          disabled={isPromoted}
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors shrink-0 ${
                            isPromoted
                              ? 'bg-slate-800 text-slate-400 cursor-default'
                              : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm'
                          }`}
                        >
                          {isPromoted ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Promoted</span>
                            </>
                          ) : (
                            <>
                              <ArrowUpRight className="w-3.5 h-3.5" />
                              <span>Promote to Opportunity</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Competitors & Update Cadence */}
                    <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
                      <span className="text-slate-400 font-medium">Evidence-linked applications:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {forecast.competitorAppNames.map((name) => {
                          const matchedApp = apps.find((a) => a.name === name);
                          return (
                            <span
                              key={name}
                              className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 text-[11px] flex items-center gap-1"
                            >
                              <span>{name}</span>
                              {matchedApp && (
                                <span className="text-slate-400 font-mono text-[10px]">
                                  ({matchedApp.updateFrequency} cadence)
                                </span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </div>

                    {/* Root Cause & Market Gap */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1">
                        <span className="font-semibold text-rose-400 flex items-center gap-1 text-[11px]">
                          <AlertTriangle className="w-3 h-3" />
                          Review interpretation / unverified cause:
                        </span>
                        <p className="text-slate-300 leading-relaxed text-[11px]">
                          {forecast.rootCauseTrend}
                        </p>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1">
                        <span className="font-semibold text-indigo-400 flex items-center gap-1 text-[11px]">
                          <Target className="w-3 h-3" />
                          Potential gap to validate:
                        </span>
                        <p className="text-slate-300 leading-relaxed text-[11px]">
                          {forecast.marketGapSummary}
                        </p>
                      </div>
                    </div>

                    {/* Suggested Wedge Feature */}
                    <div className="p-3.5 rounded-lg bg-indigo-950/30 border border-indigo-900/40 flex items-start gap-2.5">
                      <Zap className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div className="space-y-0.5 text-xs">
                        <span className="font-semibold text-amber-300">
                          Recommended Counter-Feature / Agile Wedge:
                        </span>
                        <p className="text-slate-200 leading-relaxed text-[11px]">
                          {forecast.suggestedWedgeFeature}
                        </p>
                      </div>
                    </div>

                    {/* Score Breakdown Bars */}
                    <div className="p-3.5 rounded-lg bg-slate-800/50 border border-slate-800 space-y-2">
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        Research Heuristic Score Dimensions
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div>
                          <div className="flex justify-between text-[11px] text-slate-300 mb-1">
                            <span>Trend Velocity (35%)</span>
                            <span className="font-mono text-indigo-400">{forecast.scoreBreakdown.trendVelocityScore}</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-indigo-500 rounded-full"
                              style={{ width: `${forecast.scoreBreakdown.trendVelocityScore}%` }}
                            />
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between text-[11px] text-slate-300 mb-1">
                            <span>Severity Impact (30%)</span>
                            <span className="font-mono text-rose-400">{forecast.scoreBreakdown.severityImpactScore}</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-rose-500 rounded-full"
                              style={{ width: `${forecast.scoreBreakdown.severityImpactScore}%` }}
                            />
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between text-[11px] text-slate-300 mb-1">
                            <span>Incumbent Inertia (20%)</span>
                            <span className="font-mono text-amber-400">{forecast.scoreBreakdown.incumbentInertiaScore}</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-amber-500 rounded-full"
                              style={{ width: `${forecast.scoreBreakdown.incumbentInertiaScore}%` }}
                            />
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between text-[11px] text-slate-300 mb-1">
                            <span>Evidence Breadth (15%)</span>
                            <span className="font-mono text-emerald-400">{forecast.scoreBreakdown.evidenceBreadthScore}</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full"
                              style={{ width: `${forecast.scoreBreakdown.evidenceBreadthScore}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Verbatim Evidence Quotes */}
                    {forecast.evidenceReviewQuotes && forecast.evidenceReviewQuotes.length > 0 && (
                      <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-800 space-y-1.5">
                        <div className="flex items-center gap-1 text-[11px] text-slate-400 font-medium">
                          <Quote className="w-3 h-3 text-indigo-400" />
                          <span>Verbatim excerpts from supporting reviews:</span>
                        </div>
                        <div className="space-y-1 pl-2 border-l-2 border-indigo-500/40">
                          {forecast.evidenceReviewQuotes.map((q, idx) => (
                            <p key={idx} className="text-xs text-slate-300 italic">
                              "{q}"
                            </p>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Expandable Validation Roadmap */}
                    {isExpanded && (
                      <div className="pt-3 border-t border-slate-800 space-y-2 text-xs">
                        <span className="font-semibold text-slate-200">
                          Market Validation Milestones:
                        </span>
                        <ul className="list-disc list-inside space-y-1 text-slate-300 pl-1 text-[11px]">
                          {forecast.validationMilestones.map((m, idx) => (
                            <li key={idx}>{m}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="flex justify-end pt-1">
                      <button
                        onClick={() => setExpandedForecastId(isExpanded ? null : forecast.id)}
                        className="text-xs text-indigo-400 hover:text-indigo-300"
                      >
                        {isExpanded ? 'Hide validation roadmap' : 'View validation roadmap →'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Clustered Complaint Themes */}
      {activeTab === 'themes' && (
        <div className="space-y-4">
          {filteredThemes.map((theme) => {
            const isExpanded = expandedThemeId === theme.id;
            const severityColors = {
              Critical: 'text-rose-400 bg-rose-950/40 border-rose-800/40',
              High: 'text-amber-400 bg-amber-950/40 border-amber-800/40',
              Medium: 'text-sky-400 bg-sky-950/40 border-sky-800/40',
              Low: 'text-emerald-400 bg-emerald-950/40 border-emerald-800/40',
            }[theme.severity];

            return (
              <div
                key={theme.id}
                className="p-5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all space-y-4"
              >
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${severityColors}`}>
                        {theme.severity} Severity
                      </span>
                      <span className="text-xs font-semibold text-indigo-400">
                        {theme.category}
                      </span>
                      <span aria-hidden="true" className="text-slate-400">·</span>
                      <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                        {Math.round(theme.confidenceScore * 100)}% AI Confidence
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-white">
                      {theme.title}
                    </h3>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-400 font-mono tabular-nums shrink-0">
                    <div className="flex items-center gap-1">
                      <span className="text-white font-bold">{theme.reviewCount}</span>
                      <span>matching reviews</span>
                    </div>
                    <span aria-hidden="true">·</span>
                    <div className="flex items-center gap-1">
                      <span className="text-white font-bold">{theme.affectedAppNames.length}</span>
                      <span>affected apps</span>
                    </div>
                  </div>
                </div>

                {/* Summary */}
                <p className="text-xs text-slate-300 leading-relaxed">
                  {theme.summary}
                </p>

                {/* Affected Apps Strip */}
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="text-slate-400 font-medium">Affected competitors:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {theme.affectedAppNames.map((appName) => (
                      <span key={appName} className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 text-[11px]">
                        {appName}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Representative Quotes Carousel / List */}
                <div className="p-3.5 rounded-lg bg-slate-800/60 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                    <Quote className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Verbatim Review Quotes (Evidence Base):</span>
                  </div>
                  <div className="space-y-1.5 pl-2 border-l-2 border-indigo-500/40">
                    {theme.representativeQuotes.map((quote, idx) => (
                      <p key={idx} className="text-xs text-slate-300 italic">
                        "{quote}"
                      </p>
                    ))}
                  </div>
                </div>

                {/* Actionable Improvement & Validation Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-800/80 text-xs">
                  <div className="space-y-1">
                    <span className="font-semibold text-emerald-400 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Proposed Product Improvement:
                    </span>
                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      {theme.potentialImprovement}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <span className="font-semibold text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Validation Hypothesis:
                    </span>
                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      {theme.validationHypothesis}
                    </p>
                  </div>
                </div>

                {/* Validation Steps Toggle */}
                {isExpanded && (
                  <div className="pt-3 border-t border-slate-800 space-y-2">
                    <span className="text-xs font-semibold text-slate-200">Recommended Next Validation Actions:</span>
                    <ul className="list-disc list-inside space-y-1 text-xs text-slate-400 pl-1">
                      {theme.validationSteps.map((step, idx) => (
                        <li key={idx} className="text-slate-300">{step}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex justify-end pt-1">
                  <button
                    onClick={() => setExpandedThemeId(isExpanded ? null : theme.id)}
                    className="text-xs text-indigo-400 hover:text-indigo-300"
                  >
                    {isExpanded ? 'Hide validation roadmap' : 'View validation roadmap →'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
