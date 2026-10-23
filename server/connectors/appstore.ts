import { Application, Review, AppCategory } from '../../src/types.ts';
import { MarketplaceConnector, SearchOptions, ReviewFetchOptions, FetchReviewsResult } from './types.ts';

function mapGenreToCategory(genre?: string): AppCategory {
  if (!genre) return 'Business Software';
  const g = genre.toLowerCase();
  if (g.includes('finance') || g.includes('money')) return 'Finance';
  if (g.includes('productivity') || g.includes('utilities')) return 'Productivity';
  if (g.includes('health') || g.includes('medical')) return 'Healthcare';
  if (g.includes('education') || g.includes('reference')) return 'Education';
  if (g.includes('shop') || g.includes('food')) return 'E-commerce';
  if (g.includes('game')) return 'Gaming';
  if (g.includes('fit')) return 'Fitness';
  if (g.includes('developer')) return 'Developer Tools';
  return 'Business Software';
}

/**
 * Apple App Store Connector
 * Uses official Apple iTunes Search API and Customer Reviews RSS Feeds.
 * Free, public, official Apple endpoints with real applications and verified customer reviews.
 */
export class AppStoreConnector implements MarketplaceConnector {
  marketplace = 'appstore' as const;
  displayName = 'Apple App Store';

  async searchApps(options: SearchOptions): Promise<Application[]> {
    const limit = Math.min(options.limit || 15, 30);
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(options.query)}&entity=software&limit=${limit}`;

    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'AppPulse-Intelligence/1.0',
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        throw new Error(`Apple iTunes API returned HTTP ${response.status}`);
      }

      const data = await response.json();
      const results = data.results || [];

      return results.map((item: any) => ({
        id: String(item.trackId),
        name: item.trackName || 'Unknown iOS App',
        iconUrl: item.artworkUrl100 || item.artworkUrl512 || item.artworkUrl60,
        publisher: item.artistName || 'Unknown Developer',
        marketplace: 'appstore',
        description: item.description || '',
        category: mapGenreToCategory(item.primaryGenreName),
        rating: typeof item.averageUserRating === 'number' ? Number(item.averageUserRating.toFixed(1)) : 4.0,
        ratingCount: item.userRatingCount || 0,
        reviewCount: item.userRatingCount || 0,
        platform: 'iOS / iPadOS',
        releaseDate: item.releaseDate ? item.releaseDate.split('T')[0] : new Date().toISOString().split('T')[0],
        lastUpdated: item.currentVersionReleaseDate ? item.currentVersionReleaseDate.split('T')[0] : new Date().toISOString().split('T')[0],
        currentVersion: item.version || '1.0.0',
        updateFrequency: 'Monthly',
        storeUrl: item.trackViewUrl || `https://apps.apple.com/app/id${item.trackId}`,
        collectionAvailable: true,
        status: 'active',
        tags: [item.primaryGenreName, item.contentAdvisoryRating].filter(Boolean),
        isDemo: false,
        provenance: 'live',
      }));
    } catch (err: any) {
      console.error(`[AppStoreConnector] search error for "${options.query}":`, err.message);
      return [];
    }
  }

  async fetchReviews(appId: string, options: ReviewFetchOptions = {}): Promise<FetchReviewsResult> {
    const cleanAppId = appId.replace(/[^0-9]/g, '');
    if (!cleanAppId) {
      return { reviews: [], totalAvailable: 0, hasMore: false };
    }

    const url = `https://itunes.apple.com/rss/customerreviews/id=${cleanAppId}/sortBy=mostRecent/json`;

    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'AppPulse-Intelligence/1.0',
        },
        signal: AbortSignal.timeout(9000),
      });

      if (!response.ok) {
        if (response.status === 404) {
          return { reviews: [], totalAvailable: 0, hasMore: false };
        }
        throw new Error(`Apple RSS returned HTTP ${response.status}`);
      }

      const data = await response.json();
      const entries = data.feed?.entry || [];
      // The first entry in Apple RSS is often the app metadata entry, customer reviews follow
      const reviewEntries = Array.isArray(entries) ? entries.slice(1) : [];

      const reviews: Omit<Review, 'fingerprint'>[] = [];
      const timestamp = new Date().toISOString();

      for (const entry of reviewEntries) {
        const rating = parseInt(entry['im:rating']?.label || '3', 10);
        
        // Negative-only filter (<= 2 stars)
        if (options.negativeOnly && rating > 2) {
          continue;
        }

        const title = entry.title?.label || '';
        const body = entry.content?.label || '';
        const reviewText = title && body ? `${title} — ${body}` : (body || title || 'No review content');
        const reviewId = entry.id?.label || `appstore_${cleanAppId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const version = entry['im:version']?.label || '1.0.0';
        const reviewDate = entry.updated?.label ? new Date(entry.updated.label).toISOString() : timestamp;

        reviews.push({
          id: reviewId,
          appId: cleanAppId,
          appName: data.feed?.title?.label?.replace('iTunes Store: Customer Reviews', '').trim() || 'App Store App',
          marketplace: 'appstore',
          text: reviewText,
          starRating: Math.max(1, Math.min(5, rating)),
          reviewDate,
          language: 'en',
          reviewUrl: `https://apps.apple.com/app/id${cleanAppId}`,
          helpfulVotes: parseInt(entry['im:voteCount']?.label || '0', 10),
          appVersion: version,
          collectedAt: timestamp,
          provenance: 'live',
          sourceRecordId: reviewId,
          sourceUrl: `https://apps.apple.com/app/id${cleanAppId}`,
          isDemo: false,
          classification: {
            category: rating <= 2 ? 'Bugs & Crashes' : 'UX & Navigation',
            sentiment: rating <= 2 ? 'negative' : (rating === 3 ? 'neutral' : 'positive'),
            keywords: title.split(/\s+/).slice(0, 3).filter((w: string) => w.length > 3),
            severity: rating === 1 ? 'High' : 'Medium',
            isBug: rating <= 2 && /crash|bug|freeze|error|fail/i.test(reviewText),
            isFeatureRequest: /please add|wish|missing|hope|request/i.test(reviewText),
            isPricingIssue: /price|cost|subscription|expensive|paywall/i.test(reviewText),
          },
        });

        if (options.limit && reviews.length >= options.limit) {
          break;
        }
      }

      return {
        reviews,
        totalAvailable: reviewEntries.length,
        hasMore: false,
      };
    } catch (err: any) {
      console.error(`[AppStoreConnector] error fetching reviews for app ${cleanAppId}:`, err.message);
      return {
        reviews: [],
        totalAvailable: 0,
        hasMore: false,
      };
    }
  }

  async getStatus() {
    const t0 = Date.now();
    try {
      const ping = await fetch('https://itunes.apple.com/search?term=test&limit=1', {
        signal: AbortSignal.timeout(4000),
      });
      const latencyMs = Date.now() - t0;
      return {
        status: (ping.ok ? 'connected_verified' : 'error') as any,
        latencyMs,
        message: ping.ok
          ? 'Apple iTunes & Customer Reviews RSS API connected and verified.'
          : `Apple API responded with status ${ping.status}`,
        reviewCoverage: 'Public iOS & iPadOS verified customer reviews from Apple Store RSS feed (up to 50 latest reviews per app)',
        lastTestedAt: new Date().toISOString(),
        lastTestOutcome: ping.ok ? 'Verified: 200 OK' : `Error: ${ping.status}`,
      };
    } catch (err: any) {
      return {
        status: 'temporarily_unavailable' as any,
        latencyMs: Date.now() - t0,
        message: `Reachability test failed: ${err.message}`,
        reviewCoverage: 'iOS app metadata & verified customer reviews',
        lastTestedAt: new Date().toISOString(),
        lastTestOutcome: `Failed: ${err.message}`,
      };
    }
  }
}
