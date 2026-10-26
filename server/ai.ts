import crypto from 'node:crypto';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import type {
  Application,
  ComplaintTheme,
  Contact,
  CompetitorAnalysisFinding,
  CompetitorAnalysisMetric,
  CompetitorAnalysisResult,
  Opportunity,
  PredictedWeakness,
  Review,
} from '../src/types.ts';
import { calculateOpportunityScore } from '../src/lib/scoring.ts';
import { calculateFutureOpportunityScore } from '../src/lib/forecast.ts';

export const AI_MODEL_ID = 'google/gemini-4-argon';

const complaintCategories = [
  'Bugs & Crashes', 'Missing Features', 'UX & Navigation', 'Pricing & Subscriptions',
  'Billing & Payments', 'Performance & Reliability', 'Customer Support', 'Privacy & Security',
  'Compatibility', 'Advertising & Monetization', 'Feature Requests', 'Other',
] as const;
const severityLevels = ['Critical', 'High', 'Medium', 'Low'] as const;

export function isAIProviderConfigured(): boolean {
  return process.env.VERCEL === '1' || Boolean(
    process.env.V0_RUNTIME_URL || process.env.V0_BUILD_URL || process.env.V0_SANDBOX_URL,
  );
}

const themeCandidateSchema = z.object({
  title: z.string().min(1).max(180),
  category: z.enum(complaintCategories),
  summary: z.string().min(1).max(1_200),
  severity: z.enum(severityLevels),
  confidenceScore: z.number().min(0).max(1),
  evidence: z.array(z.object({
    reviewId: z.string().min(1).max(240),
    quote: z.string().min(12).max(800),
  })).max(8),
  potentialImprovement: z.string().max(600),
  validationHypothesis: z.string().max(600),
  validationSteps: z.array(z.string().min(1).max(500)).max(8),
  trend: z.enum(['emerging', 'stable', 'decreasing']),
});

export async function analyzeComplaintsWithAI(
  reviews: Review[],
  affectedApps: Application[],
): Promise<ComplaintTheme[]> {
  const negativeReviews = reviews.filter((review) => review.starRating <= 2 && review.text.trim().length >= 12);
  if (!negativeReviews.length) return [];

  if (isAIProviderConfigured()) {
    try {
      const result = await generateText({
        model: AI_MODEL_ID,
        output: Output.array({ element: themeCandidateSchema, minItems: 0, maxItems: 6 }),
        system: [
          'You are a product research analyst. Analyze only the supplied non-seed marketplace review records.',
          'Return recurring complaint hypotheses, not market-wide prevalence claims or verified causes.',
          'Each theme must cite at least two distinct review IDs and exact contiguous quotes copied from those reviews.',
          'If evidence is insufficient, return an empty array. Never invent a review, application, metric, or quote.',
        ].join(' '),
        prompt: JSON.stringify({
          applications: affectedApps.map((app) => ({ id: app.id, name: app.name, category: app.category })),
          negativeReviews: negativeReviews.slice(0, 40).map((review) => ({
            reviewId: review.id,
            appId: review.appId,
            appName: review.appName,
            rating: review.starRating,
            date: review.reviewDate,
            text: review.text.slice(0, 800),
          })),
        }),
        temperature: 0.2,
        maxOutputTokens: 4_000,
        abortSignal: AbortSignal.timeout(30_000),
      });

      const parsed = result.output ?? [];
      const reviewById = new Map(negativeReviews.map((review) => [review.id, review]));
      const grounded = parsed.flatMap((candidate, index) => {
        const citedReviews = candidate.evidence.flatMap((citation) => {
          const review = reviewById.get(citation.reviewId);
          return review && review.text.includes(citation.quote.trim())
            ? [{ review, quote: citation.quote.trim() }]
            : [];
        });
        const uniqueReviews = [...new Map(citedReviews.map((item) => [item.review.id, item])).values()];
        if (uniqueReviews.length < 2) return [];

        const matchedApps = [...new Set(uniqueReviews.map((item) => item.review.appId))];
        const matchedAppNames = [...new Set(uniqueReviews.map((item) => item.review.appName))];
        const matchedDates = uniqueReviews.map((item) => item.review.reviewDate).filter(Boolean).sort();
        const confidenceCeiling = Math.min(0.9, 0.25 + 0.15 * Math.log1p(uniqueReviews.length));
        return [{
          id: `theme_ai_${crypto.randomUUID()}`,
          title: candidate.title,
          category: candidate.category,
          summary: candidate.summary,
          reviewCount: uniqueReviews.length,
          affectedApps: matchedApps,
          affectedAppNames: matchedAppNames,
          representativeQuotes: [...new Set(citedReviews.map((item) => item.quote))].slice(0, 5),
          supportingReviewIds: uniqueReviews.map((item) => item.review.id),
          earliestDate: matchedDates[0] || '',
          latestDate: matchedDates.at(-1) || '',
          severity: candidate.severity,
          confidenceScore: Math.min(candidate.confidenceScore, confidenceCeiling),
          potentialImprovement: candidate.potentialImprovement,
          validationHypothesis: candidate.validationHypothesis,
          validationSteps: candidate.validationSteps,
          trend: candidate.trend,
          provenance: 'ai_generated' as const,
          createdAt: new Date().toISOString(),
        }];
      });
      if (grounded.length) return grounded;
    } catch {
      console.warn('[AppPulse AI] Gateway theme generation failed validation; using evidence-only clustering.');
    }
  }

  return getFallbackThemes(negativeReviews, affectedApps);
}

function getFallbackThemes(reviews: Review[], affectedApps: Application[]): ComplaintTheme[] {
  const categoryCounts: Record<string, { quotes: string[]; appIds: Set<string>; appNames: Set<string>; reviewIds: string[]; dates: string[] }> = {};

  for (const review of reviews) {
    const category = review.classification?.category || 'Other';
    categoryCounts[category] ??= { quotes: [], appIds: new Set(), appNames: new Set(), reviewIds: [], dates: [] };
    categoryCounts[category].appIds.add(review.appId);
    categoryCounts[category].appNames.add(review.appName);
    categoryCounts[category].reviewIds.push(review.id);
    if (review.reviewDate) categoryCounts[category].dates.push(review.reviewDate);
    if (categoryCounts[category].quotes.length < 3 && review.text.length > 0) {
      categoryCounts[category].quotes.push(review.text.slice(0, 150));
    }
  }

  return Object.entries(categoryCounts)
    .filter(([, evidence]) => evidence.reviewIds.length >= 2)
    .map(([category, evidence], index) => {
      const appNames = [...evidence.appNames];
      const appIds = [...evidence.appIds].filter((id) => affectedApps.some((app) => app.id === id));
      const dates = evidence.dates.filter((date) => !Number.isNaN(Date.parse(date))).sort();
      const severity = category.includes('Crash') || category.includes('Bugs') ? 'Critical' : 'High';
      return {
        id: `theme_clustered_${crypto.randomUUID()}_${index}`,
        title: `${category} review cluster${appNames.length ? ` in ${appNames.slice(0, 2).join(' & ')}` : ''}`,
        category: category as ComplaintTheme['category'],
        summary: `Deterministic cluster of ${evidence.reviewIds.length} stored reviews classified as ${category}. This describes only the collected sample, not marketplace-wide prevalence.`,
        reviewCount: evidence.reviewIds.length,
        affectedApps: appIds,
        affectedAppNames: appNames,
        representativeQuotes: evidence.quotes,
        supportingReviewIds: [...new Set(evidence.reviewIds)],
        earliestDate: dates[0] || '',
        latestDate: dates.at(-1) || '',
        severity,
        confidenceScore: Math.min(0.9, 0.25 + 0.15 * Math.log1p(evidence.reviewIds.length)),
        potentialImprovement: `Test whether a focused improvement to ${category.toLowerCase()} addresses the issues in these stored reviews.`,
        validationHypothesis: `Users represented by this review cluster may value an alternative that addresses ${category.toLowerCase()}; validate this with direct research.`,
        validationSteps: [
          `Interview users about the specific ${category.toLowerCase()} examples in the stored reviews`,
          'Prototype a response to the reported workflow issue',
          'Measure task success in a user study',
        ],
        trend: 'stable' as const,
        provenance: 'calculated' as const,
        createdAt: new Date().toISOString(),
      };
    });
}

const opportunityNarrativeSchema = z.object({
  themeId: z.string().min(1).max(240),
  title: z.string().min(1).max(240),
  targetUser: z.string().max(1_000),
  existingSolutions: z.string().max(1_200),
  proposedConcept: z.string().max(1_200),
  differentiationHypothesis: z.string().max(1_200),
  validationQuestions: z.array(z.string().min(1).max(500)).max(8),
  nextSteps: z.array(z.string().min(1).max(500)).max(8),
  tags: z.array(z.string().min(1).max(80)).max(12),
});

function buildOpportunity(
  theme: ComplaintTheme,
  narrative?: z.infer<typeof opportunityNarrativeSchema>,
  provenance: 'ai' | 'calculated' = 'calculated',
): Opportunity {
  const reviewIds = [...new Set(theme.supportingReviewIds || [])];
  const scoreResult = calculateOpportunityScore({
    severity: theme.severity,
    complaintFrequency: reviewIds.length,
    latestReviewDate: theme.latestDate,
    affectedAppCount: theme.affectedApps.length,
  });
  return {
    id: `opp_${provenance}_${theme.id}`,
    title: narrative?.title || `Product opportunity: ${theme.title}`,
    problemStatement: theme.summary,
    targetUser: narrative?.targetUser || 'Users represented by the linked collected review evidence.',
    supportingAppIds: [...new Set(theme.affectedApps)],
    supportingAppNames: [...new Set(theme.affectedAppNames)],
    supportingReviewIds: reviewIds,
    supportingReviewQuotes: [...new Set(theme.representativeQuotes)].slice(0, 8),
    complaintFrequency: reviewIds.length,
    severity: theme.severity,
    existingSolutions: narrative?.existingSolutions || `Existing alternatives have not been verified from these review excerpts; research them before making a comparison.`,
    proposedConcept: narrative?.proposedConcept || theme.potentialImprovement,
    differentiationHypothesis: narrative?.differentiationHypothesis || theme.validationHypothesis,
    validationQuestions: narrative?.validationQuestions || [
      'How often does this reported issue affect your work?',
      'What workaround or alternative do you use today?',
      'What evidence would make you consider a different solution?',
    ],
    nextSteps: narrative?.nextSteps || theme.validationSteps,
    priorityScore: scoreResult.score,
    scoreBreakdown: scoreResult.breakdown,
    tags: [...new Set([theme.category, ...(narrative?.tags || []), provenance === 'ai' ? 'AI hypothesis' : 'Evidence-derived'])].slice(0, 12),
    status: 'validating',
    provenance,
    createdAt: new Date().toISOString(),
  };
}

/** Turns evidence-linked themes into product hypotheses; all counts and citations come from stored reviews. */
export async function generateOpportunitiesWithAI(
  themes: ComplaintTheme[],
  apps: Application[],
): Promise<Opportunity[]> {
  const eligibleThemes = themes.filter((theme) => (theme.supportingReviewIds?.length || 0) >= 2 && theme.representativeQuotes.length > 0).slice(0, 3);
  if (!eligibleThemes.length) return [];

  if (isAIProviderConfigured()) {
    try {
      const result = await generateText({
        model: AI_MODEL_ID,
        output: Output.array({ element: opportunityNarrativeSchema, minItems: 0, maxItems: 3 }),
        system: [
          'Generate product opportunity hypotheses using only the supplied review-backed themes and applications.',
          'Do not invent customer counts, market size, competitor capabilities, or demand metrics.',
          'Return the exact supplied themeId for each item. Phrase unverified competitor comparisons as questions to research.',
        ].join(' '),
        prompt: JSON.stringify({
          applications: apps.map((app) => ({ id: app.id, name: app.name, category: app.category })),
          themes: eligibleThemes.map((theme) => ({
            themeId: theme.id,
            title: theme.title,
            category: theme.category,
            summary: theme.summary,
            affectedApps: theme.affectedApps,
            supportingReviewIds: theme.supportingReviewIds,
            exactQuotes: theme.representativeQuotes,
            severity: theme.severity,
            validationSteps: theme.validationSteps,
          })),
        }),
        temperature: 0.2,
        maxOutputTokens: 3_000,
        abortSignal: AbortSignal.timeout(25_000),
      });

      const themeById = new Map(eligibleThemes.map((theme) => [theme.id, theme]));
      const usedThemeIds = new Set<string>();
      const generated = (result.output ?? []).flatMap((candidate) => {
        const theme = themeById.get(candidate.themeId);
        if (!theme || usedThemeIds.has(theme.id)) return [];
        usedThemeIds.add(theme.id);
        return [buildOpportunity(theme, candidate, 'ai')];
      });
      if (generated.length) return generated;
    } catch {
      console.warn('[AppPulse AI] Gateway opportunity generation failed validation; using evidence-derived hypotheses.');
    }
  }

  return eligibleThemes.map((theme) => buildOpportunity(theme));
}

const emailDraftSchema = z.object({
  subject: z.string().min(1).max(120),
  body: z.string().min(1).max(1_500),
});

export interface OutreachDraft {
  subject: string;
  body: string;
  generatedBy: 'ai_generated' | 'template';
}

export async function draftOutreachEmailWithAI(params: {
  contact: Contact;
  opportunity?: Opportunity;
  app?: Application;
  objective: string;
  tone: string;
}): Promise<OutreachDraft> {
  const { contact, opportunity, app, objective, tone } = params;
  if (!opportunity?.supportingReviewIds?.length || !opportunity.supportingReviewQuotes?.length) {
    throw new Error('An opportunity linked to collected review evidence is required to draft outreach.');
  }

  const appName = app?.name || contact.appName || opportunity.supportingAppNames[0] || contact.company;
  if (isAIProviderConfigured()) {
    try {
      const result = await generateText({
        model: AI_MODEL_ID,
        output: Output.object({ schema: emailDraftSchema }),
        system: [
          'Draft a concise, professional B2B message for human review only; AppPulse does not send email.',
          'Use only the supplied contact, product hypothesis, and exact review excerpts.',
          'Do not invent measurements, customer counts, outcomes, or claims about the recipient.',
          'Use a respectful opt-out sentence that asks the recipient to reply to the sender; do not promise automated unsubscribe processing.',
          'Keep the subject under 9 words and the body under 130 words.',
        ].join(' '),
        prompt: JSON.stringify({
          recipient: { name: contact.name, title: contact.title, company: contact.company },
          application: appName,
          objective,
          tone,
          opportunity: {
            title: opportunity.title,
            problemStatement: opportunity.problemStatement,
            proposedConcept: opportunity.proposedConcept,
            evidenceReviewIds: opportunity.supportingReviewIds,
            exactReviewQuotes: opportunity.supportingReviewQuotes.slice(0, 3),
          },
        }),
        temperature: 0.3,
        maxOutputTokens: 700,
        abortSignal: AbortSignal.timeout(20_000),
      });
      const draft = result.output;
      if (!draft || draft.subject.trim().split(/\s+/).length > 8 || draft.body.trim().split(/\s+/).length > 130) {
        throw new Error('Generated outreach draft did not meet the length limits');
      }
      return { subject: draft.subject.trim(), body: draft.body.trim(), generatedBy: 'ai_generated' };
    } catch {
      console.warn('[AppPulse AI] Gateway outreach draft failed validation; returning an evidence-linked template.');
    }
  }

  return {
    subject: `Review insight on ${appName}`,
    body: `Hi ${contact.name.split(' ')[0] || 'there'},\n\nI am reaching out with a product hypothesis based on public review excerpts associated with ${appName}.\n\nThe research opportunity is: ${opportunity.title}. This is a hypothesis for discussion, not a measured customer outcome.\n\nWould you be open to a brief feedback exchange?\n\nIf you prefer no further contact, please reply to the sender. AppPulse has not sent this draft and does not process replies or unsubscribe events.`,
    generatedBy: 'template',
  };
}

function sourceReviews(reviews: Review[]): Review[] {
  return reviews.filter((review) => review.provenance === 'live_marketplace' || review.provenance === 'imported');
}

function reviewShareForApps(appIds: string[], reviews: Review[]) {
  const selected = reviews.filter((review) => appIds.includes(review.appId) && Number.isFinite(review.starRating));
  const negative = selected.filter((review) => review.starRating <= 2);
  const positive = selected.filter((review) => review.starRating >= 3);
  const measurable = selected.length >= 5 && negative.length > 0 && positive.length > 0;
  const dates = selected.map((review) => review.reviewDate).filter((date) => date && !Number.isNaN(Date.parse(date))).sort();
  return {
    ratingSampleCount: selected.length,
    negativeReviewCount: negative.length,
    negativeReviewSharePct: measurable ? Math.round((negative.length / selected.length) * 100) : 0,
    riskBasis: measurable ? 'negative_review_share_proxy' as const : 'insufficient_rating_coverage' as const,
    coverageStartDate: dates[0] || '',
    coverageEndDate: dates.at(-1) || '',
  };
}

function reviewTrendVelocity(reviews: Review[]): 'Accelerating' | 'Steady' | 'Decelerating' {
  const timestamps = reviews
    .filter((review) => review.starRating <= 2 && review.reviewDate)
    .map((review) => Date.parse(review.reviewDate))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (timestamps.length < 6) return 'Steady';
  const latest = timestamps.at(-1) as number;
  const recentStart = latest - 30 * 86_400_000;
  const previousStart = latest - 60 * 86_400_000;
  const recentCount = timestamps.filter((date) => date > recentStart).length;
  const previousCount = timestamps.filter((date) => date > previousStart && date <= recentStart).length;
  if (previousCount < 2) return 'Steady';
  if (recentCount >= previousCount * 1.5 && recentCount - previousCount >= 2) return 'Accelerating';
  if (recentCount <= previousCount * 0.5 && previousCount - recentCount >= 2) return 'Decelerating';
  return 'Steady';
}

function cleanList(value: unknown, maxItems = 8): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, maxItems).map((item) => item.trim().slice(0, 500))
    : [];
}

const forecastCandidateSchema = z.object({
  weaknessTitle: z.string().min(1).max(180),
  category: z.enum(complaintCategories),
  rootCauseTrend: z.string().min(1).max(700),
  forecastedWindowMonths: z.number().int().min(3).max(12),
  marketGapSummary: z.string().min(1).max(700),
  suggestedWedgeFeature: z.string().min(1).max(700),
  severity: z.enum(severityLevels),
  evidence: z.array(z.object({
    reviewId: z.string().min(1).max(240),
    quote: z.string().min(12).max(800),
  })).max(12),
  validationMilestones: z.array(z.string().min(1).max(500)).max(8),
});

export async function forecastFutureWeaknessesWithAI(
  reviews: Review[],
  apps: Application[],
  themes: ComplaintTheme[],
): Promise<PredictedWeakness[]> {
  const observedReviews = sourceReviews(reviews);
  const negativeReviews = observedReviews.filter((review) => review.starRating <= 2 && review.text.trim().length >= 12);
  if (!apps.length || negativeReviews.length < 2) return [];

  if (isAIProviderConfigured()) {
    try {
      const result = await generateText({
        model: AI_MODEL_ID,
        output: Output.array({ element: forecastCandidateSchema, minItems: 0, maxItems: 4 }),
        system: [
          'Generate product-risk hypotheses from only the supplied applications, review excerpts, and themes.',
          'Do not claim observed churn, market size, customer counts, release history, or future outcomes.',
          'Every hypothesis must cite exact contiguous excerpts from at least two distinct supplied review IDs.',
          'If the evidence is insufficient, return an empty array. Causes, gaps, and future windows are hypotheses to validate.',
        ].join(' '),
        prompt: JSON.stringify({
          applications: apps.slice(0, 8).map((app) => ({ id: app.id, name: app.name, category: app.category, updateCadence: app.updateFrequency })),
          negativeReviews: negativeReviews.slice(0, 35).map((review) => ({
            reviewId: review.id,
            appId: review.appId,
            appName: review.appName,
            category: review.classification?.category || 'Unclassified',
            date: review.reviewDate || 'Not provided',
            text: review.text.slice(0, 500),
          })),
          themes: themes.slice(0, 5).map((theme) => ({ title: theme.title, category: theme.category, supportingReviewIds: theme.supportingReviewIds })),
        }),
        temperature: 0.2,
        maxOutputTokens: 3_500,
        abortSignal: AbortSignal.timeout(30_000),
      });

      const reviewById = new Map(negativeReviews.map((review) => [review.id, review]));
      const forecasts = (result.output ?? []).flatMap((candidate, index) => {
        const citations = candidate.evidence.flatMap((citation) => {
          const review = reviewById.get(citation.reviewId);
          return review && review.text.includes(citation.quote.trim())
            ? [{ review, quote: citation.quote.trim() }]
            : [];
        });
        const supportingReviews = [...new Map(citations.map((entry) => [entry.review.id, entry.review])).values()];
        if (supportingReviews.length < 2) return [];

        const supportingReviewIds = supportingReviews.map((review) => review.id);
        const supportingAppIds = [...new Set(supportingReviews.map((review) => review.appId))];
        const supportingApps = apps.filter((app) => supportingAppIds.includes(app.id));
        if (!supportingApps.length) return [];
        const risk = reviewShareForApps(supportingAppIds, observedReviews);
        const trendVelocity = reviewTrendVelocity(supportingReviews);
        const scoreData = calculateFutureOpportunityScore({
          trendVelocity,
          severity: candidate.severity,
          updateFrequency: supportingApps[0].updateFrequency || 'Unknown',
          affectedCompetitorCount: supportingAppIds.length,
        });
        return [{
          id: `forecast_ai_${crypto.randomUUID()}_${index}`,
          competitorAppIds: supportingAppIds,
          competitorAppNames: supportingApps.map((app) => app.name),
          weaknessTitle: candidate.weaknessTitle,
          category: candidate.category,
          rootCauseTrend: `Hypothesis to validate: ${candidate.rootCauseTrend}`,
          forecastedWindowMonths: candidate.forecastedWindowMonths,
          negativeReviewSharePct: risk.negativeReviewSharePct,
          riskBasis: risk.riskBasis,
          ratingSampleCount: risk.ratingSampleCount,
          negativeReviewCount: risk.negativeReviewCount,
          coverageStartDate: risk.coverageStartDate,
          coverageEndDate: risk.coverageEndDate,
          marketGapSummary: `Potential gap to validate: ${candidate.marketGapSummary}`,
          suggestedWedgeFeature: candidate.suggestedWedgeFeature,
          futureOpportunityScore: scoreData.futureOpportunityScore,
          scoreBreakdown: scoreData.scoreBreakdown,
          evidenceReviewQuotes: [...new Set(citations.map((entry) => entry.quote))].slice(0, 8),
          supportingReviewIds,
          validationMilestones: cleanList(candidate.validationMilestones),
          status: 'forecasted' as const,
          provenance: 'ai_generated' as const,
          createdAt: new Date().toISOString(),
        }];
      });
      if (forecasts.length) return forecasts;
    } catch {
      console.warn('[AppPulse AI] Gateway forecast generation failed validation; using evidence-only forecasts.');
    }
  }

  return synthesizeFallbackForecasts(apps, themes, observedReviews);
}

function synthesizeFallbackForecasts(apps: Application[], themes: ComplaintTheme[], reviews: Review[]): PredictedWeakness[] {
  const result: PredictedWeakness[] = [];
  for (const theme of themes) {
    const evidenceIds = new Set(theme.supportingReviewIds || []);
    const relatedReviews = reviews.filter((review) => evidenceIds.has(review.id) && theme.affectedApps.includes(review.appId) && review.starRating <= 2);
    if (relatedReviews.length < 2) continue;
    const supportingReviewIds = [...new Set(relatedReviews.map((review) => review.id))];
    const supportingAppIds = [...new Set(relatedReviews.map((review) => review.appId))];
    const supportingApps = apps.filter((app) => supportingAppIds.includes(app.id));
    if (!supportingApps.length) continue;
    const quotes = (theme.representativeQuotes || []).filter((quote) => typeof quote === 'string' && relatedReviews.some((review) => review.text.includes(quote)));
    const evidenceReviewQuotes = quotes.length ? [...new Set(quotes)].slice(0, 8) : relatedReviews.slice(0, 4).map((review) => review.text.slice(0, 220));
    const risk = reviewShareForApps(supportingAppIds, reviews);
    const trendVelocity = reviewTrendVelocity(relatedReviews);
    const scoreData = calculateFutureOpportunityScore({
      trendVelocity,
      severity: theme.severity,
      updateFrequency: supportingApps[0].updateFrequency || 'Unknown',
      affectedCompetitorCount: supportingAppIds.length,
    });

    result.push({
      id: `forecast_evidence_${crypto.randomUUID()}`,
      competitorAppIds: supportingAppIds,
      competitorAppNames: supportingApps.map((app) => app.name),
      weaknessTitle: `${theme.category} review pattern in ${supportingApps.map((app) => app.name).slice(0, 2).join(' and ')}`,
      category: theme.category,
      rootCauseTrend: `Evidence summary: ${supportingReviewIds.length} linked negative reviews support this hypothesis; the reviews do not establish its cause or future impact.`,
      forecastedWindowMonths: 6,
      negativeReviewSharePct: risk.negativeReviewSharePct,
      riskBasis: risk.riskBasis,
      ratingSampleCount: risk.ratingSampleCount,
      negativeReviewCount: risk.negativeReviewCount,
      coverageStartDate: risk.coverageStartDate,
      coverageEndDate: risk.coverageEndDate,
      marketGapSummary: `Potential need to validate from the linked review excerpts: ${theme.summary}`,
      suggestedWedgeFeature: theme.potentialImprovement,
      futureOpportunityScore: scoreData.futureOpportunityScore,
      scoreBreakdown: scoreData.scoreBreakdown,
      evidenceReviewQuotes,
      supportingReviewIds,
      validationMilestones: cleanList(theme.validationSteps),
      status: 'forecasted',
      provenance: 'calculated',
      createdAt: new Date().toISOString(),
    });
    if (result.length === 4) break;
  }
  return result;
}

export function buildEvidenceOnlyCompetitorAnalysis(apps: Application[], reviews: Review[]): CompetitorAnalysisResult {
  const observedReviews = sourceReviews(reviews);
  const metrics: CompetitorAnalysisMetric[] = apps.map((app) => {
    const sample = observedReviews.filter((review) => review.appId === app.id).slice(0, 500);
    const negative = sample.filter((review) => review.starRating <= 2);
    const complaints: Record<string, number> = {};
    for (const review of negative) {
      const category = review.classification?.category || 'Unclassified';
      complaints[category] = (complaints[category] || 0) + 1;
    }
    return {
      appId: app.id,
      appName: app.name,
      sampleReviewCount: sample.length,
      negativeReviewCount: negative.length,
      negativeSharePct: sample.length ? Math.round((negative.length / sample.length) * 100) : null,
      featureRequestCount: sample.filter((review) => review.classification?.isFeatureRequest).length,
      topComplaints: Object.entries(complaints).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([category, count]) => ({ category, count })),
    };
  });
  const findings: CompetitorAnalysisFinding[] = [];
  for (const app of apps) {
    const negative = observedReviews.filter((review) => review.appId === app.id && review.starRating <= 2).slice(0, 3);
    if (!negative.length) continue;
    const metric = metrics.find((item) => item.appId === app.id);
    const category = metric?.topComplaints[0]?.category;
    findings.push({
      appId: app.id,
      appName: app.name,
      finding: category
        ? `In the stored sample, ${category} is the most frequent classified category among ${metric?.negativeReviewCount || 0} negative review(s). This is not a marketplace-wide estimate.`
        : `The stored sample contains ${negative.length} negative review(s). This is not a marketplace-wide estimate.`,
      evidenceReviewIds: negative.map((review) => review.id),
      evidenceQuotes: negative.map((review) => review.text.slice(0, 400)),
    });
  }
  const evidenceReviewCount = observedReviews.filter((review) => apps.some((app) => app.id === review.appId)).length;
  return {
    appIds: apps.map((app) => app.id),
    provenance: 'calculated',
    summary: evidenceReviewCount
      ? `Evidence-only comparison of ${apps.length} selected application(s) using ${evidenceReviewCount} stored non-seed review(s). Metrics describe this sample only.`
      : 'No non-seed review evidence is stored for the selected applications; collect or import source reviews before analysis.',
    metrics,
    findings,
    evidenceReviewCount,
    createdAt: new Date().toISOString(),
  };
}

const competitorFindingSchema = z.object({
  appId: z.string().min(1).max(240),
  finding: z.string().min(1).max(600),
  evidence: z.array(z.object({
    reviewId: z.string().min(1).max(240),
    quote: z.string().min(12).max(800),
  })).max(6),
});
const competitorAnalysisSchema = z.object({
  summary: z.string().min(1).max(900),
  findings: z.array(competitorFindingSchema).max(12),
});

export async function analyzeCompetitorsWithAI(apps: Application[], reviews: Review[]): Promise<CompetitorAnalysisResult> {
  const baseline = buildEvidenceOnlyCompetitorAnalysis(apps, reviews);
  if (!isAIProviderConfigured() || baseline.evidenceReviewCount < 2) return baseline;

  try {
    const sourceReviewsForApps = sourceReviews(reviews).filter((review) => apps.some((app) => app.id === review.appId));
    const result = await generateText({
      model: AI_MODEL_ID,
      output: Output.object({ schema: competitorAnalysisSchema }),
      system: [
        'Analyze the supplied competitors using only the provided non-seed review excerpts and app metadata.',
        'Every finding must cite exact quotes from at least two distinct supplied review IDs for that same application.',
        'Do not infer market share, causes, churn, release performance, or marketplace-wide prevalence.',
        'If evidence is insufficient, return no findings. Phrase all implications as hypotheses to validate.',
      ].join(' '),
      prompt: JSON.stringify({
        applications: apps.map((app) => ({ id: app.id, name: app.name, category: app.category, rating: app.rating, ratingCount: app.ratingCount })),
        metrics: baseline.metrics,
        reviews: sourceReviewsForApps.slice(0, 120).map((review) => ({
          reviewId: review.id,
          appId: review.appId,
          rating: review.starRating,
          category: review.classification?.category || 'Unclassified',
          text: review.text.slice(0, 500),
        })),
      }),
      temperature: 0.2,
      maxOutputTokens: 2_500,
      abortSignal: AbortSignal.timeout(25_000),
    });

    const output = result.output;
    if (!output) return baseline;
    const reviewById = new Map(sourceReviewsForApps.map((review) => [review.id, review]));
    const validAppIds = new Set(apps.map((app) => app.id));
    const findings = output.findings.flatMap((candidate) => {
      if (!validAppIds.has(candidate.appId)) return [];
      const citations = candidate.evidence.flatMap((citation) => {
        const review = reviewById.get(citation.reviewId);
        return review && review.appId === candidate.appId && review.text.includes(citation.quote.trim())
          ? [{ review, quote: citation.quote.trim() }]
          : [];
      });
      const uniqueCitations = [...new Map(citations.map((item) => [item.review.id, item])).values()];
      if (uniqueCitations.length < 2) return [];
      const app = apps.find((item) => item.id === candidate.appId);
      if (!app) return [];
      return [{
        appId: app.id,
        appName: app.name,
        finding: candidate.finding,
        evidenceReviewIds: uniqueCitations.map((item) => item.review.id),
        evidenceQuotes: uniqueCitations.map((item) => item.quote),
      }];
    });
    if (!findings.length) return baseline;
    return {
      ...baseline,
      provenance: 'ai_generated',
      model: AI_MODEL_ID,
      summary: `AI-generated hypotheses grounded in ${baseline.evidenceReviewCount} stored non-seed review(s). Findings apply only to this sample; verify them before acting.`,
      findings,
      createdAt: new Date().toISOString(),
    };
  } catch {
    console.warn('[AppPulse AI] Gateway competitor analysis failed validation; using evidence-only comparison.');
    return baseline;
  }
}
