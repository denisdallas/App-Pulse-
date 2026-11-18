import { SEED_APPS, getSeedReviews, SEED_THEMES, getSeedOpportunities, SEED_FORECASTS } from './seedData.ts';

export function buildPublicDemoPayload() {
  const apps = SEED_APPS.map((item) => ({ ...item, tags: [...item.tags], isDemo: true, provenance: 'seed' as const }));
  const reviews = getSeedReviews().map((item) => ({ ...item, isDemo: true, provenance: 'seed' as const }));
  const themes = SEED_THEMES.map((item) => ({ ...item, isDemo: true }));
  const opportunities = getSeedOpportunities().map((item) => ({ ...item, isDemo: true }));
  const forecasts = SEED_FORECASTS.map((item) => ({ ...item }));

  return {
    mode: 'demo' as const,
    notice: 'Illustrative sample records only. These are not live marketplace results or verified current metrics.',
    stats: {
      totalApps: apps.length,
      totalReviews: reviews.length,
      negativeReviews: reviews.filter((item) => item.starRating <= 2).length,
      totalThemes: themes.length,
      totalOpportunities: opportunities.length,
    },
    apps,
    reviews: reviews.slice(0, 30),
    themes,
    opportunities,
    forecasts,
  };
}
