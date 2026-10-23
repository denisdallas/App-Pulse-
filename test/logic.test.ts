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
    estimatedChurnRiskPct: 35,
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
    estimatedChurnRiskPct: 10,
  });

  assert.ok(lowRiskForecast.futureOpportunityScore < 45);
});

test('escapeSpreadsheetValue prevents formula and command injection', async () => {
  const { escapeSpreadsheetValue } = await import('../server/reports/generator.ts');
  assert.equal(escapeSpreadsheetValue('=cmd|"/c calc"!A0'), '\'=cmd|"/c calc"!A0');
  assert.equal(escapeSpreadsheetValue('+SUM(A1:A10)'), '\'+SUM(A1:A10)');
  assert.equal(escapeSpreadsheetValue('-10% discount'), '\'-10% discount');
  assert.equal(escapeSpreadsheetValue('@username'), '\'@username');
  assert.equal(escapeSpreadsheetValue('Safe Application Name'), 'Safe Application Name');
  assert.equal(escapeSpreadsheetValue(42), '42');
});

test('Zero synthetic reviews rule: empty connector result yields 0 saved reviews', async () => {
  const { repository } = await import('../server/db/repository.ts');
  const wsId = 'ws_test_empty';

  // Simulating collection outcome when connector returns 0 reviews
  const incoming: any[] = [];
  const { inserted, duplicates } = await repository.saveReviews(wsId, incoming);

  assert.equal(inserted, 0, 'Must insert 0 reviews when connector returns 0');
  assert.equal(duplicates, 0, 'Must record 0 duplicates');

  const reviews = await repository.getReviews(wsId);
  assert.equal(reviews.length, 0, 'Workspace reviews array must remain empty without synthetic fallbacks');
});

test('Database migrations and relational persistence survive transactions', async () => {
  const { runMigrations } = await import('../server/db/migrations.ts');
  const { db } = await import('../server/db/database.ts');
  const { repository } = await import('../server/db/repository.ts');

  await runMigrations();
  assert.ok(db.getEngineName().includes('Relational') || db.getEngineName() === 'PostgreSQL');

  const ws = await repository.getWorkspaceById('ws_default');
  assert.ok(ws !== null, 'Default workspace must exist');
  assert.equal(ws.id, 'ws_default');

  const stats = await repository.getStats('ws_default');
  assert.ok(stats.totalApps >= 1, 'Seeded apps must be queryable');
  assert.ok(stats.totalReviews >= 1, 'Seeded reviews must be queryable');
});

test('Outreach email dispatch correctly blocks simulated delivery when unconfigured', async () => {
  const { getEmailProviderConfig, sendOutreachEmail } = await import('../server/outreach/delivery.ts');
  
  // In default testing environment without SMTP credentials
  const config = getEmailProviderConfig();
  if (!config.isReady) {
    const outcome = await sendOutreachEmail({
      recipient: {
        contactId: 'cnt_test',
        email: 'test@example.com',
        company: 'Test Corp',
        appName: 'Test App',
        personalizedSubject: 'Subject',
        personalizedBody: 'Body',
        status: 'pending',
      },
      subject: 'Subject',
      body: 'Body',
    });

    assert.equal(outcome.success, false, 'Dispatch must fail when provider is unconfigured');
    assert.ok(outcome.error?.includes('Simulated delivery is strictly forbidden'), 'Error must cite no simulated delivery rule');
  }
});


