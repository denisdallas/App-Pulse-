import type { Application, AppCategory } from '../../src/types.ts';
import type { MarketplaceConnector, SearchOptions, ReviewFetchOptions, FetchReviewsResult, UnsupportedConnectorError } from './types.ts';
import { UnsupportedConnectorError as ConnectorUnsupportedError } from './types.ts';

function categoryFromAppleGenre(value: unknown): AppCategory {
  if (typeof value !== 'string') return 'Other';
  const genre = value.trim().toLowerCase();
  if (genre.includes('finance')) return 'Finance';
  if (genre.includes('productivity')) return 'Productivity';
  if (genre.includes('game')) return 'Gaming';
  if (genre.includes('fitness') || genre.includes('sport')) return 'Fitness';
  if (genre.includes('medical') || genre.includes('health')) return 'Healthcare';
  if (genre.includes('education')) return 'Education';
  if (genre.includes('business')) return 'Business Software';
  if (genre.includes('developer')) return 'Developer Tools';
  if (genre.includes('shopping') || genre.includes('commerce')) return 'E-commerce';
  return 'Other';
}

export class AppleAppStoreConnector implements MarketplaceConnector {
  marketplace = 'apple' as const;
  displayName = 'Apple App Store';

  async searchApps(options: SearchOptions): Promise<Application[]> {
    const limit = Math.max(1, Math.min(50, Math.trunc(options.limit || 15)));
    const params = new URLSearchParams({ term: options.query.trim() || 'productivity', entity: 'software', limit: String(limit) });
    const response = await fetch(`https://itunes.apple.com/search?${params.toString()}`, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error(`Apple App Store search returned HTTP ${response.status}`);
    const data = await response.json() as { results?: unknown };
    if (!Array.isArray(data.results)) throw new Error('Apple App Store search returned an invalid response');

    return data.results.flatMap((raw): Application[] => {
      if (!raw || typeof raw !== 'object') return [];
      const item = raw as Record<string, unknown>;
      const trackId = Number(item.trackId);
      if (!Number.isSafeInteger(trackId) || trackId <= 0 || typeof item.trackName !== 'string' || !item.trackName.trim()) return [];
      const rating = Number(item.averageUserRating);
      const ratingCount = Number(item.userRatingCount);
      const storeUrl = typeof item.trackViewUrl === 'string' ? item.trackViewUrl : `https://apps.apple.com/app/id${trackId}`;

      return [{
        id: `apple_${trackId}`,
        name: item.trackName.trim().slice(0, 240),
        iconUrl: typeof item.artworkUrl100 === 'string' ? item.artworkUrl100 : undefined,
        publisher: typeof item.sellerName === 'string' ? item.sellerName : typeof item.artistName === 'string' ? item.artistName : 'Not provided by catalog',
        marketplace: 'apple',
        description: typeof item.description === 'string' ? item.description.slice(0, 5000) : 'Public Apple App Store catalog metadata only.',
        category: categoryFromAppleGenre(item.primaryGenreName),
        rating: Number.isFinite(rating) ? Math.max(0, Math.min(5, rating)) : 0,
        ratingCount: Number.isFinite(ratingCount) ? Math.max(0, Math.trunc(ratingCount)) : 0,
        reviewCount: 0,
        metadataStatus: 'catalog_only',
        platform: 'iOS',
        releaseDate: typeof item.releaseDate === 'string' ? item.releaseDate : 'Not provided',
        lastUpdated: typeof item.currentVersionReleaseDate === 'string' ? item.currentVersionReleaseDate : 'Not provided',
        currentVersion: typeof item.version === 'string' ? item.version : 'Not provided',
        updateFrequency: 'Unknown',
        storeUrl,
        collectionAvailable: false,
        status: 'active',
        tags: ['Apple App Store'],
      }];
    });
  }

  async fetchReviews(_appId: string, _options?: ReviewFetchOptions): Promise<FetchReviewsResult> {
    throw new ConnectorUnsupportedError('Apple App Store review text is not available through the public catalog endpoint; no supported review provider is configured.');
  }

  async getStatus() {
    const started = Date.now();
    try {
      const params = new URLSearchParams({ term: 'productivity', entity: 'software', limit: '1' });
      const response = await fetch(`https://itunes.apple.com/search?${params.toString()}`, { signal: AbortSignal.timeout(8_000) });
      return {
        status: response.ok ? ('partially_supported' as const) : response.status === 429 ? ('rate_limited' as const) : ('degraded' as const),
        latencyMs: Date.now() - started,
        message: response.ok ? 'Public App Store catalog search responded; review retrieval is not available through this endpoint.' : `Catalog search returned HTTP ${response.status}.`,
        reviewCoverage: 'Catalog discovery only; no public review-text feed is configured.',
      };
    } catch {
      return { status: 'degraded' as const, latencyMs: Date.now() - started, message: 'Apple App Store catalog connectivity could not be verified.', reviewCoverage: 'Review retrieval is unsupported.' };
    }
  }
}
