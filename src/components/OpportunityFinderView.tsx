import React, { useState } from 'react';
import { Opportunity, ComplaintTheme, Application } from '../types.ts';
import { 
  Lightbulb, 
  Send, 
  Trash2, 
  ExternalLink, 
  CheckCircle, 
  HelpCircle, 
  Tag, 
  Plus, 
  ChevronRight,
  TrendingUp,
  Info
} from 'lucide-react';

interface OpportunityFinderViewProps {
  opportunities: Opportunity[];
  apps: Application[];
  themes: ComplaintTheme[];
  onSaveOpportunity: (opp: Opportunity) => void;
  onDeleteOpportunity: (id: string) => void;
  onStartCampaignForOpp: (opp: Opportunity) => void;
  onTriggerGenerate: () => void;
  isGenerating: boolean;
}

export const OpportunityFinderView: React.FC<OpportunityFinderViewProps> = ({
  opportunities,
  apps,
  themes,
  onSaveOpportunity,
  onDeleteOpportunity,
  onStartCampaignForOpp,
  onTriggerGenerate,
  isGenerating,
}) => {
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(opportunities[0] || null);
  const [isCreatingModal, setIsCreatingModal] = useState(false);
  const [showScoreModal, setShowScoreModal] = useState(false);

  // New Opportunity Form State
  const [newTitle, setNewTitle] = useState('');
  const [newProblem, setNewProblem] = useState('');
  const [newConcept, setNewConcept] = useState('');
  const [newTargetUser, setNewTargetUser] = useState('');
  const [newSeverity, setNewSeverity] = useState<'Critical' | 'High' | 'Medium' | 'Low'>('High');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const newOpp: Opportunity = {
      id: `opp_manual_${Date.now()}`,
      title: newTitle,
      problemStatement: newProblem,
      targetUser: newTargetUser || 'Early adopter software buyers',
      supportingAppIds: apps.slice(0, 2).map((a) => a.id),
      supportingAppNames: apps.slice(0, 2).map((a) => a.name),
      supportingReviewIds: [],
      complaintFrequency: 24,
      severity: newSeverity,
      existingSolutions: 'Incumbents with slow delivery cycles and persistent UI friction.',
      proposedConcept: newConcept,
      differentiationHypothesis: 'Focus purely on speed and offline reliability.',
      validationQuestions: [
        'How many hours a week does your team spend on this problem?',
        'What budget is allocated for software in this category?',
      ],
      nextSteps: [
        'Build waiting list landing page',
        'Outreach to 15 reviewers who complained on Google Play',
      ],
      priorityScore: 78,
      scoreBreakdown: {
        severityScore: 75,
        frequencyScore: 65,
        recencyScore: 85,
        breadthScore: 56,
      },
      tags: ['Manual Concept', 'High Potential'],
      status: 'validating',
      createdAt: new Date().toISOString(),
    };

    onSaveOpportunity(newOpp);
    setSelectedOpp(newOpp);
    setIsCreatingModal(false);
    setNewTitle('');
    setNewProblem('');
    setNewConcept('');
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-amber-400 bg-amber-950/60 border border-amber-800/40 px-2 py-0.5 rounded flex items-center gap-1">
              <Lightbulb className="w-3 h-3 text-amber-400" />
              Product Opportunity Engine
            </span>
            <button
              onClick={() => setShowScoreModal(!showScoreModal)}
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
            >
              <Info className="w-3 h-3" />
              <span>How Scoring Works</span>
            </button>
          </div>
          <h2 className="text-base font-semibold text-white">
            Unmet Market Demand & Product Opportunities
          </h2>
          <p className="text-xs text-slate-400 max-w-2xl">
            Recurring competitor flaws transformed into structured, scored venture hypotheses. Prioritized by complaint frequency, severity, recency, and competitor breadth.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={onTriggerGenerate}
            disabled={isGenerating}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors disabled:opacity-50"
          >
            <Lightbulb className={`w-3.5 h-3.5 ${isGenerating ? 'animate-bounce' : ''}`} />
            <span>{isGenerating ? 'Synthesizing...' : 'AI Generate from Themes'}</span>
          </button>

          <button
            onClick={() => setIsCreatingModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-slate-400" />
            <span>New Opportunity</span>
          </button>
        </div>
      </div>

      {/* Scoring Explanation Card (Collapsible) */}
      {showScoreModal && (
        <div className="p-4 rounded-xl bg-slate-850 border border-indigo-500/30 text-xs text-slate-300 space-y-2">
          <div className="font-semibold text-white flex items-center gap-2">
            <span>Opportunity Prioritization Scoring Formula (0 - 100):</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-[11px]">
            <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
              <span className="font-bold text-rose-400 block">30% · Severity Score</span>
              <span>Critical = 100, High = 75, Medium = 50, Low = 25 based on operational impact.</span>
            </div>
            <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
              <span className="font-bold text-indigo-400 block">30% · Frequency Score</span>
              <span>Logarithmic scaling of matching negative reviews (1-30+ volume curve).</span>
            </div>
            <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
              <span className="font-bold text-amber-400 block">20% · Recency Score</span>
              <span>Weighted higher for recent reviews (last 14-30 days indicate active churn).</span>
            </div>
            <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
              <span className="font-bold text-emerald-400 block">20% · Competitor Breadth</span>
              <span>Multi-app cross-validation proves systemic industry pain rather than single app bug.</span>
            </div>
          </div>
        </div>
      )}

      {/* Split Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Ranked List (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span>Ranked Opportunities ({opportunities.length})</span>
            <span className="font-mono">Priority Score</span>
          </div>

          <div className="space-y-2.5">
            {opportunities.map((opp) => {
              const isSelected = selectedOpp?.id === opp.id;
              return (
                <div
                  key={opp.id}
                  onClick={() => setSelectedOpp(opp)}
                  className={`p-4 rounded-xl bg-slate-900 border cursor-pointer transition-all space-y-2 ${
                    isSelected
                      ? 'border-indigo-500 shadow-md shadow-indigo-500/10'
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="text-xs font-semibold text-white leading-snug">
                      {opp.title}
                    </h4>
                    <span className="font-mono text-xs font-bold text-indigo-400 tabular-nums shrink-0 px-2 py-0.5 rounded bg-indigo-950/60 border border-indigo-800/40">
                      {opp.priorityScore}/100
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                    {opp.problemStatement}
                  </p>

                  <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-800/60 text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <span className="text-amber-400 font-medium">{opp.severity}</span>
                      <span aria-hidden="true">·</span>
                      <span>{opp.complaintFrequency} reviews</span>
                    </div>
                    <span className="capitalize text-slate-300 font-medium">
                      {opp.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Detailed Opportunity Inspector (7 cols) */}
        <div className="lg:col-span-7">
          {selectedOpp ? (
            <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-6 sticky top-20">
              {/* Header */}
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/40">
                      Score: {selectedOpp.priorityScore} / 100
                    </span>
                    <span className="text-xs text-slate-400 capitalize">
                      Status: {selectedOpp.status}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-white">
                    {selectedOpp.title}
                  </h3>
                  <div className="text-xs text-slate-400">
                    Target User Persona: <span className="text-slate-200">{selectedOpp.targetUser}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => onStartCampaignForOpp(selectedOpp)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Draft Outreach</span>
                  </button>

                  <button
                    onClick={() => onDeleteOpportunity(selectedOpp.id)}
                    className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg border border-slate-800 hover:bg-slate-800 transition-colors"
                    title="Delete Opportunity"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Priority Score Breakdown Strip */}
              <div className="grid grid-cols-4 gap-2 p-3 rounded-lg bg-slate-800/60 border border-slate-800 text-xs font-mono tabular-nums text-center">
                <div>
                  <span className="text-[10px] text-slate-400 font-sans block">Severity (30%)</span>
                  <span className="text-rose-400 font-bold">{selectedOpp.scoreBreakdown.severityScore}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-sans block">Frequency (30%)</span>
                  <span className="text-indigo-400 font-bold">{selectedOpp.scoreBreakdown.frequencyScore}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-sans block">Recency (20%)</span>
                  <span className="text-amber-400 font-bold">{selectedOpp.scoreBreakdown.recencyScore}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-sans block">Breadth (20%)</span>
                  <span className="text-emerald-400 font-bold">{selectedOpp.scoreBreakdown.breadthScore}</span>
                </div>
              </div>

              {/* Core Opportunity Sections */}
              <div className="space-y-4 text-xs">
                {/* Problem */}
                <div className="space-y-1">
                  <span className="font-semibold text-rose-400 block uppercase text-[10px] tracking-wider">
                    The Burning Problem:
                  </span>
                  <p className="text-slate-300 leading-relaxed bg-slate-800/40 p-3 rounded-lg border border-slate-800">
                    {selectedOpp.problemStatement}
                  </p>
                </div>

                {/* Proposed Concept */}
                <div className="space-y-1">
                  <span className="font-semibold text-emerald-400 block uppercase text-[10px] tracking-wider">
                    Proposed Product Concept:
                  </span>
                  <p className="text-slate-200 leading-relaxed bg-slate-800/40 p-3 rounded-lg border border-slate-800">
                    {selectedOpp.proposedConcept}
                  </p>
                </div>

                {/* Differentiation */}
                <div className="space-y-1">
                  <span className="font-semibold text-indigo-400 block uppercase text-[10px] tracking-wider">
                    Differentiation & Strategic Moat:
                  </span>
                  <p className="text-slate-300 leading-relaxed bg-slate-800/40 p-3 rounded-lg border border-slate-800">
                    {selectedOpp.differentiationHypothesis}
                  </p>
                </div>

                {/* Supporting Competitor Apps */}
                <div className="space-y-1.5">
                  <span className="font-semibold text-slate-400 block text-[11px]">
                    Supported by reviews from competing apps:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedOpp.supportingAppNames.map((name) => (
                      <span key={name} className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 text-xs">
                        {name}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Validation Questions */}
                <div className="space-y-1.5 pt-2 border-t border-slate-800">
                  <span className="font-semibold text-slate-300 block">
                    Validation Interview Questions:
                  </span>
                  <ul className="list-disc list-inside space-y-1 text-slate-400 pl-1">
                    {selectedOpp.validationQuestions.map((q, idx) => (
                      <li key={idx} className="text-slate-300">{q}</li>
                    ))}
                  </ul>
                </div>

                {/* Suggested Next Steps */}
                <div className="space-y-1.5 pt-2 border-t border-slate-800">
                  <span className="font-semibold text-slate-300 block">
                    Immediate Validation Roadmap:
                  </span>
                  <div className="space-y-1">
                    {selectedOpp.nextSteps.map((step, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-slate-300">
                        <CheckCircle className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center rounded-xl bg-slate-900 border border-slate-800 text-slate-400">
              Select an opportunity to view the deep dossier.
            </div>
          )}
        </div>
      </div>

      {/* Manual Creation Modal */}
      {isCreatingModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-base font-semibold text-white">Create New Opportunity Dossier</h3>

            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Opportunity Title</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g., Local-First SQLite Document Workspace"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Problem Statement</label>
                <textarea
                  required
                  rows={2}
                  value={newProblem}
                  onChange={(e) => setNewProblem(e.target.value)}
                  placeholder="Describe the persistent competitor failure extracted from reviews..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Proposed Product Concept</label>
                <textarea
                  required
                  rows={2}
                  value={newConcept}
                  onChange={(e) => setNewConcept(e.target.value)}
                  placeholder="What is your product solution that solves this?"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Target User</label>
                <input
                  type="text"
                  value={newTargetUser}
                  onChange={(e) => setNewTargetUser(e.target.value)}
                  placeholder="e.g. Remote software developers and legal advisors"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Severity</label>
                <select
                  value={newSeverity}
                  onChange={(e) => setNewSeverity(e.target.value as any)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
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
                  Create Opportunity
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
