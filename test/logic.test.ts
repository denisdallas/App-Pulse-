import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateOpportunityScore } from '../src/lib/scoring.ts';
import { generateReviewFingerprint, deduplicateReviews } from '../src/lib/dedup.ts';
import { isEmailSuppressed, filterSuppressedRecipients } from '../src/lib/suppression.ts';
import { jsonToCsv, parseCsv } from '../src/lib/csv.ts';
import { compareVersions, isVersionInRange, calculateFutureOpportunityScore } from '../src/lib/forecast.ts';
import { Review, SuppressionRecord } from '../src/types.ts';
import { GooglePlayConnector } from '../server/connectors/googleplay.ts';
import { UnsupportedConnectorError } from '../server/connectors/types.ts';

test('unsupported marketplace connectors report an explicit unsupported error', async () => {
  const connector = new GooglePlayConnector();
  await assert.rejects(() => connector.fetchReviews('demo-app'), (error: unknown) => {
    assert.ok(error instanceof UnsupportedConnectorError);
    assert.match((error as Error).message, /blocked|configured/i);
    return true;
  });
  assert.equal((await connector.getStatus()).status, 'unsupported');
});

test('calculateOpportunityScore correctly calculates priority and breakdown', () => {
  const resultHigh = calculateOpportunityScore({
    severity: 'Critical',
    complaintFrequency: 25,
    latestReviewDate: new Date().toISOString(),
    affectedAppCount: 3,
  });

  assert.equal(resultHigh.breakdown.severityScore, 100);
  assert.ok(resultHigh.breakdown.frequencyScore >= 80);
  assert.equal(resultHigh.breakdown.recencyScore, 100);
  assert.equal(resultHigh.breakdown.breadthScore, 84); // 3 * 28
  assert.ok(resultHigh.score >= 80, `Expected score >= 80, got ${resultHigh.score}`);

  const resultLow = calculateOpportunityScore({
    severity: 'Low',
    complaintFrequency: 1,
    latestReviewDate: '2025-01-01',
    affectedAppCount: 1,
  });

  assert.equal(resultLow.breakdown.severityScore, 25);
  assert.ok(resultLow.score < 50, `Expected score < 50, got ${resultLow.score}`);
});

test('deduplicateReviews identifies duplicate review IDs and content fingerprints', () => {
  const existingReviews: Review[] = [
    {
      id: 'rev_1',
      appId: 'steam_730',
      appName: 'CS2',
      marketplace: 'steam',
      text: 'Game crashes constantly after update!',
      starRating: 1,
      reviewDate: '2026-03-01T10:00:00Z',
      language: 'en',
      collectedAt: '2026-03-01T12:00:00Z',
      fingerprint: generateReviewFingerprint('steam_730', 'Game crashes constantly after update!', 1, '2026-03-01T10:00:00Z'),
    },
  ];

  const incoming = [
    // Duplicate ID
    {
      id: 'rev_1',
      appId: 'steam_730',
      appName: 'CS2',
      marketplace: 'steam' as const,
      text: 'Game crashes constantly after update!',
      starRating: 1,
      reviewDate: '2026-03-01T10:00:00Z',
      language: 'en',
      collectedAt: '2026-03-02T12:00:00Z',
    },
    // Duplicate content with different ID
    {
      id: 'rev_diff_id',
      appId: 'steam_730',
      appName: 'CS2',
      marketplace: 'steam' as const,
      text: 'Game crashes constantly after update!',
      starRating: 1,
      reviewDate: '2026-03-01T10:00:00Z',
      language: 'en',
      collectedAt: '2026-03-02T12:00:00Z',
    },
    // Brand new unique review
    {
      id: 'rev_2',
      appId: 'steam_730',
      appName: 'CS2',
      marketplace: 'steam' as const,
      text: 'Missing custom workshop maps and server browser is broken.',
      starRating: 2,
      reviewDate: '2026-03-02T11:00:00Z',
      language: 'en',
      collectedAt: '2026-03-02T12:00:00Z',
    },
  ];

  const { uniqueReviews, duplicatesCount } = deduplicateReviews(incoming, existingReviews);

  assert.equal(duplicatesCount, 2, 'Should detect exactly 2 duplicate reviews');
  assert.equal(uniqueReviews.length, 1, 'Should keep only 1 new unique review');
  assert.equal(uniqueReviews[0].id, 'rev_2');
  assert.ok(uniqueReviews[0].fingerprint.startsWith('fp_'));
});

test('isEmailSuppressed correctly handles exact emails and domain wildcards', () => {
  const suppressionList: SuppressionRecord[] = [
    {
      id: 'sup_1',
      emailOrDomain: 'blocked@competitor.com',
      reason: 'opt_out',
      createdAt: '2026-01-01',
    },
    {
      id: 'sup_2',
      emailOrDomain: 'spamdom.io',
      reason: 'unsubscribed',
      createdAt: '2026-01-01',
    },
  ];

  assert.equal(isEmailSuppressed('blocked@competitor.com', suppressionList).suppressed, true);
  assert.equal(isEmailSuppressed('BLOCKED@COMPETITOR.COM', suppressionList).suppressed, true);
  assert.equal(isEmailSuppressed('ceo@spamdom.io', suppressionList).suppressed, true);
  assert.equal(isEmailSuppressed('founder@validcompany.com', suppressionList).suppressed, false);

  const recipients = [
    { email: 'founder@validcompany.com', name: 'Alice' },
    { email: 'blocked@competitor.com', name: 'Bob' },
    { email: 'support@spamdom.io', name: 'Charlie' },
  ];

  const result = filterSuppressedRecipients(recipients, suppressionList);
  assert.equal(result.allowed.length, 1);
  assert.equal(result.allowed[0].email, 'founder@validcompany.com');
  assert.equal(result.blocked.length, 2);
});

test('jsonToCsv and parseCsv handle escaping, quotes and commas correctly', () => {
  const items = [
    { name: 'App Pulse, Inc.', category: 'SaaS "Intelligence"', rating: 4.5 },
    { name: 'Simple App', category: 'Productivity', rating: 3.2 },
  ];

  const columns: { key: keyof typeof items[0]; header: string }[] = [
    { key: 'name', header: 'Application Name' },
    { key: 'category', header: 'Industry Category' },
    { key: 'rating', header: 'Star Rating' },
  ];

  const csv = jsonToCsv(items, columns);
  assert.ok(csv.includes('"App Pulse, Inc."'));
  assert.ok(csv.includes('"SaaS ""Intelligence"""'));

  const parsed = parseCsv(csv);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0]['Application Name'], 'App Pulse, Inc.');
  assert.equal(parsed[0]['Industry Category'], 'SaaS "Intelligence"');
  assert.equal(parsed[1]['Star Rating'], '3.2');
});

test('compareVersions and isVersionInRange evaluate application versions correctly', () => {
  assert.ok(compareVersions('9.4.1', '9.3.0') > 0);
  assert.ok(compareVersions('2.0.0', '2.0.0') === 0);
  assert.ok(compareVersions('1.15.0', '2.1.0') < 0);
  assert.ok(compareVersions('10.2.0', '9.8.5') > 0);

  // Range checks
  assert.equal(isVersionInRange('9.4.1', '9.0.0', '10.0.0'), true);
  assert.equal(isVersionInRange('8.9.0', '9.0.0', '10.0.0'), false);
  assert.equal(isVersionInRange('10.5.0', '9.0.0', '10.0.0'), false);
  assert.equal(isVersionInRange('3.5.0', '3.0.0'), true);
  assert.equal(isVersionInRange('2.5.0', '3.0.0'), false);
});

test('calculateFutureOpportunityScore calculates weighted forecast scores', () => {
  const highRiskForecast = calculateFutureOpportunityScore({
    trendVelocity: 'Accelerating',
    severity: 'Critical',
    updateFrequency: 'Stale',
    affectedCompetitorCount: 2,
  
  });

  assert.equal(highRiskForecast.scoreBreakdown.trendVelocityScore, 100);
  assert.equal(highRiskForecast.scoreBreakdown.severityImpactScore, 100);
  assert.equal(highRiskForecast.scoreBreakdown.incumbentInertiaScore, 100);
  assert.ok(highRiskForecast.futureOpportunityScore >= 90);

  const lowRiskForecast = calculateFutureOpportunityScore({
    trendVelocity: 'Decelerating',
    severity: 'Low',
    updateFrequency: 'Daily',
    affectedCompetitorCount: 1,
  
  });

  assert.ok(lowRiskForecast.futureOpportunityScore < 45);
});

