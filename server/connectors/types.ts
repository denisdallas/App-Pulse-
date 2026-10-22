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
    status: 'operational' | 'rate_limited' | 'degraded';
    latencyMs: number;
    message: string;
    reviewCoverage: string;
  }>;
}
