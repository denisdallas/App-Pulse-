import React, { useState } from 'react';
import { Contact, Campaign, SuppressionRecord, Opportunity, Application } from '../types.ts';
import { 
  Send, 
  UserPlus, 
  Upload, 
  ShieldBan, 
  AlertOctagon, 
  Mail, 
  Trash2, 
  Sparkles, 
  ExternalLink
} from 'lucide-react';

interface OutreachStudioViewProps {
  contacts: Contact[];
  campaigns: Campaign[];
  suppression: SuppressionRecord[];
  opportunities: Opportunity[];
  apps: Application[];
  onSaveContact: (contact: Contact) => void;
  onDeleteContact: (id: string) => void;
  onImportCsv: (csvContent: string) => Promise<void>;
  onAddSuppression: (emailOrDomain: string, reason?: SuppressionRecord['reason']) => void;
  onRemoveSuppression: (id: string) => void;
  onCreateCampaign: (campaign: Campaign) => void;
  emailDeliveryReady: boolean;
  onSendCampaign: (campaignId: string) => Promise<{ success: boolean; sent: number; blocked: number; reasons: string[] }>;
  onGenerateDraft: (params: { contactId: string; opportunityId?: string; appId?: string; objective: string; tone: string }) => Promise<{ subject: string; body: string; generatedBy: 'ai_generated' | 'template' }>;
}

export const OutreachStudioView: React.FC<OutreachStudioViewProps> = ({
  contacts,
  campaigns,
  suppression,
  opportunities,
  apps,
  onSaveContact,
  onDeleteContact,
  onImportCsv,
  onAddSuppression,
  onRemoveSuppression,
  onCreateCampaign,
  emailDeliveryReady,
  onSendCampaign,
  onGenerateDraft,
}) => {
  const [activeTab, setActiveTab] = useState<'contacts' | 'campaigns' | 'suppression'>('contacts');

  // Contact Modal
  const [isAddContactModal, setIsAddContactModal] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactTitle, setContactTitle] = useState('');
  const [contactCompany, setContactCompany] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactWebsite, setContactWebsite] = useState('');
  const [contactSourceUrl, setContactSourceUrl] = useState('');
  const [contactConsentBasis, setContactConsentBasis] = useState<Contact['consentBasis']>('Unverified');
  const [contactAppId, setContactAppId] = useState('');
  const [contactOppId, setContactOppId] = useState('');

  // CSV Import Modal
  const [isImportModal, setIsImportModal] = useState(false);
  const [csvRawText, setCsvRawText] = useState('');

  // Campaign Builder
  const [isCampaignModal, setIsCampaignModal] = useState(false);
  const [campName, setCampName] = useState('');
  const [campObjective, setCampObjective] = useState<Campaign['objective']>('product_partnership');
  const [campTone, setCampTone] = useState<Campaign['tone']>('Consultative');
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [previewSubject, setPreviewSubject] = useState('');
  const [previewBody, setPreviewBody] = useState('');
  const [draftGeneratedBy, setDraftGeneratedBy] = useState<'ai_generated' | 'template' | null>(null);
  const [humanApproved, setHumanApproved] = useState(false);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendResultNotice, setSendResultNotice] = useState<string | null>(null);

  // Suppression Add
  const [suppressInput, setSuppressInput] = useState('');

  const hasPublicSource = (contact: Contact) => contact.sourceUrl.trim().startsWith('https://');
  const isOutreachEligible = (contact: Contact) => contact.consentBasis !== 'Unverified'
    && contact.status !== 'Do Not Contact'
    && hasPublicSource(contact);

  const handleCreateContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactEmail.trim() || !contactName.trim() || !contactCompany.trim()) return;
    if (contactConsentBasis !== 'Unverified' && !contactSourceUrl.trim().startsWith('https://')) {
      alert('A public HTTPS source URL is required for a verified contact basis.');
      return;
    }

    const matchedApp = apps.find((a) => a.id === contactAppId);
    const contact: Contact = {
      id: `cnt_${crypto.randomUUID()}`,
      name: contactName.trim(),
      title: contactTitle.trim(),
      company: contactCompany.trim(),
      email: contactEmail.trim().toLowerCase(),
      website: contactWebsite.trim() || undefined,
      channel: 'email',
      sourceUrl: contactSourceUrl.trim(),
      appId: contactAppId || undefined,
      appName: matchedApp?.name,
      opportunityId: contactOppId || undefined,
      status: 'New',
      consentBasis: contactConsentBasis,
      createdAt: new Date().toISOString(),
    };

    onSaveContact(contact);
    setIsAddContactModal(false);
    setContactName('');
    setContactTitle('');
    setContactEmail('');
    setContactCompany('');
    setContactWebsite('');
    setContactSourceUrl('');
    setContactConsentBasis('Unverified');
  };

  const handleImportCsvSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvRawText.trim()) return;
    await onImportCsv(csvRawText);
    setIsImportModal(false);
    setCsvRawText('');
  };

  const handleGenerateAIDraft = async () => {
    if (selectedContactIds.length === 0) {
      alert('Please select at least one contact first');
      return;
    }
    const firstContact = contacts.find((c) => c.id === selectedContactIds[0]);
    if (!firstContact) return;
    if (!isOutreachEligible(firstContact)) {
      alert('The selected contact needs a non-unverified consent basis and a public HTTPS source URL before drafting outreach.');
      return;
    }

    setIsGeneratingDraft(true);
    try {
      const draft = await onGenerateDraft({
        contactId: firstContact.id,
        opportunityId: firstContact.opportunityId,
        appId: firstContact.appId,
        objective: campObjective,
        tone: campTone,
      });
      setPreviewSubject(draft.subject);
      setPreviewBody(draft.body);
      setDraftGeneratedBy(draft.generatedBy);
    } catch (err: any) {
      alert(`AI Draft Error: ${err.message}`);
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  const handleCreateCampaignSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!campName.trim() || selectedContactIds.length === 0) return;
    if (!humanApproved) {
      alert('Human review and approval are required before saving this campaign.');
      return;
    }
    const selectedContacts = selectedContactIds.map((id) => contacts.find((contact) => contact.id === id)).filter((contact): contact is Contact => Boolean(contact));
    if (!selectedContacts.length || selectedContacts.some((contact) => !isOutreachEligible(contact))) {
      alert('Only contacts with a non-unverified consent basis and public HTTPS source can be approved.');
      return;
    }

    const recipients = selectedContacts.map((c) => {
      return {
        contactId: c.id,
        email: c.email,
        company: c.company,
        appName: c.appName || 'Product',
        personalizedSubject: previewSubject.replace('{{business_name}}', c.company).replace('{{app_name}}', c.appName || 'your product'),
        personalizedBody: previewBody.replace('{{business_name}}', c.company).replace('{{app_name}}', c.appName || 'your product'),
        status: 'approved' as const,
      };
    });

    const newCampaign: Campaign = {
      id: `camp_${Date.now()}`,
      name: campName,
      objective: campObjective,
      tone: campTone,
      targetCategory: 'Productivity & SaaS',
      templateSubject: previewSubject,
      templateBody: previewBody,
      recipients,
      status: 'approved',
      stats: {
        total: recipients.length,
        approved: recipients.length,
        sent: 0,
        delivered: 0,
        opened: 0,
        replied: 0,
        bounced: 0,
        unsubscribed: 0,
        suppressed: 0,
      },
      createdAt: new Date().toISOString(),
    };

    onCreateCampaign(newCampaign);
    setIsCampaignModal(false);
    setCampName('');
    setSelectedContactIds([]);
    setHumanApproved(false);
  };

  const handleSendCampaignNow = async (campaignId: string) => {
    setIsSending(true);
    try {
      const res = await onSendCampaign(campaignId);
      setSendResultNotice(res.success
        ? `Provider accepted ${res.sent} message(s); confirm delivery from provider webhooks.`
        : `No messages were sent or delivered. ${res.reasons[0] || 'No delivery provider is configured.'} ${res.blocked} recipient(s) were blocked.`);
      setTimeout(() => setSendResultNotice(null), 5000);
    } catch (err: any) {
      alert(`Send Error: ${err.message}`);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-amber-300 bg-amber-950/40 border border-amber-800/40 px-2 py-0.5 rounded flex items-center gap-1">
                <AlertOctagon className="w-3 h-3 text-amber-300" />
                Email delivery unavailable
              </span>
              <span className="text-xs text-slate-400">
                Drafts only · Source-linked contacts · Human review required
              </span>
          </div>
          <h2 className="text-base font-semibold text-white">
            Targeted Product Outreach & Publisher Partnerships
          </h2>
          <p className="text-xs text-slate-400 max-w-2xl">
            Organize source-linked business contacts and review evidence. AppPulse does not discover leads or send email; all drafts require human review.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setIsCampaignModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors shadow-sm"
          >
            <Mail className="w-3.5 h-3.5" />
            <span>New Campaign</span>
          </button>

          <button
            onClick={() => setIsAddContactModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5 text-slate-400" />
            <span>Add Contact</span>
          </button>

          <button
            onClick={() => setIsImportModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
          >
            <Upload className="w-3.5 h-3.5 text-slate-400" />
            <span>Import CSV</span>
          </button>
        </div>
      </div>

      {sendResultNotice && (
        <div className="p-3 rounded-lg bg-amber-950/60 border border-amber-800/60 text-xs text-amber-200 flex items-center gap-2">
          <AlertOctagon className="w-4 h-4 text-amber-400" />
          <span>{sendResultNotice}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('contacts')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'contacts'
              ? 'bg-slate-800 text-white font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Contacts ({contacts.length})
        </button>
        <button
          onClick={() => setActiveTab('campaigns')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'campaigns'
              ? 'bg-slate-800 text-white font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Outreach Campaigns ({campaigns.length})
        </button>
        <button
          onClick={() => setActiveTab('suppression')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'suppression'
              ? 'bg-slate-800 text-white font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Suppression & Opt-Outs ({suppression.length})
        </button>
      </div>

      {/* Tab 1: Contacts */}
      {activeTab === 'contacts' && (
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-800/80 text-slate-400 font-medium border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Contact & Title</th>
                    <th className="py-3 px-4">Company & App</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Source / Basis</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {contacts.map((contact) => (
                    <tr key={contact.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-white">{contact.name}</div>
                        <div className="text-[11px] text-slate-400">{contact.title}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="text-slate-200 font-medium">{contact.company}</div>
                        <div className="text-[11px] text-slate-400">{contact.appName || 'Direct Publisher'}</div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-300">{contact.email}</td>
                      <td className="py-3.5 px-4 text-[11px]">
                        <div className={contact.consentBasis === 'Unverified' ? 'text-amber-300' : 'text-slate-300'}>{contact.consentBasis}</div>
                        {contact.sourceUrl.startsWith('https://') ? <a href={contact.sourceUrl} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex max-w-48 items-center gap-1 truncate text-indigo-300 hover:text-indigo-200">Source <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" /></a> : <span className="text-slate-500">No public source</span>}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                          {contact.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => onDeleteContact(contact.id)}
                          className="text-slate-500 hover:text-rose-400 p-1"
                          title="Delete Contact"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Campaigns */}
      {activeTab === 'campaigns' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {campaigns.map((camp) => (
              <div
                key={camp.id}
                className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-mono uppercase text-indigo-400">
                        {camp.objective.replace('_', ' ')} · {camp.tone}
                      </span>
                      <h4 className="text-sm font-bold text-white mt-0.5">{camp.name}</h4>
                    </div>
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      {camp.status}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-800 text-xs space-y-1">
                    <span className="font-semibold text-slate-300 block">Subject: {camp.templateSubject}</span>
                    <p className="text-slate-400 line-clamp-3 text-[11px] whitespace-pre-line">
                      {camp.templateBody}
                    </p>
                  </div>

                  {/* Campaign Delivery Metrics */}
                  <div className="grid grid-cols-4 gap-2 text-center text-xs font-mono tabular-nums p-2 rounded bg-slate-800/40">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-sans">Recipients</span>
                      <span className="text-slate-200 font-bold">{camp.recipients.length}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-sans">Delivered</span>
                      <span className="text-emerald-400 font-bold">{camp.stats.delivered}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-sans">Suppressed</span>
                      <span className="text-rose-400 font-bold">{camp.stats.suppressed}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-sans">Unsubscribed</span>
                      <span className="text-amber-400 font-bold">{camp.stats.unsubscribed}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 font-mono">
                    Created {camp.createdAt.slice(0, 10)}
                  </span>

                  {camp.status !== 'completed' && (
                    <button
                      onClick={() => handleSendCampaignNow(camp.id)}
                      disabled={isSending || !emailDeliveryReady}
                      title={emailDeliveryReady ? 'Send using the configured provider' : 'No delivery provider is configured; this campaign remains a draft.'}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{isSending ? 'Sending…' : emailDeliveryReady ? 'Dispatch Campaign' : 'Delivery unavailable'}</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Suppression & Opt-Outs */}
      {activeTab === 'suppression' && (
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Suppression & Opt-Out Enforcement</h3>
            <p className="text-xs text-slate-400">
              Any email or domain registered here is strictly blocked from receiving campaign messages, protecting compliance with privacy and anti-spam standards.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!suppressInput.trim()) return;
              onAddSuppression(suppressInput.trim(), 'manual_suppression');
              setSuppressInput('');
            }}
            className="flex gap-2 max-w-md"
          >
            <input
              type="text"
              value={suppressInput}
              onChange={(e) => setSuppressInput(e.target.value)}
              placeholder="e.g. user@domain.com or @competitor.com"
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              className="px-3 py-1.5 text-xs font-semibold text-rose-300 bg-rose-950/60 hover:bg-rose-900 border border-rose-800/40 rounded-lg"
            >
              Add to Suppression
            </button>
          </form>

          <div className="divide-y divide-slate-800 border border-slate-800 rounded-lg overflow-hidden">
            {suppression.map((item) => (
              <div key={item.id} className="p-3 flex items-center justify-between text-xs hover:bg-slate-800/40">
                <div className="flex items-center gap-3">
                  <ShieldBan className="w-4 h-4 text-rose-400 shrink-0" />
                  <div>
                    <span className="font-mono text-slate-200 font-semibold">{item.emailOrDomain}</span>
                    <span className="text-[11px] text-slate-400 ml-2">Reason: {item.reason}</span>
                  </div>
                </div>
                <button
                  onClick={() => onRemoveSuppression(item.id)}
                  className="text-slate-500 hover:text-white text-xs"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Campaign Builder Modal */}
      {isCampaignModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-semibold text-white">Create B2B Outreach Campaign</h3>

            <form onSubmit={handleCreateCampaignSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Campaign Name</label>
                <input
                  type="text"
                  required
                  value={campName}
                  onChange={(e) => setCampName(e.target.value)}
                  placeholder="e.g., Q2 Offline Architecture Partnership Inquiry"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Outreach Objective</label>
                  <select
                    value={campObjective}
                    onChange={(e) => setCampObjective(e.target.value as any)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="product_partnership">Product Partnership</option>
                    <option value="feature_pitch">Feature Improvement Pitch</option>
                    <option value="advisory_discovery">Advisory / Founder Discovery</option>
                    <option value="dev_services">Dev & Engineering Services</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Tone</label>
                  <select
                    value={campTone}
                    onChange={(e) => setCampTone(e.target.value as any)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Consultative">Consultative</option>
                    <option value="Founder-to-Founder">Founder-to-Founder</option>
                    <option value="Value-First">Value-First</option>
                    <option value="Technical">Technical</option>
                  </select>
                </div>
              </div>

              {/* Select Contacts */}
              <div>
                <label className="block text-slate-400 mb-1">Select Recipients ({selectedContactIds.length} selected)</label>
                <div className="max-h-32 overflow-y-auto border border-slate-800 rounded-lg divide-y divide-slate-800 bg-slate-850 p-1">
                  {contacts.map((contact) => {
                    const isChecked = selectedContactIds.includes(contact.id);
                    const eligible = isOutreachEligible(contact);
                    return (
                      <label key={contact.id} className={`flex items-center justify-between gap-3 p-2 text-xs ${eligible ? 'cursor-pointer hover:bg-slate-800' : 'cursor-not-allowed opacity-50'}`}>
                        <span className="flex min-w-0 items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={!eligible}
                            onChange={() => setSelectedContactIds((current) => isChecked
                              ? current.filter((id) => id !== contact.id)
                              : [...current, contact.id])}
                            aria-label={`Select ${contact.name} at ${contact.company}`}
                            className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0"
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-white">{contact.name} ({contact.company})</span>
                            <span className={`text-[10px] ${eligible ? 'text-emerald-400' : 'text-amber-400'}`}>{eligible ? 'Source and basis recorded' : 'Not eligible: source or basis missing'}</span>
                          </span>
                        </span>
                        <span className="shrink-0 text-[11px] font-mono text-slate-400">{contact.email}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* AI Draft Generator */}
              <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200">Evidence-linked draft for human review</span>
                  <button
                    type="button"
                    onClick={handleGenerateAIDraft}
                    disabled={isGeneratingDraft || selectedContactIds.length === 0}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-indigo-300 bg-indigo-950 hover:bg-indigo-900 border border-indigo-800/40 rounded transition-colors disabled:opacity-50"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{isGeneratingDraft ? 'Drafting…' : 'Generate draft'}</span>
                  </button>
                </div>

                {draftGeneratedBy && <p className="text-[10px] text-slate-500">Draft source: {draftGeneratedBy === 'ai_generated' ? 'Vercel AI Gateway, evidence-linked' : 'deterministic template'}. Not sent by AppPulse.</p>}
                <div>
                  <label className="block text-slate-400 mb-1">Subject Template</label>
                  <input
                    type="text"
                    required
                    value={previewSubject}
                    onChange={(e) => setPreviewSubject(e.target.value)}
                    placeholder="Subject line with merge fields (e.g., {{business_name}})"
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Message Body Template</label>
                  <textarea
                    required
                    rows={5}
                    value={previewBody}
                    onChange={(e) => setPreviewBody(e.target.value)}
                    placeholder="Message body with personalized merge fields and required opt-out footer..."
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Mandatory Human Approval Checkbox */}
              <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-800/40 flex items-start gap-2.5">
                <input
                  type="checkbox"
                  id="humanApproval"
                  checked={humanApproved}
                  onChange={(e) => setHumanApproved(e.target.checked)}
                  className="mt-0.5 rounded border-slate-700 text-indigo-600 focus:ring-0"
                />
                <label htmlFor="humanApproval" className="text-slate-300 text-[11px] leading-relaxed cursor-pointer">
                  <strong className="text-amber-400 font-semibold">Human review gate: </strong>
                  I confirm the source URL and contact basis are accurate, suppression has been checked, and I will handle any opt-out manually. Saving this draft does not send it.
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCampaignModal(false)}
                  className="px-3 py-1.5 text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!humanApproved || selectedContactIds.length === 0}
                  className="px-4 py-1.5 font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg disabled:opacity-50"
                >
                  Save Campaign
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Contact Modal */}
      {isAddContactModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-base font-semibold text-white">Add Business Contact</h3>

            <form onSubmit={handleCreateContact} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="e.g. Alex Morgan"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Title / Role</label>
                <input
                  type="text"
                  required
                  value={contactTitle}
                  onChange={(e) => setContactTitle(e.target.value)}
                  placeholder="e.g. Head of Mobile Product"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Company / Organization</label>
                <input
                  type="text"
                  required
                  value={contactCompany}
                  onChange={(e) => setContactCompany(e.target.value)}
                  placeholder="e.g. Notion Labs, Inc."
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Professional Email</label>
                <input
                  type="email"
                  required
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="e.g. amorgan@company.com"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Public HTTPS source URL</label>
                <input
                  type="url"
                  value={contactSourceUrl}
                  onChange={(e) => setContactSourceUrl(e.target.value)}
                  required={contactConsentBasis !== 'Unverified'}
                  placeholder="https://publisher.example/contact"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Contact basis</label>
                <select
                  value={contactConsentBasis}
                  onChange={(e) => setContactConsentBasis(e.target.value as Contact['consentBasis'])}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="Unverified">Unverified — not eligible for outreach</option>
                  <option value="Public Publisher Info">Public publisher information</option>
                  <option value="Legitimate Interest (B2B)">Legitimate interest (B2B)</option>
                  <option value="Inquiry Request">Inquiry request</option>
                </select>
                <p className="mt-1 text-[10px] text-slate-500">A verified basis requires a public HTTPS source. AppPulse does not verify legal compliance.</p>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Associated Application</label>
                <select
                  value={contactAppId}
                  onChange={(e) => setContactAppId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">None / General</option>
                  {apps.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.publisher})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddContactModal(false)}
                  className="px-3 py-1.5 text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg"
                >
                  Add Contact
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {isImportModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-base font-semibold text-white">Import Contacts from CSV</h3>
            <p className="text-xs text-slate-400">
              Paste CSV rows with name, title, company, email, sourceUrl, consentBasis, and optional website. Imported contacts remain unverified unless a public HTTPS source and recognized basis are supplied.
            </p>

            <form onSubmit={handleImportCsvSubmit} className="space-y-3 text-xs">
              <textarea
                required
                rows={6}
                value={csvRawText}
                onChange={(e) => setCsvRawText(e.target.value)}
                placeholder={`name,title,company,email,sourceUrl,consentBasis,website\nJane Doe,Product Lead,Example Co,jane@example.com,https://example.com/team,Public Publisher Info,https://example.com`}
                className="w-full font-mono bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500 text-xs"
              />

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsImportModal(false)}
                  className="px-3 py-1.5 text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg"
                >
                  Parse & Import
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
