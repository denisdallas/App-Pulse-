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
  error?: string;
}

export type ConnectorStatus = 
  | 'not_configured'
  | 'not_implemented'
  | 'testing'
  | 'connected_verified'
  | 'rate_limited'
  | 'temporarily_unavailable'
  | 'error';

export interface ConnectorHealth {
  status: ConnectorStatus;
  latencyMs: number;
  message: string;
  reviewCoverage: string;
  lastTestedAt?: string;
  lastTestOutcome?: string;
  requiredCredentials?: string[];
  hasCredentials?: boolean;
}

export interface MarketplaceConnector {
  marketplace: Marketplace;
  displayName: string;
  searchApps(options: SearchOptions): Promise<Application[]>;
  fetchReviews(appId: string, options?: ReviewFetchOptions): Promise<FetchReviewsResult>;
  getStatus(): Promise<ConnectorHealth>;
}
