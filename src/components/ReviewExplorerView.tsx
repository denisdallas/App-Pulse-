import React, { useState } from 'react';
import { Review, Application, Marketplace, ComplaintCategory } from '../types.ts';
import { 
  Star, 
  Search, 
  Filter, 
  Bookmark, 
  ExternalLink, 
  Tag, 
  FileEdit, 
  Check, 
  AlertCircle,
  ThumbsUp
} from 'lucide-react';

interface ReviewExplorerViewProps {
  reviews: Review[];
  apps: Application[];
  selectedAppId?: string;
  onSelectApp: (appId: string) => void;
  onUpdateReview: (reviewId: string, updates: Partial<Review>) => void;
}

const CATEGORIES: ('all' | ComplaintCategory)[] = [
  'all',
  'Bugs & Crashes',
  'Missing Features',
  'UX & Navigation',
  'Pricing & Subscriptions',
  'Performance & Reliability',
  'Customer Support',
  'Feature Requests',
];

export const ReviewExplorerView: React.FC<ReviewExplorerViewProps> = ({
  reviews,
  apps,
  selectedAppId,
  onSelectApp,
  onUpdateReview,
}) => {
  const [starFilter, setStarFilter] = useState<'all' | 'negative' | 1 | 2 | 3 | 4 | 5>('negative');
  const [categoryFilter, setCategoryFilter] = useState<'all' | ComplaintCategory>('all');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [newTagText, setNewTagText] = useState('');

  // Filtering
  const filteredReviews = reviews.filter((r) => {
    if (selectedAppId && selectedAppId !== 'all' && r.appId !== selectedAppId) return false;
    if (starFilter === 'negative' && r.starRating > 2) return false;
    if (typeof starFilter === 'number' && r.starRating !== starFilter) return false;
    if (categoryFilter !== 'all' && r.classification?.category !== categoryFilter) return false;
    if (searchKeyword.trim()) {
      const q = searchKeyword.toLowerCase();
      const inText = r.text.toLowerCase().includes(q);
      const inApp = r.appName.toLowerCase().includes(q);
      const inKeywords = (r.classification?.keywords || []).some((k) => k.toLowerCase().includes(q));
      if (!inText && !inApp && !inKeywords) return false;
    }
    return true;
  });

  const handleSaveNote = (reviewId: string) => {
    onUpdateReview(reviewId, { notes: noteText });
    setEditingReviewId(null);
  };

  const handleToggleBookmark = (review: Review) => {
    onUpdateReview(review.id, { savedToCollection: !review.savedToCollection });
  };

  const handleAddTag = (review: Review) => {
    if (!newTagText.trim()) return;
    const currentTags = review.tagList || [];
    if (!currentTags.includes(newTagText.trim())) {
      onUpdateReview(review.id, { tagList: [...currentTags, newTagText.trim()] });
    }
    setNewTagText('');
  };

  // Keyword highlighter helper
  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-amber-400/30 text-amber-200 px-1 py-0.5 rounded">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Controls & Filter Strip */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Keyword Search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="Search complaint text (e.g., 'crash', 'refund', 'offline', 'battery')..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* App Selector */}
          <select
            value={selectedAppId || 'all'}
            onChange={(e) => onSelectApp(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All Applications ({apps.length})</option>
            {apps.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          {/* Star Filter */}
          <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-lg border border-slate-700 shrink-0 text-xs">
            <button
              onClick={() => setStarFilter('negative')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                starFilter === 'negative'
                  ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              1-2 ★ Negative
            </button>
            <button
              onClick={() => setStarFilter('all')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                starFilter === 'all'
                  ? 'bg-slate-700 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All Stars
            </button>
            {[1, 2, 3].map((star) => (
              <button
                key={star}
                onClick={() => setStarFilter(star as any)}
                className={`px-2 py-1 rounded text-xs font-mono tabular-nums transition-colors ${
                  starFilter === star
                    ? 'bg-amber-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {star}★
              </button>
            ))}
          </div>
        </div>

        {/* Categories Strip */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors font-medium text-xs ${
                categoryFilter === cat
                  ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {cat === 'all' ? 'All Complaints' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Review Count Info */}
      <div className="flex items-center justify-between text-xs text-slate-400 px-1">
        <div>
          Filtered <span className="font-mono text-slate-200 font-bold tabular-nums">{filteredReviews.length}</span> reviews
          {starFilter === 'negative' && ' (Prioritizing 1-Star & 2-Star complaints)'}
        </div>
        <div className="text-[11px] text-slate-400">
          Source attributed · Real user feedback
        </div>
      </div>

      {/* Reviews List */}
      <div className="space-y-3">
        {filteredReviews.length === 0 ? (
          <div className="p-12 text-center rounded-xl bg-slate-900 border border-slate-800 space-y-2">
            <AlertCircle className="w-8 h-8 text-slate-500 mx-auto" />
            <h4 className="text-sm font-semibold text-slate-300">No matching reviews found</h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Try adjusting your rating filter, keyword search, or category selections.
            </p>
          </div>
        ) : (
          filteredReviews.map((review) => {
            const isEditing = editingReviewId === review.id;

            return (
              <div
                key={review.id}
                className="p-5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700/80 transition-all space-y-3"
              >
                {/* Review Header */}
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-white">
                        {review.appName}
                      </span>
                      <span aria-hidden="true" className="text-slate-400">·</span>
                      <span className="text-[11px] text-slate-400 capitalize">
                        {review.marketplace}
                      </span>
                      {review.appVersion && (
                        <>
                          <span aria-hidden="true" className="text-slate-400">·</span>
                          <span className="text-[10px] font-mono text-slate-400">
                            v{review.appVersion}
                          </span>
                        </>
                      )}
                      <span aria-hidden="true" className="text-slate-400">·</span>
                      {review.isDemo ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/40 font-mono">
                          Demo / Seed
                        </span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/40 font-mono">
                          Verified Live
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Star Display */}
                      <div className="flex items-center gap-0.5 text-amber-400">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={`w-3.5 h-3.5 ${
                              i < review.starRating ? 'fill-amber-400' : 'text-slate-700'
                            }`}
                          />
                        ))}
                      </div>

                      <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                        {review.reviewDate.slice(0, 10)}
                      </span>

                      {review.classification?.category && (
                        <span className="text-[10px] font-medium text-amber-300 bg-amber-950/60 border border-amber-800/40 px-2 py-0.5 rounded">
                          {review.classification.category}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions (Bookmark, Link) */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleToggleBookmark(review)}
                      className={`p-1.5 rounded-lg border transition-colors ${
                        review.savedToCollection
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                          : 'text-slate-400 hover:text-white border-slate-800 hover:bg-slate-800'
                      }`}
                      title={review.savedToCollection ? 'Saved in Research Collection' : 'Save to Research'}
                    >
                      <Bookmark className="w-3.5 h-3.5" />
                    </button>

                    {review.reviewUrl && (
                      <a
                        href={review.reviewUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 text-slate-400 hover:text-white rounded-lg border border-slate-800 hover:bg-slate-800"
                        title="Open Source Review"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Review Text with highlighting */}
                <p className="text-xs text-slate-300 leading-relaxed font-normal">
                  {highlightText(review.text, searchKeyword)}
                </p>

                {/* Tags & Helpful Votes */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/60 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(review.tagList || []).map((t) => (
                      <span key={t} className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                        #{t}
                      </span>
                    ))}

                    <button
                      onClick={() => {
                        const tag = prompt('Enter custom tag (e.g. "Churn Factor", "UX Block"):');
                        if (tag) {
                          const currentTags = review.tagList || [];
                          onUpdateReview(review.id, { tagList: [...currentTags, tag.trim()] });
                        }
                      }}
                      className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5"
                    >
                      <Tag className="w-2.5 h-2.5" />
                      <span>+ Tag</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-3 text-slate-400 text-[11px]">
                    {review.helpfulVotes !== undefined && review.helpfulVotes > 0 && (
                      <span className="flex items-center gap-1 font-mono tabular-nums text-slate-400">
                        <ThumbsUp className="w-3 h-3 text-slate-500" />
                        {review.helpfulVotes} found helpful
                      </span>
                    )}

                    <button
                      onClick={() => {
                        setEditingReviewId(isEditing ? null : review.id);
                        setNoteText(review.notes || '');
                      }}
                      className="text-slate-400 hover:text-slate-200 flex items-center gap-1 text-[11px]"
                    >
                      <FileEdit className="w-3 h-3" />
                      <span>{review.notes ? 'Edit note' : 'Add note'}</span>
                    </button>
                  </div>
                </div>

                {/* Saved Analyst Note */}
                {review.notes && !isEditing && (
                  <div className="p-2.5 rounded bg-slate-800/80 border border-slate-700/60 text-[11px] text-slate-300">
                    <span className="font-semibold text-indigo-400">Analyst Note: </span>
                    {review.notes}
                  </div>
                )}

                {/* Note Edit Box */}
                {isEditing && (
                  <div className="p-3 rounded bg-slate-800 border border-slate-700 space-y-2">
                    <textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Write your research note or competitor vulnerability hypothesis..."
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                      rows={2}
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setEditingReviewId(null)}
                        className="px-2.5 py-1 text-xs text-slate-400 hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSaveNote(review.id)}
                        className="px-3 py-1 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded"
                      >
                        Save Note
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
