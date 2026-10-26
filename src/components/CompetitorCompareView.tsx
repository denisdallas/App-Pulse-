import React from 'react';
import type { Application, CompetitorAnalysisResult } from '../types.ts';
import { Activity, AlertTriangle, Layers, Plus, RefreshCw, ShieldCheck, Star, X } from 'lucide-react';

interface CompetitorCompareViewProps {
  allApps: Application[];
  selectedCompareIds: string[];
  onToggleCompare: (appId: string) => void;
  analysis: CompetitorAnalysisResult | null;
  isAnalyzing: boolean;
  onRunAnalysis: () => void;
}

export const CompetitorCompareView: React.FC<CompetitorCompareViewProps> = ({
  allApps,
  selectedCompareIds,
  onToggleCompare,
  analysis,
  isAnalyzing,
  onRunAnalysis,
}) => {
  const comparedApps = allApps.filter((app) => selectedCompareIds.includes(app.id));
  const selectedKey = [...selectedCompareIds].sort().join('|');
  const analysisKey = [...(analysis?.appIds || [])].sort().join('|');
  const currentAnalysis = analysis && selectedKey === analysisKey ? analysis : null;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Layers className="h-4 w-4 text-indigo-400" /> Evidence-backed competitor comparison
            </h2>
            <p className="mt-1 max-w-2xl text-xs text-slate-400">
              Select 2–4 catalog applications. Any findings must cite stored, non-seed reviews; metrics describe only that sample.
            </p>
          </div>
          <span className="font-mono text-xs tabular-nums text-slate-400">{comparedApps.length}/4 selected</span>
        </div>

        <div className="flex flex-wrap gap-2">
          {allApps.map((app) => {
            const selected = selectedCompareIds.includes(app.id);
            const limitReached = !selected && selectedCompareIds.length >= 4;
            return (
              <button
                key={app.id}
                type="button"
                onClick={() => onToggleCompare(app.id)}
                disabled={limitReached}
                aria-pressed={selected}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${selected ? 'border-indigo-500/50 bg-indigo-600 text-white' : 'border-slate-700 bg-slate-800 text-slate-300 hover:text-white'}`}
              >
                <span>{app.name}</span>
                {selected ? <X className="h-3 w-3" aria-hidden="true" /> : <Plus className="h-3 w-3" aria-hidden="true" />}
              </button>
            );
          })}
          {!allApps.length && <p className="text-xs text-slate-500">No catalog applications are stored in this workspace yet.</p>}
        </div>
      </section>

      {comparedApps.length < 2 ? (
        <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-12 text-center">
          <Layers className="mx-auto h-8 w-8 text-indigo-400" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-slate-200">Select at least two applications</h3>
          <p className="mx-auto max-w-md text-xs text-slate-400">No default or sample competitors are selected. Add real catalog results above to begin.</p>
        </section>
      ) : (
        <>
          <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2 text-xs text-slate-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
              <p>Comparison requires at least two stored source reviews. AppPulse does not infer market-wide rates from this sample.</p>
            </div>
            <button
              type="button"
              onClick={onRunAnalysis}
              disabled={isAnalyzing || comparedApps.length < 2}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isAnalyzing ? 'animate-spin' : ''}`} aria-hidden="true" />
              {isAnalyzing ? 'Comparison queued…' : 'Run comparison'}
            </button>
          </div>

          {currentAnalysis ? (
            <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-5">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Activity className="h-4 w-4 text-indigo-400" /> Analysis result
                  </h3>
                  <p className="mt-1 text-xs text-slate-300">{currentAnalysis.summary}</p>
                </div>
                <span className={`shrink-0 rounded border px-2 py-1 text-[10px] font-medium ${currentAnalysis.provenance === 'ai_generated' ? 'border-indigo-700/60 bg-indigo-950/50 text-indigo-200' : 'border-slate-700 bg-slate-800 text-slate-300'}`}>
                  {currentAnalysis.provenance === 'ai_generated' ? `AI hypothesis${currentAnalysis.model ? ` · ${currentAnalysis.model}` : ''}` : 'Evidence-only calculation'}
                </span>
              </div>

              <p className="text-[11px] text-slate-500">
                {currentAnalysis.evidenceReviewCount.toLocaleString()} stored non-seed review(s) · generated {new Date(currentAnalysis.createdAt).toLocaleString()}
              </p>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                {currentAnalysis.metrics.map((metric) => (
                  <article key={metric.appId} className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/50 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500">{comparedApps.find((app) => app.id === metric.appId)?.marketplace || 'Marketplace'}</p>
                        <h4 className="mt-1 text-sm font-semibold text-white">{metric.appName}</h4>
                      </div>
                      <span className="text-xs font-mono text-amber-300">
                        {comparedApps.find((app) => app.id === metric.appId)?.ratingCount ? <><Star className="mr-1 inline h-3 w-3 fill-amber-300" aria-hidden="true" />{comparedApps.find((app) => app.id === metric.appId)?.rating.toFixed(1)}</> : 'Rating n/a'}
                      </span>
                    </div>
                    <dl className="grid grid-cols-2 gap-2 text-xs">
                      <div><dt className="text-[10px] text-slate-500">Reviews sampled</dt><dd className="mt-0.5 font-mono text-slate-200">{metric.sampleReviewCount.toLocaleString()}</dd></div>
                      <div><dt className="text-[10px] text-slate-500">Negative in sample</dt><dd className="mt-0.5 font-mono text-rose-300">{metric.negativeSharePct === null ? 'n/a' : `${metric.negativeSharePct}%`}</dd></div>
                      <div><dt className="text-[10px] text-slate-500">Negative reviews</dt><dd className="mt-0.5 font-mono text-slate-200">{metric.negativeReviewCount.toLocaleString()}</dd></div>
                      <div><dt className="text-[10px] text-slate-500">Feature requests</dt><dd className="mt-0.5 font-mono text-indigo-300">{metric.featureRequestCount.toLocaleString()}</dd></div>
                    </dl>
                    {metric.topComplaints.length > 0 && (
                      <div className="space-y-1 border-t border-slate-800 pt-2">
                        <p className="text-[10px] font-medium text-slate-400">Classified complaint themes</p>
                        {metric.topComplaints.map((item) => <p key={item.category} className="flex justify-between gap-2 text-[11px] text-slate-300"><span>{item.category}</span><span className="font-mono text-slate-500">{item.count}</span></p>)}
                      </div>
                    )}
                  </article>
                ))}
              </div>

              <div className="space-y-3">
                <h4 className="flex items-center gap-2 text-xs font-semibold text-slate-200"><ShieldCheck className="h-4 w-4 text-emerald-400" aria-hidden="true" />Review-cited findings</h4>
                {currentAnalysis.findings.length ? currentAnalysis.findings.map((finding, index) => (
                  <article key={`${finding.appId}-${index}`} className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/40 p-4">
                    <p className="text-xs font-semibold text-white">{finding.appName}</p>
                    <p className="text-xs leading-relaxed text-slate-300">{finding.finding}</p>
                    <div className="grid gap-2 md:grid-cols-2">
                      {finding.evidenceQuotes.map((quote, quoteIndex) => (
                        <blockquote key={`${finding.evidenceReviewIds[quoteIndex] || index}-${quoteIndex}`} className="rounded border-l-2 border-indigo-500/60 bg-slate-900/70 px-3 py-2 text-[11px] italic leading-relaxed text-slate-400">
                          “{quote}”
                          <footer className="mt-1 not-italic text-[10px] text-slate-600">Review ID: {finding.evidenceReviewIds[quoteIndex] || 'source record'}</footer>
                        </blockquote>
                      ))}
                    </div>
                  </article>
                )) : <p className="rounded-lg border border-slate-800 bg-slate-950/40 p-4 text-xs text-slate-400">No review-backed finding met the evidence threshold. Sample metrics above remain descriptive only.</p>}
              </div>
            </section>
          ) : (
            <section className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-xs text-slate-400">
              No analysis is available for this exact selection. Run a comparison after collecting or importing source reviews.
            </section>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {comparedApps.map((app) => (
              <article key={app.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500">{app.marketplace} · {app.category}</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-white">{app.name}</h3>
                  <button type="button" onClick={() => onToggleCompare(app.id)} className="rounded p-1 text-slate-500 hover:text-white" aria-label={`Remove ${app.name} from comparison`}><X className="h-4 w-4" /></button>
                </div>
                <p className="mt-1 text-xs text-slate-400">{app.publisher}</p>
                <a href={app.storeUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center text-[11px] text-indigo-300 hover:text-indigo-200">Open source catalog record</a>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
