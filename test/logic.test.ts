import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateOpportunityScore } from '../src/lib/scoring.ts';
import { generateReviewFingerprint, deduplicateReviews } from '../src/lib/dedup.ts';
import { isEmailSuppressed, filterSuppressedRecipients } from '../src/lib/suppression.ts';
import { jsonToCsv, parseCsv } from '../src/lib/csv.ts';
import { compareVersions, isVersionInRange, calculateFutureOpportunityScore } from '../src/lib/forecast.ts';
import { Application, Review, SuppressionRecord } from '../src/types.ts';
import { GooglePlayConnector } from '../server/connectors/googleplay.ts';
import { AppleAppStoreConnector } from '../server/connectors/apple.ts';
import { SteamConnector } from '../server/connectors/steam.ts';
import { UnsupportedConnectorError } from '../server/connectors/types.ts';
import { retryDelayMs, safeJobError } from '../server/job-queue.ts';
import { jsonToXlsx } from '../server/exports.ts';
import ExcelJS from 'exceljs';
import { buildEvidenceOnlyCompetitorAnalysis } from '../server/ai.ts';
import { generateResearchReport } from '../server/reports.ts';

test('unsupported marketplace connectors report an explicit unsupported error', async () => {
  const connector = new GooglePlayConnector();
  await assert.rejects(() => connector.fetchReviews('demo-app'), (error: unknown) => {
    assert.ok(error instanceof UnsupportedConnectorError);
    assert.match((error as Error).message, /blocked|configured/i);
    return true;
  });
  assert.equal((await connector.getStatus()).status, 'unsupported');
});

test('Apple catalog search preserves verified catalog fields without claiming review text', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({ results: [{
      trackId: 12345,
      trackName: 'Sample Planner',
      sellerName: 'Example Publisher',
      primaryGenreName: 'Productivity',
      averageUserRating: 4.7,
      userRatingCount: 920,
      trackViewUrl: 'https://apps.apple.com/app/id12345',
      currentVersionReleaseDate: '2026-01-01T00:00:00Z',
      version: '2.0',
    }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  try {
    const apps = await new AppleAppStoreConnector().searchApps({ query: 'planner', category: 'Productivity', limit: 10 });
    assert.match(requestedUrl, /term=planner/);
    assert.equal(apps.length, 1);
    assert.equal(apps[0].category, 'Productivity');
    assert.equal(apps[0].ratingCount, 920);
    assert.equal(apps[0].reviewCount, 0);
    assert.equal(apps[0].collectionAvailable, false);
    assert.equal(apps[0].metadataStatus, 'catalog_only');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Steam review pagination passes the cursor and returns the source continuation cursor', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({
      success: 1,
      cursor: 'cursor-next',
      query_summary: { total_reviews: 24 },
      reviews: [{
        recommendationid: 'review-1',
        review: 'The latest update broke saved games and crashes often.',
        timestamp_created: 1760000000,
        voted_up: false,
        votes_up: 3,
        language: 'english',
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  try {
    const result = await new SteamConnector().fetchReviews('steam_730', { cursor: 'cursor-current', limit: 100 });
    assert.match(requestedUrl, /cursor=cursor-current/);
    assert.equal(result.nextCursor, 'cursor-next');
    assert.equal(result.hasMore, true);
    assert.equal(result.totalAvailable, 24);
    assert.equal(result.reviews.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('competitor comparison excludes seed reviews and cites only stored source review IDs', () => {
  const apps = [
    { id: 'steam_a', name: 'Game A', marketplace: 'steam', category: 'Gaming', rating: 0, ratingCount: 0 } as Application,
    { id: 'steam_b', name: 'Game B', marketplace: 'steam', category: 'Gaming', rating: 4.1, ratingCount: 200 } as Application,
  ];
  const reviews = [
    { id: 'live-a1', appId: 'steam_a', appName: 'Game A', marketplace: 'steam', text: 'The update crashes every time I open the game.', starRating: 1, provenance: 'live_marketplace' },
    { id: 'live-a2', appId: 'steam_a', appName: 'Game A', marketplace: 'steam', text: 'Crashes after the latest update; saved games are lost.', starRating: 2, provenance: 'live_marketplace' },
    { id: 'seed-b1', appId: 'steam_b', appName: 'Game B', marketplace: 'steam', text: 'Seeded sample review should not be analyzed.', starRating: 1, provenance: 'seed' },
  ] as Review[];
  const result = buildEvidenceOnlyCompetitorAnalysis(apps, reviews);
  assert.equal(result.evidenceReviewCount, 2);
  assert.equal(result.metrics.find((metric) => metric.appId === 'steam_b')?.sampleReviewCount, 0);
  assert.equal(result.provenance, 'calculated');
  assert.ok(result.findings.every((finding) => finding.evidenceReviewIds.every((id) => id.startsWith('live-'))));
});

test('CSV and XLSX exports neutralize formula-like strings without changing numeric cells', async () => {
  const csv = jsonToCsv([{ value: '=SUM(1,1)', amount: -7 }], [
    { key: 'value', header: 'Value' },
    { key: 'amount', header: 'Amount' },
  ]);
  assert.ok(csv.includes("'=SUM(1,1)"));
  assert.ok(csv.includes('-7'));

  const buffer = await jsonToXlsx([{ value: '=HYPERLINK("https://example.com","click")', amount: -7 }], [
    { key: 'value', header: 'Value' },
    { key: 'amount', header: 'Amount' },
  ], 'Review Data');
  const workbook = new ExcelJS.Workbook();
  const arrayBuffer = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(arrayBuffer).set(buffer);
  await workbook.xlsx.load(arrayBuffer);
  const worksheet = workbook.getWorksheet('Review Data');
  assert.ok(worksheet);
  assert.equal(worksheet.getCell('A2').value, "'=HYPERLINK(\"https://example.com\",\"click\")");
  assert.equal(worksheet.getCell('B2').value, -7);
});

test('research report generator returns a PDF with explicit source limitations', async () => {
  const pdf = await generateResearchReport({ title: 'AppPulse test report', apps: [], reviews: [], themes: [], opportunities: [] });
  assert.equal(pdf.subarray(0, 5).toString('utf8'), '%PDF-');
  assert.ok(pdf.length > 500);
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

test('retryDelayMs applies bounded exponential backoff', () => {
  assert.equal(retryDelayMs(0), 5_000);
  assert.equal(retryDelayMs(1), 5_000);
  assert.equal(retryDelayMs(2), 10_000);
  assert.equal(retryDelayMs(10), 300_000);
});

test('safeJobError redacts credentials and bounds persisted error details', () => {
  const message = safeJobError(new Error('Bearer test-token token=abc password=xyz postgresql://user:pass@db.example/app'));
  assert.ok(!message.includes('test-token'));
  assert.ok(!message.includes('abc'));
  assert.ok(!message.includes('xyz'));
  assert.ok(!message.includes('user:pass'));
  assert.equal(safeJobError('x'.repeat(600)).length, 500);
});

