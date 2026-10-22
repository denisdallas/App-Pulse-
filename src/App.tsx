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

export default function App() {
  const [currentTab, setCurrentTab] = useState<ViewTab>('dashboard');
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
        fetch('/api/stats').then((r) => r.json()),
        fetch('/api/apps').then((r) => r.json()),
        fetch('/api/reviews?limit=200').then((r) => r.json()),
        fetch('/api/themes').then((r) => r.json()),
        fetch('/api/forecasts').then((r) => r.json()),
        fetch('/api/opportunities').then((r) => r.json()),
        fetch('/api/contacts').then((r) => r.json()),
        fetch('/api/campaigns').then((r) => r.json()),
        fetch('/api/suppression').then((r) => r.json()),
        fetch('/api/projects').then((r) => r.json()),
        fetch('/api/jobs').then((r) => r.json()),
        fetch('/api/audit-logs').then((r) => r.json()),
        fetch('/api/settings').then((r) => r.json()),
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

  useEffect(() => {
    loadAllData();
  }, []);

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
      const res = await fetch('/api/apps/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId, negativeOnly: true }),
      });
      const data = await res.json();
      showToast('Collection job queued! Processing negative reviews...');
      setTimeout(loadAllData, 2000);
    } catch (err: any) {
      showToast(`Collection error: ${err.message}`);
    }
  };

  const handleSearchOnline = async (query: string, marketplace: Marketplace) => {
    setIsSearchingOnline(true);
    try {
      const res = await fetch('/api/apps/search-online', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, marketplace }),
      });
      const data = await res.json();
      showToast(`Discovered ${data.count} live apps on ${marketplace}!`);
      loadAllData();
    } catch (err: any) {
      showToast(`Search error: ${err.message}`);
    } finally {
      setIsSearchingOnline(false);
    }
  };

  const handleRunAIAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      showToast(`AI analysis complete: ${data.count} recurring themes clustered.`);
      loadAllData();
      setCurrentTab('analytics');
    } catch (err: any) {
      showToast(`AI Analysis error: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleRunForecasts = async () => {
    setIsForecasting(true);
    try {
      const res = await fetch('/api/forecasts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      showToast(`Predicted ${data.count} forward-looking competitor weaknesses with Future Opportunity Scores.`);
      loadAllData();
      setCurrentTab('analytics');
    } catch (err: any) {
      showToast(`Forecast error: ${err.message}`);
    } finally {
      setIsForecasting(false);
    }
  };

  const handlePromoteForecast = async (forecastId: string) => {
    try {
      const res = await fetch(`/api/forecasts/${forecastId}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Forecast promoted to Opportunity: "${data.opportunity.title}"`);
        loadAllData();
      }
    } catch (err: any) {
      showToast(`Error promoting forecast: ${err.message}`);
    }
  };

  const handleGenerateOpportunities = async () => {
    setIsGeneratingOpps(true);
    try {
      const res = await fetch('/api/opportunities/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      showToast(`Generated ${data.count} scored opportunities.`);
      loadAllData();
      setCurrentTab('opportunities');
    } catch (err: any) {
      showToast(`Opportunity generation error: ${err.message}`);
    } finally {
      setIsGeneratingOpps(false);
    }
  };

  const handleUpdateReview = async (reviewId: string, updates: Partial<Review>) => {
    try {
      await fetch(`/api/reviews/${reviewId}/tag`, {
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
      const res = await fetch('/api/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opp),
      });
      const saved = await res.json();
      loadAllData();
      showToast(`Opportunity "${saved.title}" saved.`);
    } catch (err: any) {
      showToast(`Error saving opportunity: ${err.message}`);
    }
  };

  const handleDeleteOpportunity = async (id: string) => {
    try {
      await fetch(`/api/opportunities/${id}`, { method: 'DELETE' });
      setOpportunities((prev) => prev.filter((o) => o.id !== id));
      showToast('Opportunity removed.');
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  const handleSaveContact = async (contact: Contact) => {
    try {
      await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contact),
      });
      loadAllData();
      showToast(`Contact "${contact.name}" saved.`);
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  const handleDeleteContact = async (id: string) => {
    try {
      await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
      setContacts((prev) => prev.filter((c) => c.id !== id));
      showToast('Contact deleted.');
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  const handleImportCsv = async (csvContent: string) => {
    try {
      const res = await fetch('/api/contacts/import-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvContent }),
      });
      const data = await res.json();
      showToast(`Imported ${data.imported} contacts from CSV.`);
      loadAllData();
    } catch (err: any) {
      showToast(`Import error: ${err.message}`);
    }
  };

  const handleAddSuppression = async (emailOrDomain: string, reason: SuppressionRecord['reason'] = 'manual_suppression') => {
    try {
      await fetch('/api/suppression', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailOrDomain, reason }),
      });
      loadAllData();
      showToast(`Added ${emailOrDomain} to suppression list.`);
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  const handleRemoveSuppression = async (id: string) => {
    try {
      await fetch(`/api/suppression/${id}`, { method: 'DELETE' });
      setSuppression((prev) => prev.filter((s) => s.id !== id));
      showToast('Suppression rule removed.');
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  const handleCreateCampaign = async (campaign: Campaign) => {
    try {
      await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(campaign),
      });
      loadAllData();
      showToast(`Campaign "${campaign.name}" created.`);
    } catch (err: any) {
      showToast(`Error creating campaign: ${err.message}`);
    }
  };

  const handleSendCampaign = async (campaignId: string) => {
    const res = await fetch(`/api/campaigns/${campaignId}/send`, { method: 'POST' });
    const data = await res.json();
    loadAllData();
    return data;
  };

  const handleGenerateDraft = async (params: {
    contactId: string;
    opportunityId?: string;
    appId?: string;
    objective: string;
    tone: string;
  }) => {
    const res = await fetch('/api/outreach/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return res.json();
  };

  const handleSaveProject = async (proj: ResearchProject) => {
    try {
      await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proj),
      });
      loadAllData();
      showToast(`Research project "${proj.name}" updated.`);
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  const handleExport = (type: 'reviews' | 'opportunities' | 'contacts', format: 'csv' | 'json' = 'csv') => {
    window.location.href = `/api/export?type=${type}&format=${format}`;
    showToast(`Downloading ${type} as ${format.toUpperCase()}...`);
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
