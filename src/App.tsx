import React, { useState, useEffect } from 'react';
import { 
  Application, 
  Review, 
  ComplaintTheme, 
  Opportunity, 
  Contact, 
  Campaign, 
  SuppressionRecord, 
  ResearchProject, 
  CollectionJob, 
  AuditLog, 
  SystemStats,
  Marketplace,
  PredictedWeakness
} from './types.ts';
import { Sidebar, ViewTab } from './components/Sidebar.tsx';
import { Header } from './components/Header.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { DiscoveryView } from './components/DiscoveryView.tsx';
import { ReviewExplorerView } from './components/ReviewExplorerView.tsx';
import { ComplaintAnalyticsView } from './components/ComplaintAnalyticsView.tsx';
import { CompetitorCompareView } from './components/CompetitorCompareView.tsx';
import { OpportunityFinderView } from './components/OpportunityFinderView.tsx';
import { OutreachStudioView } from './components/OutreachStudioView.tsx';
import { ProjectsView } from './components/ProjectsView.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import { AuthView } from './components/AuthView.tsx';

type JobSnapshot = {
  id: string;
  type: string;
  status: CollectionJob['status'];
  progress: number;
  attempts: number;
  maxAttempts: number;
  input: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: init?.credentials ?? 'same-origin' });
  const responseText = await response.text();
  let body: unknown = null;
  try {
    body = responseText ? JSON.parse(responseText) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
      ? body.error
      : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return body as T;
}

function toCollectionJob(job: JobSnapshot): CollectionJob {
  const result = job.result || {};
  const input = job.input || {};
  const appName = typeof input.appName === 'string' ? input.appName : typeof result.appName === 'string' ? result.appName : `${job.type[0]?.toUpperCase() || ''}${job.type.slice(1)} job`;
  const outcome = typeof result.outcome === 'string' && ['collected', 'empty', 'unsupported', 'failed'].includes(result.outcome)
    ? result.outcome as CollectionJob['outcome']
    : undefined;
  return {
    id: job.id,
    appId: typeof input.appId === 'string' ? input.appId : '',
    appName,
    marketplace: (typeof input.marketplace === 'string' ? input.marketplace : typeof result.marketplace === 'string' ? result.marketplace : 'steam') as Marketplace,
    status: job.status,
    jobType: job.type as CollectionJob['jobType'],
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    outcome,
    progress: job.progress,
    collectedCount: typeof result.collectedCount === 'number' ? result.collectedCount : 0,
    deduplicatedCount: typeof result.deduplicatedCount === 'number' ? result.deduplicatedCount : 0,
    error: job.error || undefined,
    startedAt: job.startedAt || '',
    completedAt: job.completedAt || undefined,
  };
}

export default function App() {
  const [currentTab, setCurrentTab] = useState<ViewTab>('dashboard');
  const [authState, setAuthState] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');
  const [authError, setAuthError] = useState<string | null>(null);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [apps, setApps] = useState<Application[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [themes, setThemes] = useState<ComplaintTheme[]>([]);
  const [forecasts, setForecasts] = useState<PredictedWeakness[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [suppression, setSuppression] = useState<SuppressionRecord[]>([]);
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [jobs, setJobs] = useState<CollectionJob[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [settingsData, setSettingsData] = useState<any>(null);

  // Cross-view state
  const [selectedCompareIds, setSelectedCompareIds] = useState<string[]>(['gp_notion', 'gp_clickup']);
  const [selectedReviewAppId, setSelectedReviewAppId] = useState<string>('all');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [isForecasting, setIsForecasting] = useState<boolean>(false);
  const [isGeneratingOpps, setIsGeneratingOpps] = useState<boolean>(false);
  const [isSearchingOnline, setIsSearchingOnline] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadAllData = async () => {
    try {
      const [
        statsRes,
        appsRes,
        reviewsRes,
        themesRes,
        forecastsRes,
        oppsRes,
        contactsRes,
        campsRes,
        suppRes,
        projRes,
        jobsRes,
        logsRes,
        settingsRes,
      ] = await Promise.all([
        requestJson<SystemStats>('/api/stats'),
        requestJson<Application[]>('/api/apps'),
        requestJson<{ reviews: Review[] }>('/api/reviews?limit=200'),
        requestJson<ComplaintTheme[]>('/api/themes'),
        requestJson<PredictedWeakness[]>('/api/forecasts'),
        requestJson<Opportunity[]>('/api/opportunities'),
        requestJson<Contact[]>('/api/contacts'),
        requestJson<Campaign[]>('/api/campaigns'),
        requestJson<SuppressionRecord[]>('/api/suppression'),
        requestJson<ResearchProject[]>('/api/projects'),
        requestJson<CollectionJob[]>('/api/jobs'),
        requestJson<AuditLog[]>('/api/audit-logs'),
        requestJson<Record<string, unknown>>('/api/settings'),
      ]);

      setStats(statsRes);
      setApps(appsRes || []);
      setReviews(reviewsRes?.reviews || []);
      setThemes(themesRes || []);
      setForecasts(forecastsRes || []);
      setOpportunities(oppsRes || []);
      setContacts(contactsRes || []);
      setCampaigns(campsRes || []);
      setSuppression(suppRes || []);
      setProjects(projRes || []);
      setJobs(jobsRes || []);
      setAuditLogs(logsRes || []);
      setSettingsData(settingsRes || {});
    } catch (err) {
      console.error('[App] Failed to load data:', err);
    }
  };

  const upsertJob = (snapshot: JobSnapshot) => {
    const mapped = toCollectionJob(snapshot);
    setJobs((current) => [mapped, ...current.filter((job) => job.id !== mapped.id)].slice(0, 100));
  };

  const watchJob = async (jobId: string, label: string) => {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      try {
        const job = await requestJson<JobSnapshot>(`/api/jobs/${encodeURIComponent(jobId)}`);
        upsertJob(job);
        if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
          await loadAllData();
          if (job.status !== 'completed') {
            showToast(`${label} ${job.status}: ${job.error || 'No additional details available.'}`);
          } else if (job.result?.outcome === 'empty') {
            showToast(`${label} completed; the source returned no reviews.`);
          } else if (typeof job.result?.count === 'number') {
            showToast(`${label} completed with ${job.result.count} result${job.result.count === 1 ? '' : 's'}.`);
          } else if (typeof job.result?.collectedCount === 'number') {
            showToast(`Collection completed: ${job.result.collectedCount} new reviews, ${Number(job.result.deduplicatedCount || 0)} duplicates.`);
          } else {
            showToast(`${label} completed.`);
          }
          return;
        }
      } catch (error) {
        showToast(`${label} status could not be refreshed: ${error instanceof Error ? error.message : 'Request failed'}`);
        return;
      }
    }
    showToast(`${label} is still queued or running. Check recent job activity for its current status.`);
  };

  useEffect(() => {
    let active = true;
    fetch('/api/auth/session', { credentials: 'include' })
      .then(async (response) => {
        if (!active) return;
        if (response.ok) {
          setAuthState('authenticated');
          return;
        }
        if (response.status === 401) {
          setAuthState('unauthenticated');
          return;
        }
        const body = await response.json().catch(() => ({}));
        setAuthError(body.error === 'Authentication requires DATABASE_URL configuration'
          ? 'Database connection is not configured. Workspace sign-in and registration are unavailable.'
          : body.error || 'Authentication service unavailable');
        setAuthState('unauthenticated');
      })
      .catch(() => {
        if (active) {
          setAuthError('Unable to reach the authentication service');
          setAuthState('unauthenticated');
        }
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (authState === 'authenticated') loadAllData();
  }, [authState]);

  if (authState === 'loading') return <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">Loading your workspace…</main>;
  if (authState === 'unauthenticated') return <AuthView serviceError={authError} onAuthenticated={() => { setAuthError(null); setAuthState('authenticated'); }} />;

  // Handlers
  const handleToggleCompare = (appId: string) => {
    if (selectedCompareIds.includes(appId)) {
      setSelectedCompareIds(selectedCompareIds.filter((id) => id !== appId));
    } else {
      if (selectedCompareIds.length >= 4) {
        showToast('Maximum 4 competitors can be compared at once.');
        return;
      }
      setSelectedCompareIds([...selectedCompareIds, appId]);
    }
  };

  const handleTriggerCollect = async (appId: string) => {
    try {
      const data = await requestJson<{ job: JobSnapshot }>('/api/apps/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ appId, negativeOnly: false }),
      });
      upsertJob(data.job);
      showToast('Review collection queued; the dashboard will track its actual result.');
      await watchJob(data.job.id, 'Review collection');
    } catch (error) {
      showToast(`Collection error: ${error instanceof Error ? error.message : 'Request failed'}`);
    }
  };

  const handleSearchOnline = async (query: string, marketplace: Marketplace) => {
    setIsSearchingOnline(true);
    try {
      const data = await requestJson<{ count: number }>('/api/apps/search-online', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, marketplace }),
      });
      showToast(`Saved ${data.count} applications returned by ${marketplace}.`);
      await loadAllData();
    } catch (error) {
      showToast(`Search error: ${error instanceof Error ? error.message : 'Request failed'}`);
    } finally {
      setIsSearchingOnline(false);
    }
  };

  const handleRunAIAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const data = await requestJson<{ job: JobSnapshot }>('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({}),
      });
      upsertJob(data.job);
      setCurrentTab('analytics');
      showToast('Evidence analysis queued; waiting for the worker result.');
      await watchJob(data.job.id, 'Evidence analysis');
    } catch (error) {
      showToast(`Analysis error: ${error instanceof Error ? error.message : 'Request failed'}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleRunForecasts = async () => {
    setIsForecasting(true);
    try {
      const data = await requestJson<{ job: JobSnapshot }>('/api/forecasts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
      });
      upsertJob(data.job);
      setCurrentTab('analytics');
      showToast('Evidence-based forecast queued; waiting for the worker result.');
      await watchJob(data.job.id, 'Forecast generation');
    } catch (error) {
      showToast(`Forecast error: ${error instanceof Error ? error.message : 'Request failed'}`);
    } finally {
      setIsForecasting(false);
    }
  };

  const handlePromoteForecast = async (forecastId: string) => {
    try {
      const data = await requestJson<{ success: boolean; opportunity: Opportunity }>(`/api/forecasts/${encodeURIComponent(forecastId)}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (data.success) {
        showToast(`Forecast promoted to Opportunity: "${data.opportunity.title}"`);
        await loadAllData();
      }
    } catch (err: any) {
      showToast(`Error promoting forecast: ${err.message}`);
    }
  };

  const handleGenerateOpportunities = async () => {
    setIsGeneratingOpps(true);
    try {
      const data = await requestJson<{ job: JobSnapshot }>('/api/opportunities/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({}),
      });
      upsertJob(data.job);
      setCurrentTab('opportunities');
      showToast('Evidence-backed opportunity generation queued.');
      await watchJob(data.job.id, 'Opportunity generation');
    } catch (error) {
      showToast(`Opportunity generation error: ${error instanceof Error ? error.message : 'Request failed'}`);
    } finally {
      setIsGeneratingOpps(false);
    }
  };

  const handleUpdateReview = async (reviewId: string, updates: Partial<Review>) => {
    try {
      await requestJson<Review>(`/api/reviews/${encodeURIComponent(reviewId)}/tag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      setReviews((prev) =>
        prev.map((r) => (r.id === reviewId ? { ...r, ...updates } : r))
      );
      showToast('Review metadata updated.');
    } catch (err: any) {
      showToast(`Error updating review: ${err.message}`);
    }
  };

  const handleSaveOpportunity = async (opp: Opportunity) => {
    try {
      const saved = await requestJson<Opportunity>('/api/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opp),
      });
      await loadAllData();
      showToast(`Opportunity "${saved.title}" saved.`);
    } catch (err: any) {
      showToast(`Error saving opportunity: ${err.message}`);
    }
  };

  const handleDeleteOpportunity = async (id: string) => {
    try {
      await requestJson<{ success: boolean }>(`/api/opportunities/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setOpportunities((prev) => prev.filter((o) => o.id !== id));
      showToast('Opportunity removed.');
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  const handleSaveContact = async (contact: Contact) => {
    try {
      await requestJson<Contact>('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contact),
      });
      await loadAllData();
      showToast(`Contact "${contact.name}" saved.`);
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  const handleDeleteContact = async (id: string) => {
    try {
      await requestJson<{ success: boolean }>(`/api/contacts/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setContacts((prev) => prev.filter((c) => c.id !== id));
      showToast('Contact deleted.');
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  const handleImportCsv = async (csvContent: string) => {
    try {
      const data = await requestJson<{ imported: number }>('/api/contacts/import-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvContent }),
      });
      showToast(`Imported ${data.imported} contacts from CSV.`);
      await loadAllData();
    } catch (err: any) {
      showToast(`Import error: ${err.message}`);
    }
  };

  const handleAddSuppression = async (emailOrDomain: string, reason: SuppressionRecord['reason'] = 'manual_suppression') => {
    try {
      await requestJson<SuppressionRecord>('/api/suppression', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailOrDomain, reason }),
      });
      await loadAllData();
      showToast(`Added ${emailOrDomain} to suppression list.`);
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  const handleRemoveSuppression = async (id: string) => {
    try {
      await requestJson<{ success: boolean }>(`/api/suppression/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setSuppression((prev) => prev.filter((s) => s.id !== id));
      showToast('Suppression rule removed.');
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  const handleCreateCampaign = async (campaign: Campaign) => {
    try {
      await requestJson<Campaign>('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(campaign),
      });
      await loadAllData();
      showToast(`Campaign "${campaign.name}" created.`);
    } catch (err: any) {
      showToast(`Error creating campaign: ${err.message}`);
    }
  };

  const handleSendCampaign = async (campaignId: string) => {
    const data = await requestJson<{ success: boolean; status: string; sent: number; blocked: number; reasons: string[] }>(`/api/campaigns/${encodeURIComponent(campaignId)}/send`, { method: 'POST' });
    await loadAllData();
    if (!data.success) showToast(data.reasons[0] || 'No messages were sent; no delivery adapter is implemented.');
    return data;
  };

  const handleGenerateDraft = async (params: {
    contactId: string;
    opportunityId?: string;
    appId?: string;
    objective: string;
    tone: string;
  }) => {
    return requestJson<{ subject: string; body: string }>('/api/outreach/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
  };

  const handleSaveProject = async (proj: ResearchProject) => {
    try {
      await requestJson<ResearchProject>('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proj),
      });
      await loadAllData();
      showToast(`Research project "${proj.name}" updated.`);
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  const handleExport = async (type: 'reviews' | 'opportunities' | 'contacts', format: 'csv' | 'json' = 'csv') => {
    try {
      const response = await fetch(`/api/export?type=${encodeURIComponent(type)}&format=${encodeURIComponent(format)}`, { credentials: 'same-origin' });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(typeof body.error === 'string' ? body.error : `Export failed (${response.status})`);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `apppulse_${type}.${format}`;
      link.click();
      URL.revokeObjectURL(objectUrl);
      showToast(`${type} export downloaded.`);
    } catch (error) {
      showToast(`Export error: ${error instanceof Error ? error.message : 'Request failed'}`);
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 font-sans text-slate-100 antialiased">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-xs font-medium shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-2">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        stats={{
          totalApps: stats?.totalApps || 0,
          negativeReviews: stats?.negativeReviews || 0,
          totalOpportunities: stats?.totalOpportunities || 0,
        }}
        isOpenOnMobile={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      {/* Main View Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <Header
          currentTab={currentTab}
          onRefresh={loadAllData}
          onRunAI={currentTab === 'analytics' || currentTab === 'dashboard' ? handleRunAIAnalysis : undefined}
          isAnalyzing={isAnalyzing}
          onToggleMobileMenu={() => setMobileMenuOpen(!mobileMenuOpen)}
        />

        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          {currentTab === 'dashboard' && (
            <DashboardView
              stats={stats}
              themes={themes}
              opportunities={opportunities}
              jobs={jobs}
              campaigns={campaigns}
              onNavigate={setCurrentTab}
              onSelectOpportunity={() => setCurrentTab('opportunities')}
            />
          )}

          {currentTab === 'discovery' && (
            <DiscoveryView
              apps={apps}
              selectedCompareIds={selectedCompareIds}
              onToggleCompare={handleToggleCompare}
              onTriggerCollect={handleTriggerCollect}
              onViewReviews={(appId) => {
                setSelectedReviewAppId(appId);
                setCurrentTab('reviews');
              }}
              onSearchOnline={handleSearchOnline}
              isSearchingOnline={isSearchingOnline}
            />
          )}

          {currentTab === 'reviews' && (
            <ReviewExplorerView
              reviews={reviews}
              apps={apps}
              selectedAppId={selectedReviewAppId}
              onSelectApp={setSelectedReviewAppId}
              onUpdateReview={handleUpdateReview}
            />
          )}

          {currentTab === 'analytics' && (
            <ComplaintAnalyticsView
              themes={themes}
              apps={apps}
              reviews={reviews}
              forecasts={forecasts}
              onTriggerAI={handleRunAIAnalysis}
              isAnalyzing={isAnalyzing}
              onTriggerForecast={handleRunForecasts}
              isForecasting={isForecasting}
              onPromoteForecast={handlePromoteForecast}
              onGenerateOpportunities={handleGenerateOpportunities}
              isGeneratingOpps={isGeneratingOpps}
            />
          )}

          {currentTab === 'compare' && (
            <CompetitorCompareView
              allApps={apps}
              selectedCompareIds={selectedCompareIds}
              onToggleCompare={handleToggleCompare}
              reviews={reviews}
            />
          )}

          {currentTab === 'opportunities' && (
            <OpportunityFinderView
              opportunities={opportunities}
              apps={apps}
              themes={themes}
              onSaveOpportunity={handleSaveOpportunity}
              onDeleteOpportunity={handleDeleteOpportunity}
              onStartCampaignForOpp={(opp) => {
                setCurrentTab('outreach');
              }}
              onTriggerGenerate={handleGenerateOpportunities}
              isGenerating={isGeneratingOpps}
            />
          )}

          {currentTab === 'outreach' && (
            <OutreachStudioView
              contacts={contacts}
              campaigns={campaigns}
              suppression={suppression}
              opportunities={opportunities}
              apps={apps}
              onSaveContact={handleSaveContact}
              onDeleteContact={handleDeleteContact}
              onImportCsv={handleImportCsv}
              onAddSuppression={handleAddSuppression}
              onRemoveSuppression={handleRemoveSuppression}
              onCreateCampaign={handleCreateCampaign}
              onSendCampaign={handleSendCampaign}
              onGenerateDraft={handleGenerateDraft}
            />
          )}

          {currentTab === 'projects' && (
            <ProjectsView
              projects={projects}
              apps={apps}
              reviews={reviews}
              themes={themes}
              opportunities={opportunities}
              onSaveProject={handleSaveProject}
            />
          )}

          {currentTab === 'settings' && (
            <SettingsView
              settingsData={settingsData}
              auditLogs={auditLogs}
              onExport={handleExport}
            />
          )}
        </main>
      </div>
    </div>
  );
}
