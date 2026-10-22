import { Review } from '../types.ts';

/**
 * Creates a normalized fingerprint string from text and rating.
 */
export function generateReviewFingerprint(appId: string, text: string, starRating: number, reviewDate: string): string {
  const normalizedText = text
    .toLowerCase()
    .replace(/[^\w\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
  
  // Simple deterministic hash
  let hash = 0;
  const str = `${appId}:${starRating}:${reviewDate.slice(0, 10)}:${normalizedText}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return `fp_${Math.abs(hash).toString(36)}`;
}

/**
 * Deduplicates an incoming array of reviews against existing reviews.
 * Returns both the unique new reviews and the number of discarded duplicates.
 */
export function deduplicateReviews(
  incoming: Omit<Review, 'fingerprint'>[],
  existing: Review[]
): { uniqueReviews: Review[]; duplicatesCount: number } {
  const existingIdSet = new Set(existing.map((r) => r.id));
  const existingFingerprints = new Set(existing.map((r) => r.fingerprint));

  const uniqueReviews: Review[] = [];
  let duplicatesCount = 0;

  for (const raw of incoming) {
    const fingerprint = generateReviewFingerprint(
      raw.appId,
      raw.text,
      raw.starRating,
      raw.reviewDate
    );

    if (existingIdSet.has(raw.id) || existingFingerprints.has(fingerprint)) {
      duplicatesCount++;
      continue;
    }

    const review: Review = {
      ...raw,
      fingerprint,
    };

    existingIdSet.add(review.id);
    existingFingerprints.add(fingerprint);
    uniqueReviews.push(review);
  }

  return { uniqueReviews, duplicatesCount };
}
