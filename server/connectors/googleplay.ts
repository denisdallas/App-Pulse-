import { Application, Review } from '../../src/types.ts';
import { MarketplaceConnector, SearchOptions, ReviewFetchOptions, FetchReviewsResult, UnsupportedConnectorError } from './types.ts';

/**
 * Google Play Store Connector
 * Interacts with public Google Play listings and indexed public review snapshots.
 * Adheres to platform rate limits and terms of service.
 */
export class GooglePlayConnector implements MarketplaceConnector {
  marketplace = 'googleplay' as const;
  displayName = 'Google Play Store';

  async searchApps(options: SearchOptions): Promise<Application[]> {
    throw new UnsupportedConnectorError('Google Play app search is not configured; no public connector is enabled.');
  }

  async fetchReviews(appId: string, options: ReviewFetchOptions = {}): Promise<FetchReviewsResult> {
    throw new UnsupportedConnectorError('Google Play review collection is blocked until a supported connector is configured.');
  }

  async getStatus() {
    return {
      status: 'unsupported' as const,
      latencyMs: 0,
      message: 'Unsupported: no configured Google Play review connector.',
      reviewCoverage: 'No Google Play discovery or review provider is configured; no records are collected.'
    };
  }
}
