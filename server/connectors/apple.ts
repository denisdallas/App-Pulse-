import { Application, Review } from '../../src/types.ts';
import { MarketplaceConnector, SearchOptions, ReviewFetchOptions, FetchReviewsResult, UnsupportedConnectorError } from './types.ts';

export class AppleAppStoreConnector implements MarketplaceConnector {
  marketplace = 'apple' as const;
  displayName = 'Apple App Store';

  async searchApps(options: SearchOptions): Promise<Application[]> {
    const term = encodeURIComponent(options.query || 'productivity');
    const response = await fetch(`https://itunes.apple.com/search?term=${term}&entity=software&limit=${options.limit || 15}`);
    if (!response.ok) throw new Error(`Apple App Store search returned HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.results)) return [];
    return data.results.map((item: any) => ({
      id: `apple_${item.trackId}`,
      name: item.trackName || 'Unnamed application',
      iconUrl: item.artworkUrl100,
      publisher: item.sellerName || item.artistName || 'Unknown publisher',
      marketplace: 'apple',
      description: item.description || 'Apple App Store application metadata.',
      category: 'Business Software',
      rating: Number(item.averageUserRating || 0),
      ratingCount: Number(item.userRatingCount || 0),
      reviewCount: Number(item.userRatingCount || 0),
      platform: 'iOS',
      releaseDate: item.releaseDate || '',
      lastUpdated: item.currentVersionReleaseDate || '',
      currentVersion: item.version || '',
      updateFrequency: 'Monthly',
      storeUrl: item.trackViewUrl || `https://apps.apple.com/app/id${item.trackId}`,
      collectionAvailable: false,
      status: 'active',
      tags: ['Apple App Store'],
    }));
  }

  async fetchReviews(_appId: string, _options?: ReviewFetchOptions): Promise<FetchReviewsResult> {
    throw new UnsupportedConnectorError('Apple App Store review retrieval requires an authorized/provider-supported source; public catalog search does not expose unrestricted reviews.');
  }

  async getStatus() {
    const started = Date.now();
    try {
      const response = await fetch('https://itunes.apple.com/search?term=productivity&entity=software&limit=1');
      return {
        status: response.ok ? ('partially_supported' as const) : ('degraded' as const),
        latencyMs: Date.now() - started,
        message: response.ok ? 'Public catalog discovery verified; review retrieval is permission-limited.' : `HTTP ${response.status}`,
        reviewCoverage: 'Catalog metadata only; public review retrieval is not available through this endpoint',
      };
    } catch (error: any) {
      return { status: 'degraded' as const, latencyMs: Date.now() - started, message: error.message || 'Connection failed', reviewCoverage: 'Unavailable' };
    }
  }
}
