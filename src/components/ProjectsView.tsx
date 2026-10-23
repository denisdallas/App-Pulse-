import React, { useState, useEffect } from 'react';
import { ResearchProject, Application, Review, ComplaintTheme, Opportunity, ReportRecord } from '../types.ts';
import { FolderGit2, Plus, Calendar, Tag, FileText, CheckCircle2, Download, FileSpreadsheet, Loader2, RefreshCw } from 'lucide-react';

interface ProjectsViewProps {
  projects: ResearchProject[];
  apps: Application[];
  reviews: Review[];
  themes: ComplaintTheme[];
  opportunities: Opportunity[];
  onSaveProject: (proj: ResearchProject) => void;
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({
  projects,
  apps,
  reviews,
  themes,
  opportunities,
  onSaveProject,
}) => {
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id || '');
  const [isCreatingModal, setIsCreatingModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [editingNotes, setEditingNotes] = useState('');

  // Report Generation State
  const [reportFormat, setReportFormat] = useState<'pdf' | 'xlsx' | 'csv'>('pdf');
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportSuccessMessage, setReportSuccessMessage] = useState<string | null>(null);
  const [reportsList, setReportsList] = useState<ReportRecord[]>([]);

  const activeProject = projects.find((p) => p.id === selectedProjectId) || projects[0];

  const fetchReports = async () => {
    try {
      const res = await fetch('/api/reports');
      if (res.ok) {
        const data = await res.json();
        setReportsList(data);
      }
    } catch (err) {
      console.error('Failed to fetch reports list:', err);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    const newProj: ResearchProject = {
      id: `proj_${Date.now()}`,
      name: newName,
      description: newDesc,
      savedAppIds: apps.slice(0, 3).map((a) => a.id),
      savedReviewIds: reviews.slice(0, 5).map((r) => r.id),
      savedThemeIds: themes.slice(0, 2).map((t) => t.id),
      savedOpportunityIds: opportunities.slice(0, 2).map((o) => o.id),
      notes: 'Initial hypothesis: Competitor churn driven by recurring sync instability and aggressive pricing paywalls.',
      tags: ['Research', 'Market Intelligence'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSaveProject(newProj);
    setSelectedProjectId(newProj.id);
    setIsCreatingModal(false);
    setNewName('');
    setNewDesc('');
  };

  const handleSaveNotes = () => {
    if (!activeProject) return;
    onSaveProject({
      ...activeProject,
      notes: editingNotes,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleGenerateReport = async () => {
    setIsGeneratingReport(true);
    setReportSuccessMessage(null);

    try {
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProject?.id,
          title: `${activeProject?.name || 'Competitor Intelligence'} Research Dossier`,
          fileType: reportFormat,
        }),
      });

      if (!res.ok) throw new Error('Failed to generate report');
      const data = await res.json();
      setReportSuccessMessage(`Successfully generated ${reportFormat.toUpperCase()} report!`);
      await fetchReports();

      // Trigger direct download
      if (data.report?.downloadUrl) {
        const a = document.createElement('a');
        a.href = data.report.downloadUrl;
        a.download = '';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err: any) {
      alert(`Report generation failed: ${err.message}`);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-indigo-400 bg-indigo-950/60 border border-indigo-800/40 px-2 py-0.5 rounded flex items-center gap-1">
              <FolderGit2 className="w-3 h-3 text-indigo-400" />
              Research Dossiers & Reports
            </span>
            <span className="text-xs text-slate-400 font-mono">
              {projects.length} Structured Projects
            </span>
          </div>
          <h2 className="text-base font-semibold text-white">
            Curated Competitor Intelligence Projects
          </h2>
          <p className="text-xs text-slate-400 max-w-2xl">
            Aggregate monitored competitors, bookmarked negative reviews, synthesized complaint clusters, and generate downloadable research reports.
          </p>
        </div>

        <button
          onClick={() => setIsCreatingModal(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors shrink-0 shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Research Project</span>
        </button>
      </div>

      {/* Main Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Col: Projects List (4 cols) */}
        <div className="lg:col-span-4 space-y-3">
          <span className="text-xs text-slate-400 block px-1 font-medium">Research Projects</span>
          <div className="space-y-2">
            {projects.map((proj) => {
              const isSelected = activeProject?.id === proj.id;
              return (
                <div
                  key={proj.id}
                  onClick={() => {
                    setSelectedProjectId(proj.id);
                    setEditingNotes(proj.notes);
                  }}
                  className={`p-4 rounded-xl bg-slate-900 border cursor-pointer transition-all space-y-2 ${
                    isSelected
                      ? 'border-indigo-500 shadow-md shadow-indigo-500/10'
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <h4 className="text-xs font-semibold text-white">{proj.name}</h4>
                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                    {proj.description}
                  </p>
                  <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-800/60 text-slate-400 font-mono">
                    <span>{proj.savedAppIds.length} apps · {proj.savedReviewIds.length} reviews</span>
                    <span>{proj.updatedAt.slice(0, 10)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Col: Project Details & Dossier (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {activeProject ? (
            <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>Project Created: {activeProject.createdAt.slice(0, 10)}</span>
                    <span aria-hidden="true">·</span>
                    <span>Last Modified: {activeProject.updatedAt.slice(0, 10)}</span>
                  </div>
                  <h3 className="text-base font-bold text-white">{activeProject.name}</h3>
                  <p className="text-xs text-slate-300">{activeProject.description}</p>
                </div>

                {/* Generate Report Controls */}
                <div className="flex items-center gap-2 bg-slate-800/80 p-2 rounded-lg border border-slate-700">
                  <select
                    value={reportFormat}
                    onChange={(e: any) => setReportFormat(e.target.value)}
                    className="bg-slate-900 text-xs text-white px-2 py-1.5 rounded border border-slate-700 focus:outline-none"
                  >
                    <option value="pdf">PDF Dossier</option>
                    <option value="xlsx">Excel (XLSX)</option>
                    <option value="csv">CSV Export</option>
                  </select>

                  <button
                    onClick={handleGenerateReport}
                    disabled={isGeneratingReport}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded transition-colors"
                  >
                    {isGeneratingReport ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Generating...</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5" />
                        <span>Generate & Download</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {reportSuccessMessage && (
                <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-800/40 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>{reportSuccessMessage}</span>
                </div>
              )}

              {/* Dossier Contents (Apps & Opportunities) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* Apps In Project */}
                <div className="p-4 rounded-lg bg-slate-800/40 border border-slate-800 space-y-2">
                  <span className="font-semibold text-slate-200 block">
                    Monitored Competitors ({activeProject.savedAppIds.length}):
                  </span>
                  <div className="space-y-1.5">
                    {activeProject.savedAppIds.map((appId) => {
                      const app = apps.find((a) => a.id === appId);
                      return (
                        <div key={appId} className="p-2 rounded bg-slate-800 border border-slate-700/60 text-slate-200 flex justify-between items-center">
                          <span className="font-medium">{app?.name || appId}</span>
                          <span className="text-[10px] text-slate-400">({app?.marketplace?.toUpperCase()})</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Linked Opportunities */}
                <div className="p-4 rounded-lg bg-slate-800/40 border border-slate-800 space-y-2">
                  <span className="font-semibold text-slate-200 block">
                    Validated Opportunities ({activeProject.savedOpportunityIds.length}):
                  </span>
                  <div className="space-y-1.5">
                    {activeProject.savedOpportunityIds.map((oppId) => {
                      const opp = opportunities.find((o) => o.id === oppId);
                      return (
                        <div key={oppId} className="p-2 rounded bg-slate-800 border border-slate-700/60 text-slate-200 flex justify-between items-center">
                          <span className="font-medium">{opp?.title || oppId}</span>
                          {opp && <span className="text-indigo-400 font-mono text-[11px] font-bold">{Math.round(opp.priorityScore)}/100</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Research Notes & Hypothesis Editor */}
              <div className="space-y-2 pt-2 border-t border-slate-800 text-xs">
                <span className="font-semibold text-slate-200 block">
                  Analyst Research Notes & Validation Findings:
                </span>
                <textarea
                  rows={4}
                  value={editingNotes || activeProject.notes}
                  onChange={(e) => setEditingNotes(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-slate-200 focus:outline-none focus:border-indigo-500 leading-relaxed"
                />
                <div className="flex justify-end">
                  <button
                    onClick={handleSaveNotes}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors"
                  >
                    Save Notes
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center rounded-xl bg-slate-900 border border-slate-800 text-slate-400">
              Select or create a research project.
            </div>
          )}

          {/* Generated Reports History Table */}
          <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-400" />
                <span>Generated Research Dossiers & Downloads</span>
              </h3>
              <button 
                onClick={fetchReports}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Refresh</span>
              </button>
            </div>

            {reportsList.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">
                No reports generated yet. Click "Generate & Download" above to build your first research dossier.
              </p>
            ) : (
              <div className="divide-y divide-slate-800">
                {reportsList.map((rep) => (
                  <div key={rep.id} className="py-3 flex items-center justify-between text-xs">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">{rep.title}</span>
                        <span className="px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/40 text-[10px] uppercase font-mono font-bold">
                          {rep.fileType}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Generated on {rep.generatedAt.slice(0, 16).replace('T', ' ')} · {(rep.fileSize / 1024).toFixed(1)} KB
                      </div>
                    </div>

                    <a
                      href={rep.downloadUrl}
                      download
                      className="flex items-center gap-1 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors font-medium text-xs"
                    >
                      <Download className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Download</span>
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Modal */}
      {isCreatingModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-base font-semibold text-white">Create Research Project</h3>

            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Project Name</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Accounting OCR Latency Analysis"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Brief context and objectives of this research study..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreatingModal(false)}
                  className="px-3 py-1.5 text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg"
                >
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
