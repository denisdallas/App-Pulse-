import React, { useEffect, useMemo, useState } from 'react';
import { Application, Review, ComplaintTheme, Opportunity, PredictedWeakness } from '../types.ts';
import { ArrowRight, BarChart3, Database, ShieldCheck, Star } from 'lucide-react';

interface DemoPayload {
  mode: 'demo';
  notice: string;
  stats: { totalApps: number; totalReviews: number; negativeReviews: number; totalThemes: number; totalOpportunities: number };
  apps: Application[];
  reviews: Review[];
  themes: ComplaintTheme[];
  opportunities: Opportunity[];
  forecasts: PredictedWeakness[];
}

type DemoTab = 'overview' | 'applications' | 'reviews' | 'insights' | 'opportunities';

interface DemoScreenProps {
  onCreateAccount: () => void;
  onSignIn: () => void;
}

const number = (value: number) => new Intl.NumberFormat().format(value);

export const DemoScreen: React.FC<DemoScreenProps> = ({ onCreateAccount, onSignIn }) => {
  const [data, setData] = useState<DemoPayload | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<DemoTab>('overview');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/demo', { credentials: 'omit' })
      .then(async response => {
        if (!response.ok) throw new Error('The public demo is temporarily unavailable.');
        return response.json();
      })
      .then(payload => { if (active) setData(payload); })
      .catch(err => { if (active) setError(err.message || 'Unable to load demo data.'); });
    return () => { active = false; };
  }, []);

  const filteredApps = useMemo(() => (data?.apps || []).filter(app =>
    `${app.name} ${app.publisher} ${app.category}`.toLowerCase().includes(search.toLowerCase())
  ), [data, search]);

  const tabs: { id: DemoTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'applications', label: 'Applications' },
    { id: 'reviews', label: 'Reviews' },
    { id: 'insights', label: 'Complaint insights' },
    { id: 'opportunities', label: 'Opportunities' },
  ];

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 md:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold">A</div>
            <div><div className="font-semibold tracking-tight">AppPulse Intelligence</div><div className="text-xs text-slate-500">Public product demo</div></div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onSignIn} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-900">Sign in</button>
            <button onClick={onCreateAccount} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500">Create workspace <ArrowRight className="ml-1 inline h-4 w-4" /></button>
          </div>
        </div>
      </header>

      <section className="border-b border-slate-800 bg-gradient-to-b from-indigo-950/40 to-transparent">
        <div className="mx-auto max-w-7xl px-4 py-10 md:px-8 md:py-14">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-700/50 bg-indigo-950/60 px-3 py-1 text-xs font-medium text-indigo-200"><ShieldCheck className="h-3.5 w-3.5" /> Read-only public demo</div>
          <h1 className="max-w-3xl text-3xl font-bold tracking-tight md:text-5xl">Turn app complaints into <span className="text-indigo-400">product opportunities.</span></h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-400 md:text-base">Explore how AppPulse organizes application data, surfaces negative feedback patterns, and translates recurring problems into product hypotheses. No account is required to explore this sample.</p>
          <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-amber-200"><Database className="h-4 w-4" /> Illustrative sample records only — not live marketplace collection or verified current metrics.</div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
        {error && <div role="alert" className="rounded-xl border border-amber-800 bg-amber-950/40 p-4 text-sm text-amber-200">{error}</div>}
        {!data && !error && <div className="py-16 text-center text-sm text-slate-400">Loading public sample…</div>}
        {data && <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
            {[
              ['Sample applications', data.stats.totalApps],
              ['Sample reviews', data.stats.totalReviews],
              ['Negative reviews', data.stats.negativeReviews],
              ['Complaint themes', data.stats.totalThemes],
              ['Opportunities', data.stats.totalOpportunities],
            ].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="text-xs text-slate-400">{label}</div><div className="mt-2 text-2xl font-bold tabular-nums">{number(Number(value))}</div></div>)}
          </div>

          <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-800 pb-2">
            {tabs.map(item => <button key={item.id} onClick={() => setTab(item.id)} className={`shrink-0 rounded-lg px-3 py-2 text-sm transition ${tab === item.id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}>{item.label}</button>)}
          </nav>

          {tab === 'overview' && <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-xl border border-slate-800 bg-slate-900 p-5"><div className="mb-4 flex items-center gap-2 font-semibold"><BarChart3 className="h-4 w-4 text-indigo-400" /> What the demo shows</div><div className="space-y-4 text-sm text-slate-300"><p><b className="text-white">Discovery:</b> a sample catalogue of applications across multiple categories and marketplaces.</p><p><b className="text-white">Review intelligence:</b> sample negative feedback organized by rating, application, and complaint type.</p><p><b className="text-white">Complaint analysis:</b> recurring themes with severity, frequency, and evidence examples.</p><p><b className="text-white">Opportunity research:</b> product hypotheses derived from the sample complaint patterns.</p></div></section>
            <section className="rounded-xl border border-indigo-800/60 bg-indigo-950/30 p-5"><h2 className="font-semibold">Want to test the working application?</h2><p className="mt-2 text-sm leading-6 text-slate-300">Create an account to get a private workspace. Your research, saved records, and settings remain separate from other users.</p><button onClick={onCreateAccount} className="mt-5 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold hover:bg-indigo-500">Create your private workspace <ArrowRight className="ml-1 inline h-4 w-4" /></button></section>
          </div>}

          {tab === 'applications' && <section><div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h2 className="text-lg font-semibold">Sample application catalogue</h2><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search sample applications…" className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-indigo-500 sm:max-w-xs" /></div><div className="grid gap-3 md:grid-cols-2">{filteredApps.map(app => <article key={app.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{app.name}</h3><p className="mt-1 text-xs text-slate-400">{app.publisher} · {app.category} · {app.marketplace}</p></div><div className="flex items-center gap-1 text-sm text-amber-300"><Star className="h-3.5 w-3.5 fill-current" />{app.rating.toFixed(1)}</div></div><p className="mt-3 text-sm leading-5 text-slate-400">{app.description}</p><div className="mt-3 text-xs text-slate-500">Sample metadata · {number(app.reviewCount)} catalogue review count</div></article>)}</div></section>}

          {tab === 'reviews' && <section><h2 className="mb-4 text-lg font-semibold">Sample negative reviews</h2><div className="space-y-3">{data.reviews.map(review => <article key={review.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm">{review.appName}</b><span className="text-xs text-amber-300">{review.starRating}/5 stars · sample record</span></div><p className="mt-3 text-sm leading-6 text-slate-300">“{review.text}”</p><div className="mt-2 text-xs text-slate-500">{review.classification?.category || 'Unclassified'} · {review.reviewDate.slice(0, 10)}</div></article>)}</div></section>}

          {tab === 'insights' && <section><h2 className="mb-4 text-lg font-semibold">Sample complaint themes</h2><div className="grid gap-3 md:grid-cols-2">{data.themes.map(theme => <article key={theme.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-indigo-300">{theme.category}</span><span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-300">{theme.severity}</span></div><h3 className="mt-3 font-semibold">{theme.title}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{theme.summary}</p><div className="mt-3 text-xs text-slate-500">{theme.reviewCount} sample reviews · {Math.round(theme.confidenceScore * 100)}% illustrative confidence score</div></article>)}</div></section>}

          {tab === 'opportunities' && <section><h2 className="mb-4 text-lg font-semibold">Sample product opportunities</h2><div className="space-y-3">{data.opportunities.map(opp => <article key={opp.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-indigo-300">Priority score: {opp.priorityScore}/100 · illustrative</span><span className="text-xs text-slate-500">{opp.severity} severity</span></div><h3 className="mt-2 font-semibold">{opp.title}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{opp.problemStatement}</p><div className="mt-3 rounded-lg bg-slate-950 p-3 text-sm text-slate-300"><b className="text-white">Concept:</b> {opp.proposedConcept}</div></article>)}</div></section>}

          <footer className="mt-10 flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">Move from sample to your own research</h2><p className="mt-1 text-sm text-slate-400">Create a private workspace to use the authenticated application.</p></div><button onClick={onCreateAccount} className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold hover:bg-indigo-500">Get started <ArrowRight className="ml-1 inline h-4 w-4" /></button></footer>
        </>}
      </div>
    </main>
  );
};
