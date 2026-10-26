import React, { useState } from 'react';
import { Application, AppCategory, Marketplace, UpdateFrequency } from '../types.ts';
import { isVersionInRange } from '../lib/forecast.ts';
import { 
  Search, 
  Filter, 
  Star, 
  ExternalLink, 
  DownloadCloud, 
  Check, 
  Plus, 
  Layers, 
  CheckCircle2,
  RefreshCw,
  SlidersHorizontal,
  X,
  Bug,
  Sparkles,
  Clock,
  Tag
} from 'lucide-react';

interface DiscoveryViewProps {
  apps: Application[];
  selectedCompareIds: string[];
  onToggleCompare: (appId: string) => void;
  onTriggerCollect: (appId: string) => Promise<void> | void;
  onViewReviews: (appId: string) => void;
  onSearchOnline: (query: string, marketplace: Marketplace | 'all', category?: AppCategory) => Promise<void>;
  isSearchingOnline: boolean;
}

const CATEGORIES: ('all' | AppCategory)[] = [
  'all',
  'Finance',
  'Productivity',
  'Developer Tools',
  'Gaming',
  'Fitness',
  'Business Software',
  'Healthcare',
  'Education',
  'E-commerce',
  'Other',
];

const MARKETPLACES: { id: 'all' | Marketplace; label: string }[] = [
  { id: 'all', label: 'All supported' },
  { id: 'googleplay', label: 'Google Play' },
  { id: 'steam', label: 'Steam' },
  { id: 'microsoft', label: 'Microsoft Store' },
  { id: 'apple', label: 'Apple App Store' },
];

const UPDATE_FREQUENCIES: ('all' | UpdateFrequency)[] = [
  'all',
  'Daily',
  'Weekly',
  'Bi-weekly',
  'Monthly',
  'Quarterly',
  'Stale',
];

const BRAND_GRADIENTS: Record<string, string> = {
  gp_quickbooks: 'from-emerald-600 to-green-700 text-white',
  gp_expensify: 'from-red-500 to-rose-700 text-white',
  gp_notion: 'from-slate-700 to-slate-900 text-white',
  gp_clickup: 'from-purple-600 to-pink-600 text-white',
  ms_docker: 'from-sky-500 to-blue-700 text-white',
  steam_730: 'from-amber-600 to-orange-700 text-white',
  steam_949230: 'from-cyan-600 to-teal-700 text-white',
  gp_myfitnesspal: 'from-blue-600 to-indigo-700 text-white',
};

export const DiscoveryView: React.FC<DiscoveryViewProps> = ({
  apps,
  selectedCompareIds,
  onToggleCompare,
  onTriggerCollect,
  onViewReviews,
  onSearchOnline,
  isSearchingOnline,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | AppCategory>('all');
  const [selectedMarketplace, setSelectedMarketplace] = useState<'all' | Marketplace>('all');
  const [minRating, setMinRating] = useState<number>(0);
  const [collectingAppId, setCollectingAppId] = useState<string | null>(null);

  // Advanced Filters State
  const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(false);
  const [minVersion, setMinVersion] = useState<string>('');
  const [maxVersion, setMaxVersion] = useState<string>('');
  const [selectedFrequency, setSelectedFrequency] = useState<'all' | UpdateFrequency>('all');
  const [filterBugMentions, setFilterBugMentions] = useState<boolean>(false);
  const [filterFeatureRequests, setFilterFeatureRequests] = useState<boolean>(false);

  // Active filter count calculation
  const activeAdvancedCount = 
    (minVersion ? 1 : 0) +
    (maxVersion ? 1 : 0) +
    (selectedFrequency !== 'all' ? 1 : 0) +
    (filterBugMentions ? 1 : 0) +
    (filterFeatureRequests ? 1 : 0);

  const resetAdvancedFilters = () => {
    setMinVersion('');
    setMaxVersion('');
    setSelectedFrequency('all');
    setFilterBugMentions(false);
    setFilterFeatureRequests(false);
  };

  const filteredApps = apps.filter((app) => {
    if (selectedCategory !== 'all' && app.category !== selectedCategory) return false;
    if (selectedMarketplace !== 'all' && app.marketplace !== selectedMarketplace) return false;
    if (minRating > 0 && app.rating < minRating) return false;

    // Advanced filters
    if (selectedFrequency !== 'all' && app.updateFrequency !== selectedFrequency) return false;
    if (minVersion || maxVersion) {
      if (!isVersionInRange(app.currentVersion || '1.0.0', minVersion, maxVersion)) return false;
    }
    if (filterBugMentions && !app.hasBugMentions) return false;
    if (filterFeatureRequests && !app.hasFeatureRequests) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchesName = app.name.toLowerCase().includes(q);
      const matchesPub = app.publisher.toLowerCase().includes(q);
      const matchesDesc = app.description.toLowerCase().includes(q);
      const matchesTag = app.tags.some((t) => t.toLowerCase().includes(q));
      if (!matchesName && !matchesPub && !matchesDesc && !matchesTag) return false;
    }
    return true;
  });

  const handleCollect = async (appId: string) => {
    setCollectingAppId(appId);
    try {
      await onTriggerCollect(appId);
    } finally {
      setCollectingAppId(null);
    }
  };

  const handleOnlineSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    await onSearchOnline(searchQuery.trim(), selectedMarketplace, selectedCategory === 'all' ? undefined : selectedCategory);
  };

  const getInitials = (name: string) => {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Search & Filter Bar */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
        <form onSubmit={handleOnlineSearch} className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by keywords, application name, category, or developer..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedMarketplace}
              onChange={(e) => setSelectedMarketplace(e.target.value as any)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              {MARKETPLACES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors shrink-0 ${
                showAdvancedFilters || activeAdvancedCount > 0
                  ? 'bg-indigo-950/70 border-indigo-500 text-indigo-300'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Advanced Filters</span>
              {activeAdvancedCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-indigo-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {activeAdvancedCount}
                </span>
              )}
            </button>

            <button
              type="submit"
              disabled={isSearchingOnline || !searchQuery.trim()}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors disabled:opacity-50 shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSearchingOnline ? 'animate-spin' : ''}`} />
              <span>{isSearchingOnline ? 'Querying catalog…' : 'Search catalog'}</span>
            </button>
          </div>
        </form>

        {/* Categories Segmented Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors font-medium text-xs ${
                selectedCategory === cat
                  ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {cat === 'all' ? 'All Categories' : cat}
            </button>
          ))}
        </div>

        {/* Advanced Filters Expandable Drawer */}
        {showAdvancedFilters && (
          <div className="pt-4 mt-2 border-t border-slate-800/80 bg-slate-950/40 p-4 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400" />
                Advanced Application & Review Filter Criteria
              </span>
              {activeAdvancedCount > 0 && (
                <button
                  type="button"
                  onClick={resetAdvancedFilters}
                  className="text-[11px] text-slate-400 hover:text-rose-400 flex items-center gap-1 transition-colors"
                >
                  <X className="w-3 h-3" />
                  Reset all filters
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              {/* Min Version */}
              <div className="space-y-1">
                <label className="text-[11px] text-slate-400">Min App Version</label>
                <input
                  type="text"
                  value={minVersion}
                  onChange={(e) => setMinVersion(e.target.value)}
                  placeholder="e.g. 1.0.0"
                  className="w-full bg-slate-800 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              {/* Max Version */}
              <div className="space-y-1">
                <label className="text-[11px] text-slate-400">Max App Version</label>
                <input
                  type="text"
                  value={maxVersion}
                  onChange={(e) => setMaxVersion(e.target.value)}
                  placeholder="e.g. 10.0.0"
                  className="w-full bg-slate-800 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              {/* Update Frequency */}
              <div className="space-y-1">
                <label className="text-[11px] text-slate-400">Update Frequency</label>
                <select
                  value={selectedFrequency}
                  onChange={(e) => setSelectedFrequency(e.target.value as any)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  {UPDATE_FREQUENCIES.map((freq) => (
                    <option key={freq} value={freq}>
                      {freq === 'all' ? 'All Update Cadences' : freq}
                    </option>
                  ))}
                </select>
              </div>

              {/* Review Signals (Bugs & Features) */}
              <div className="space-y-1.5">
                <label className="text-[11px] text-slate-400">Review Signals</label>
                <div className="flex flex-col gap-1.5">
                  <label className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-300">
                    <input
                      type="checkbox"
                      checked={filterBugMentions}
                      onChange={(e) => setFilterBugMentions(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-0 focus:ring-offset-0"
                    />
                    <span className="flex items-center gap-1">
                      <Bug className="w-3 h-3 text-rose-400" />
                      Has Bug Mentions in Reviews
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-300">
                    <input
                      type="checkbox"
                      checked={filterFeatureRequests}
                      onChange={(e) => setFilterFeatureRequests(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-0 focus:ring-offset-0"
                    />
                    <span className="flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-amber-400" />
                      Has Feature Requests in Reviews
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Results Header */}
      <div className="flex items-center justify-between text-xs text-slate-400 px-1">
        <div className="flex items-center gap-2">
          <span>
            Showing <span className="font-mono text-slate-200 tabular-nums">{filteredApps.length}</span> applications
          </span>
          {activeAdvancedCount > 0 && (
            <span className="text-[11px] text-indigo-400">
              ({activeAdvancedCount} advanced filter{activeAdvancedCount > 1 ? 's' : ''} applied)
            </span>
          )}
        </div>
        {selectedCompareIds.length > 0 && (
          <div className="flex items-center gap-2 bg-indigo-950/60 border border-indigo-700/50 px-3 py-1 rounded-lg text-indigo-300 text-xs">
            <span>{selectedCompareIds.length} apps selected for comparison</span>
          </div>
        )}
      </div>

      {/* App Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredApps.map((app) => {
          const isComparing = selectedCompareIds.includes(app.id);
          const isCollecting = collectingAppId === app.id;
          const bgGradient = BRAND_GRADIENTS[app.id] || 'from-indigo-600 to-indigo-800 text-white';
          const isSteamApp = app.marketplace === 'steam' && app.iconUrl;

          return (
            <div
              key={app.id}
              className={`p-5 rounded-xl bg-slate-900 border transition-all flex flex-col justify-between space-y-4 ${
                isComparing ? 'border-indigo-500 shadow-sm shadow-indigo-500/20' : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="space-y-3">
                {/* Header info */}
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700/80 flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                    {isSteamApp ? (
                      <img
                        src={app.iconUrl}
                        alt={app.name}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className={`w-full h-full bg-gradient-to-br ${bgGradient} flex items-center justify-center font-bold text-xs tracking-wider font-mono`}>
                        {getInitials(app.name)}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-white truncate">{app.name}</h3>
                    <div className="text-xs text-slate-400 truncate">{app.publisher}</div>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-1">
                      <span className="capitalize text-slate-300 font-medium">
                        {app.marketplace === 'googleplay' ? 'Google Play' : app.marketplace === 'steam' ? 'Steam' : app.marketplace === 'apple' ? 'Apple App Store' : 'Microsoft Store'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="text-indigo-400">{app.category}</span>
                    </div>
                  </div>
                </div>

                {/* Rating & Stats Strip */}
                <div className="flex items-center justify-between text-xs py-2 px-3 rounded-lg bg-slate-800/60 border border-slate-800">
                  <div className="flex items-center gap-1 text-amber-400 font-mono font-bold tabular-nums">
                    {app.ratingCount > 0 ? <><Star className="w-3.5 h-3.5 fill-amber-400" /><span>{app.rating.toFixed(1)}</span></> : <span className="text-slate-500">Rating n/a</span>}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                    {app.ratingCount > 0 ? `${app.ratingCount.toLocaleString()} ratings` : 'Ratings n/a'}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                    {app.reviewCount > 0 ? `${app.reviewCount.toLocaleString()} reviews` : app.collectionAvailable ? 'Review count n/a' : 'Review text unavailable'}
                  </div>
                </div>

                {/* Release Cadence & Version Metadata */}
                <div className="flex items-center justify-between text-[11px] px-2 py-1 bg-slate-950/50 rounded border border-slate-800/60 text-slate-400">
                  <div className="flex items-center gap-1 font-mono">
                    <span className="text-slate-400">Version:</span>
                    <span className="text-indigo-300 font-semibold">{app.currentVersion || 'Not provided'}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span className="text-slate-300">{app.updateFrequency || 'Monthly'} cadence</span>
                  </div>
                </div>

                {/* Description */}
                <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                  {app.description}
                </p>

                {/* Review Mentions & Tags */}
                <div className="space-y-1.5">
                  {(app.hasBugMentions || app.hasFeatureRequests) && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {app.hasBugMentions && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-rose-300 bg-rose-950/40 border border-rose-800/40 px-2 py-0.5 rounded">
                          <Bug className="w-2.5 h-2.5" />
                          Bug Mentions in Reviews
                        </span>
                      )}
                      {app.hasFeatureRequests && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-amber-300 bg-amber-950/40 border border-amber-800/40 px-2 py-0.5 rounded">
                          <Sparkles className="w-2.5 h-2.5" />
                          Feature Requests in Reviews
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-1">
                    {app.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onToggleCompare(app.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${
                      isComparing
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>{isComparing ? 'Comparing' : 'Compare'}</span>
                  </button>

                  <button
                    onClick={() => onViewReviews(app.id)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
                  >
                    Reviews
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleCollect(app.id)}
                    disabled={isCollecting || !app.collectionAvailable}
                    aria-label={app.collectionAvailable ? `Collect public reviews for ${app.name}` : `Review collection unavailable for ${app.name}`}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-amber-300 bg-amber-950/40 hover:bg-amber-900/60 border border-amber-800/40 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    title={app.collectionAvailable ? 'Queue a real review collection job' : 'This marketplace does not expose a supported review collection source'}
                  >
                    <DownloadCloud className={`w-3.5 h-3.5 ${isCollecting ? 'animate-bounce' : ''}`} />
                    <span>{isCollecting ? 'Collecting…' : app.collectionAvailable ? 'Collect' : 'Unavailable'}</span>
                  </button>

                  <a
                    href={app.storeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                    title="Open Store Listing"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
