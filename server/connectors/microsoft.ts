import { Application, Review } from '../../src/types.ts';
import { MarketplaceConnector, SearchOptions, ReviewFetchOptions, FetchReviewsResult, UnsupportedConnectorError } from './types.ts';

/**
 * Microsoft Store Connector
 * Interacts with Microsoft Store Windows Catalog and App review feeds.
 */
export class MicrosoftStoreConnector implements MarketplaceConnector {
  marketplace = 'microsoft' as const;
  displayName = 'Microsoft Store';

  async searchApps(options: SearchOptions): Promise<Application[]> {
    throw new UnsupportedConnectorError('Microsoft Store app search is not configured; no public connector is enabled.');
  }

  async fetchReviews(appId: string, options: ReviewFetchOptions = {}): Promise<FetchReviewsResult> {
    throw new UnsupportedConnectorError('Microsoft Store review collection is blocked until a supported connector is configured.');
  }

  async getStatus() {
    return {
      status: 'unsupported' as const,
      latencyMs: null,
      message: 'Unsupported: no configured Microsoft Store review connector.',
      reviewCoverage: 'No Microsoft Store discovery or review provider is configured; no records are collected.'
    };
  }
}
