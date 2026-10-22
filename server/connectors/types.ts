import { Application, Review, Marketplace } from '../../src/types.ts';

export interface SearchOptions {
  query: string;
  category?: string;
  limit?: number;
}

export interface ReviewFetchOptions {
  negativeOnly?: boolean;
  limit?: number;
  cursor?: string;
}

export class UnsupportedConnectorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedConnectorError';
  }
}

export interface FetchReviewsResult {
  reviews: Omit<Review, 'fingerprint'>[];
  totalAvailable?: number;
  hasMore?: boolean;
  nextCursor?: string;
}

export interface MarketplaceConnector {
  marketplace: Marketplace;
  displayName: string;
  searchApps(options: SearchOptions): Promise<Application[]>;
  fetchReviews(appId: string, options?: ReviewFetchOptions): Promise<FetchReviewsResult>;
  getStatus(): Promise<{
    status: 'operational' | 'rate_limited' | 'degraded' | 'unsupported' | 'blocked' | 'partially_supported';
    latencyMs: number;
    message: string;
    reviewCoverage: string;
  }>;
}
