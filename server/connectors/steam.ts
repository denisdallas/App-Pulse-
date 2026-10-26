import type { Application, Review } from '../../src/types.ts';
import type { MarketplaceConnector, SearchOptions, ReviewFetchOptions, FetchReviewsResult } from './types.ts';

const steamHeaders = { 'User-Agent': 'AppPulse-Intelligence/1.0' };

async function fetchSteam(url: string): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, { headers: steamHeaders, signal: AbortSignal.timeout(6_000) });
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      const retryAfter = Number(response.headers.get('retry-after'));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(2_000, Math.max(250, retryAfter * 1_000))
        : 350 * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }
    return response;
  }
  throw new Error('Steam source remained unavailable after bounded retries');
}

/** Public Steam Store discovery and Community Reviews endpoints. */
export class SteamConnector implements MarketplaceConnector {
  marketplace = 'steam' as const;
  displayName = 'Steam (Valve)';

  async searchApps(options: SearchOptions): Promise<Application[]> {
    const params = new URLSearchParams({ term: options.query.trim() || 'game', l: 'english', cc: 'US' });
    const response = await fetchSteam(`https://store.steampowered.com/api/storesearch/?${params.toString()}`);
    if (!response.ok) throw new Error(`Steam catalog returned HTTP ${response.status}`);
    const data = await response.json() as { items?: unknown };
    if (!data || !Array.isArray(data.items)) throw new Error('Steam catalog returned an invalid response');

    const limit = Math.max(1, Math.min(50, Math.trunc(options.limit || 15)));
    return data.items.slice(0, limit).flatMap((raw): Application[] => {
      if (!raw || typeof raw !== 'object') return [];
      const item = raw as Record<string, unknown>;
      const numericId = Number(item.id);
      if (!Number.isSafeInteger(numericId) || numericId <= 0 || typeof item.name !== 'string' || !item.name.trim()) return [];
      const appId = String(numericId);
      return [{
        id: `steam_${appId}`,
        name: item.name.trim().slice(0, 240),
        iconUrl: typeof item.tiny_image === 'string' && item.tiny_image ? item.tiny_image : undefined,
        publisher: 'Not provided by catalog search',
        marketplace: 'steam',
        description: 'Basic catalog metadata only; publisher, rating, release date, and review counts were not returned by this search endpoint.',
        category: 'Gaming',
        rating: 0,
        ratingCount: 0,
        reviewCount: 0,
        metadataStatus: 'catalog_only',
        platform: 'Not provided by catalog search',
        releaseDate: 'Not provided',
        lastUpdated: 'Not provided',
        currentVersion: 'Not provided',
        updateFrequency: 'Unknown',
        storeUrl: `https://store.steampowered.com/app/${appId}/`,
        collectionAvailable: true,
        status: 'active',
        tags: ['Steam'],
      }];
    });
  }

  async fetchReviews(appId: string, options: ReviewFetchOptions = {}): Promise<FetchReviewsResult> {
    const match = /^steam_(\d+)$/.exec(appId);
    if (!match) throw new Error('Invalid Steam application identifier');
    const rawAppId = match[1];
    const limit = Math.max(1, Math.min(100, Math.trunc(options.limit || 30)));
    const params = new URLSearchParams({
      json: '1',
      filter: 'recent',
      review_type: options.negativeOnly ? 'negative' : 'all',
      language: 'english',
      num_per_page: String(limit),
    });
    if (options.cursor) params.set('cursor', options.cursor.slice(0, 2_000));
    const response = await fetchSteam(`https://store.steampowered.com/appreviews/${rawAppId}?${params.toString()}`);
    if (!response.ok) throw new Error(`Steam reviews returned HTTP ${response.status}`);
    const data = await response.json() as {
      success?: number;
      reviews?: unknown;
      cursor?: unknown;
      query_summary?: { total_reviews?: number };
    };
    if (!data || data.success !== 1 || !Array.isArray(data.reviews)) throw new Error('Steam reviews returned an invalid response');

    const reviews: Omit<Review, 'fingerprint'>[] = data.reviews.flatMap((raw): Omit<Review, 'fingerprint'>[] => {
      if (!raw || typeof raw !== 'object') return [];
      const item = raw as Record<string, unknown>;
      if ((typeof item.recommendationid !== 'string' && typeof item.recommendationid !== 'number') || typeof item.review !== 'string' || typeof item.voted_up !== 'boolean') return [];
      const timestamp = Number(item.timestamp_created);
      if (!Number.isFinite(timestamp) || timestamp <= 0) return [];
      const text = item.review.replace(/\[\/?(b|i|u|h1|h2|h3|url|quote|code|list|\*)\]/gi, '').trim();
      if (!text) return [];
      const sourceReviewId = String(item.recommendationid);
      const positive = item.voted_up;
      return [{
        id: `steam_review_${sourceReviewId}`,
        sourceReviewId,
        appId,
        appName: `Steam App ${rawAppId}`,
        marketplace: 'steam',
        text,
        starRating: positive ? 5 : 1,
        ratingScale: 'binary_recommendation',
        reviewDate: new Date(timestamp * 1_000).toISOString(),
        language: typeof item.language === 'string' ? item.language : 'und',
        reviewUrl: `https://steamcommunity.com/app/${rawAppId}/reviews/`,
        helpfulVotes: Number.isFinite(Number(item.votes_up)) ? Math.max(0, Number(item.votes_up)) : 0,
        collectedAt: new Date().toISOString(),
        tagList: positive ? [] : ['Steam Negative Recommendation'],
      }];
    });
    const total = Number(data.query_summary?.total_reviews);
    const totalAvailable = Number.isFinite(total) ? Math.max(0, total) : reviews.length;
    const nextCursor = typeof data.cursor === 'string' && data.cursor.length <= 2_000 ? data.cursor : undefined;
    return { reviews, totalAvailable, hasMore: Boolean(nextCursor) || totalAvailable > reviews.length, nextCursor };
  }

  async getStatus() {
    const started = Date.now();
    try {
      const params = new URLSearchParams({ term: 'test', l: 'english', cc: 'US' });
      const response = await fetchSteam(`https://store.steampowered.com/api/storesearch/?${params.toString()}`);
      return {
        status: response.ok ? ('operational' as const) : response.status === 429 ? ('rate_limited' as const) : ('degraded' as const),
        latencyMs: Date.now() - started,
        message: response.ok ? 'Steam catalog search endpoint responded; review collection is implemented but has not been verified by this health probe.' : `Steam catalog returned HTTP ${response.status}.`,
        reviewCoverage: 'Recent public Steam Community reviews; collection is paginated and bounded per job.',
      };
    } catch {
      return {
        status: 'degraded' as const,
        latencyMs: Date.now() - started,
        message: 'Steam catalog connectivity could not be verified.',
        reviewCoverage: 'Review retrieval is implemented but currently unavailable.',
      };
    }
  }
}
