import type { Application, Review } from '../../src/types.ts';
import type { MarketplaceConnector, SearchOptions, ReviewFetchOptions, FetchReviewsResult } from './types.ts';

/** Public Steam Store discovery and Community Reviews endpoints. */
export class SteamConnector implements MarketplaceConnector {
  marketplace = 'steam' as const;
  displayName = 'Steam (Valve)';

  async searchApps(options: SearchOptions): Promise<Application[]> {
    const term = encodeURIComponent(options.query || 'game');
    const response = await fetch(`https://store.steampowered.com/api/storesearch/?term=${term}&l=english&cc=US`, {
      headers: { 'User-Agent': 'AppPulse-Intelligence/1.0' },
    });
    if (!response.ok) throw new Error(`Steam catalog returned HTTP ${response.status}`);
    const data = await response.json() as { items?: unknown };
    if (!data || !Array.isArray(data.items)) throw new Error('Steam catalog returned an invalid response');

    return data.items.slice(0, Math.max(1, Math.min(50, options.limit || 15))).flatMap((item: any) => {
      if (!Number.isInteger(Number(item?.id)) || typeof item?.name !== 'string' || !item.name.trim()) return [];
      const appId = String(item.id);
      return [{
        id: `steam_${appId}`,
        name: item.name.trim(),
        iconUrl: typeof item.tiny_image === 'string' && item.tiny_image ? item.tiny_image : undefined,
        publisher: 'Not provided by catalog search',
        marketplace: 'steam' as const,
        description: 'Basic catalog metadata only; rating, publisher, release date, and review counts were not returned by this search endpoint.',
        category: 'Gaming' as const,
        rating: 0,
        ratingCount: 0,
        reviewCount: 0,
        metadataStatus: 'catalog_only' as const,
        platform: 'Not provided by catalog search',
        releaseDate: 'Not provided',
        lastUpdated: 'Not provided',
        currentVersion: 'Not provided',
        updateFrequency: 'Unknown' as const,
        storeUrl: `https://store.steampowered.com/app/${appId}/`,
        collectionAvailable: true,
        status: 'active' as const,
        tags: ['Steam'],
      }];
    });
  }

  async fetchReviews(appId: string, options: ReviewFetchOptions = {}): Promise<FetchReviewsResult> {
    const match = /^steam_(\d+)$/.exec(appId);
    if (!match) throw new Error('Invalid Steam application identifier');
    const rawAppId = match[1];
    const reviewType = options.negativeOnly ? 'negative' : 'all';
    const limit = Math.max(1, Math.min(100, options.limit || 30));
    const url = `https://store.steampowered.com/appreviews/${rawAppId}?json=1&filter=recent&review_type=${reviewType}&language=english&num_per_page=${limit}`;
    const response = await fetch(url, { headers: { 'User-Agent': 'AppPulse-Intelligence/1.0' } });
    if (!response.ok) throw new Error(`Steam reviews returned HTTP ${response.status}`);
    const data = await response.json() as { success?: number; reviews?: unknown; query_summary?: { total_reviews?: number } };
    if (!data || data.success !== 1 || !Array.isArray(data.reviews)) throw new Error('Steam reviews returned an invalid response');

    const reviews: Omit<Review, 'fingerprint'>[] = data.reviews.flatMap((raw: any) => {
      if ((typeof raw?.recommendationid !== 'string' && typeof raw?.recommendationid !== 'number') || typeof raw?.review !== 'string' || typeof raw?.voted_up !== 'boolean') return [];
      const timestamp = Number(raw.timestamp_created);
      if (!Number.isFinite(timestamp) || timestamp <= 0) return [];
      const text = raw.review.replace(/\[\/?(b|i|u|h1|h2|h3|url|quote|code|list|\*)\]/gi, '').trim();
      if (!text) return [];
      const sourceReviewId = String(raw.recommendationid);
      const positive = raw.voted_up;
      return [{
        id: `steam_review_${sourceReviewId}`,
        sourceReviewId,
        appId,
        appName: `Steam App ${rawAppId}`,
        marketplace: 'steam' as const,
        text,
        starRating: positive ? 5 : 1,
        ratingScale: 'binary_recommendation' as const,
        reviewDate: new Date(timestamp * 1000).toISOString(),
        language: typeof raw.language === 'string' ? raw.language : 'und',
        reviewUrl: `https://steamcommunity.com/app/${rawAppId}/reviews/`,
        helpfulVotes: Number.isFinite(Number(raw.votes_up)) ? Math.max(0, Number(raw.votes_up)) : 0,
        collectedAt: new Date().toISOString(),
        tagList: positive ? [] : ['Steam Negative Recommendation'],
      }];
    });
    const totalAvailable = Number.isFinite(data.query_summary?.total_reviews)
      ? Math.max(0, Number(data.query_summary?.total_reviews))
      : reviews.length;
    return { reviews, totalAvailable, hasMore: totalAvailable > reviews.length };
  }

  async getStatus() {
    const started = Date.now();
    try {
      const response = await fetch('https://store.steampowered.com/api/storesearch/?term=test&l=english', {
        headers: { 'User-Agent': 'AppPulse-Intelligence/1.0' },
      });
      return {
        status: response.ok ? ('operational' as const) : ('degraded' as const),
        latencyMs: Date.now() - started,
        message: response.ok ? 'Steam catalog search endpoint responded; review retrieval has not been verified.' : `HTTP ${response.status}`,
        reviewCoverage: 'Steam Community review endpoint is implemented; each collection result is persisted only after a successful response.',
      };
    } catch {
      return {
        status: 'degraded' as const,
        latencyMs: Date.now() - started,
        message: 'Steam catalog connectivity could not be verified.',
        reviewCoverage: 'Review retrieval has not been verified.',
      };
    }
  }
}
