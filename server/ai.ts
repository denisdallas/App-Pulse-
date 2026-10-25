import 'dotenv/config';
import crypto from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { Review, ComplaintTheme, Opportunity, Contact, Application, PredictedWeakness } from '../src/types.ts';
import { calculateOpportunityScore } from '../src/lib/scoring.ts';
import { calculateFutureOpportunityScore } from '../src/lib/forecast.ts';

// Server-side initialization with required User-Agent telemetry header
const apiKey = process.env.GEMINI_API_KEY;
export function isAIProviderConfigured(): boolean {
  return Boolean(apiKey && !/^(?:replace|change[-_ ]?me|your[-_ ]|example|placeholder|my_)/i.test(apiKey));
}

let aiClient: GoogleGenAI | null = null;

if (apiKey && isAIProviderConfigured()) {
  aiClient = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

/**
 * AI-powered complaint classification and recurring pattern summarization.
 */
export async function analyzeComplaintsWithAI(
  reviews: Review[],
  affectedApps: Application[]
): Promise<ComplaintTheme[]> {
  const reviewsSample = reviews.slice(0, 40).map((r) => ({
    app: r.appName,
    rating: r.starRating,
    text: r.text,
    date: r.reviewDate,
  }));

  if (aiClient) {
    try {
      const prompt = `You are a Senior Product Intelligence Analyst at AppPulse Intelligence.
Analyze the following negative user reviews across these applications: ${affectedApps.map((a) => a.name).join(', ')}.

Identify 3 to 6 distinct, recurring complaint themes/patterns.
For each theme, return valid JSON with an array of objects matching this exact structure:
[
  {
    "title": "Short descriptive title of the recurring complaint",
    "category": "One of: Bugs & Crashes | Missing Features | UX & Navigation | Pricing & Subscriptions | Billing & Payments | Performance & Reliability | Customer Support | Privacy & Security | Compatibility | Advertising & Monetization | Feature Requests | Other",
    "summary": "Detailed 2-sentence summary of why users are dissatisfied and the exact friction points.",
    "affectedAppNames": ["App Name 1", "App Name 2"],
    "representativeQuotes": ["Exact or near-exact quote from review 1", "Exact or near-exact quote from review 2"],
    "severity": "Critical | High | Medium | Low",
    "confidenceScore": 0.95,
    "potentialImprovement": "Concrete technical or product improvement to eliminate this pain point.",
    "validationHypothesis": "Hypothesis about market demand if a competitor fixes this.",
    "validationSteps": ["Step 1", "Step 2", "Step 3"],
    "trend": "emerging | stable | decreasing"
  }
]

Negative Reviews Data:
${JSON.stringify(reviewsSample, null, 2)}
`;

      const response = await aiClient.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      });

      const parsed = JSON.parse(response.text?.trim() || '[]');
      if (Array.isArray(parsed) && parsed.length > 0) {
        const grounded = parsed.flatMap((item, idx) => {
          const candidateQuotes: unknown[] = Array.isArray(item.representativeQuotes) ? item.representativeQuotes : [];
          const quotes = candidateQuotes.filter((quote): quote is string => typeof quote === 'string' && quote.trim().length >= 12);
          const matchedReviews = reviews.filter((review) => quotes.some((quote: string) => review.text.includes(quote.trim())));
          if (matchedReviews.length < 2) return [];
          const matchedAppIds = [...new Set(matchedReviews.map((review) => review.appId))];
          const matchedAppNames = [...new Set(matchedReviews.map((review) => review.appName))];
          const matchedDates = matchedReviews.map((review) => review.reviewDate).filter(Boolean).sort();
          const validSeverity = ['Critical', 'High', 'Medium', 'Low'].includes(item.severity) ? item.severity : 'High';
          const confidence = Number(item.confidenceScore);
          return [{
            id: `theme_ai_${Date.now()}_${idx}`,
            title: typeof item.title === 'string' ? item.title.slice(0, 180) : 'Collected review theme',
            category: item.category || 'Other',
            summary: typeof item.summary === 'string' ? item.summary.slice(0, 1200) : '',
            reviewCount: matchedReviews.length,
            affectedApps: matchedAppIds,
            affectedAppNames: matchedAppNames,
            representativeQuotes: [...new Set(quotes.filter((quote: string) => matchedReviews.some((review) => review.text.includes(quote.trim()))))].slice(0, 5),
            supportingReviewIds: [...new Set(matchedReviews.map((review) => review.id))],
            earliestDate: matchedDates[0] || '',
            latestDate: matchedDates.at(-1) || '',
            severity: validSeverity,
            confidenceScore: Number.isFinite(confidence)
              ? Math.min(Math.max(0, Math.min(0.9, confidence)), Math.min(0.9, 0.25 + 0.15 * Math.log1p(matchedReviews.length)))
              : Math.min(0.9, 0.25 + 0.15 * Math.log1p(matchedReviews.length)),  
            potentialImprovement: typeof item.potentialImprovement === 'string' ? item.potentialImprovement.slice(0, 600) : '',
            validationHypothesis: typeof item.validationHypothesis === 'string' ? item.validationHypothesis.slice(0, 600) : '',
            validationSteps: Array.isArray(item.validationSteps) ? item.validationSteps.filter((step: unknown): step is string => typeof step === 'string').slice(0, 8) : [],
            trend: ['emerging', 'stable', 'decreasing'].includes(item.trend) ? item.trend : 'stable',
            createdAt: new Date().toISOString(),
          }];
        });
        if (grounded.length) return grounded;
      }
    } catch {
      console.warn('[analyzeComplaintsWithAI] Gemini request failed; using deterministic clustering of collected reviews.');
    }
  }

  // Deterministic clustering fallback
  return getFallbackThemes(reviews, affectedApps);
}

function getFallbackThemes(reviews: Review[], affectedApps: Application[]): ComplaintTheme[] {
  const categoryCounts: Record<string, { quotes: string[]; apps: Set<string>; reviewIds: string[]; dates: string[] }> = {};

  for (const review of reviews) {
    const category = review.classification?.category || 'Bugs & Crashes';
    categoryCounts[category] ??= { quotes: [], apps: new Set(), reviewIds: [], dates: [] };
    categoryCounts[category].apps.add(review.appName);
    categoryCounts[category].reviewIds.push(review.id);
    if (review.reviewDate) categoryCounts[category].dates.push(review.reviewDate);
    if (categoryCounts[category].quotes.length < 3 && review.text.length > 0) {
      categoryCounts[category].quotes.push(review.text.slice(0, 150));
    }
  }

  return Object.entries(categoryCounts)
    .filter(([, evidence]) => evidence.reviewIds.length >= 2)
    .map(([category, evidence], index) => {
      const appNames = [...evidence.apps];
      const appIds = affectedApps.filter((app) => appNames.includes(app.name)).map((app) => app.id);
      const dates = evidence.dates.filter((date) => !Number.isNaN(Date.parse(date))).sort();
      const severity = category.includes('Crash') || category.includes('Bugs') ? 'Critical' : 'High';

      return {
        id: `theme_clustered_${Date.now()}_${index}`,
        title: `${category} review cluster${appNames.length ? ` in ${appNames.slice(0, 2).join(' & ')}` : ''}`,
        category: category as ComplaintTheme['category'],
        summary: `Deterministic cluster of ${evidence.reviewIds.length} collected reviews classified as ${category}. This reflects only the collected sample, not marketplace-wide prevalence.`,
        reviewCount: evidence.reviewIds.length,
        affectedApps: appIds,
        affectedAppNames: appNames,
        representativeQuotes: evidence.quotes,
        supportingReviewIds: [...new Set(evidence.reviewIds)],
        earliestDate: dates[0] || '',
        latestDate: dates.at(-1) || '',
        severity,
        confidenceScore: Math.min(0.9, 0.25 + 0.15 * Math.log1p(evidence.reviewIds.length)),
        potentialImprovement: `Test whether a focused improvement to ${category.toLowerCase()} resolves the issues described in these collected reviews.`,
        validationHypothesis: `Users represented by this review cluster may value an alternative that addresses ${category.toLowerCase()}; validate this with direct research.`,
        validationSteps: [
          `Interview users about the specific ${category.toLowerCase()} examples in the collected reviews`,
          `Prototype an improvement to the reported workflow`,
          `Measure task success in a usability study`,
        ],
        trend: 'stable',
        createdAt: new Date().toISOString(),
      };
    });
}

/**
 * AI Opportunity Finder: converts recurring themes into structured product ideas.
 */
export async function generateOpportunitiesWithAI(
  themes: ComplaintTheme[],
  apps: Application[]
): Promise<Opportunity[]> {
  const opportunities: Opportunity[] = [];

  for (const theme of themes.filter((item) => item.supportingReviewIds?.length && item.representativeQuotes?.length).slice(0, 3)) {
    const scoreResult = calculateOpportunityScore({
      severity: theme.severity,
      complaintFrequency: theme.reviewCount,
      latestReviewDate: theme.latestDate,
      affectedAppCount: theme.affectedApps.length,
    });

    opportunities.push({
      id: `opp_gen_${Date.now()}_${theme.id}`,
      title: `Next-Gen Solution: ${theme.title}`,
      problemStatement: theme.summary,
      targetUser: 'Users represented in the supporting collected review evidence.',
      supportingAppIds: theme.affectedApps,
      supportingAppNames: theme.affectedAppNames,
      supportingReviewIds: theme.supportingReviewIds || [],
      supportingReviewQuotes: theme.representativeQuotes,
      complaintFrequency: theme.reviewCount,
      severity: theme.severity,
      existingSolutions: `Collected reviews from ${theme.affectedAppNames.join(', ')} include evidence in the ${theme.category} category.`,
      proposedConcept: theme.potentialImprovement,
      differentiationHypothesis: theme.validationHypothesis,
      validationQuestions: [
        'How does this limitation directly impact your weekly productivity or revenue?',
        'What workarounds are you currently using to bypass this issue?',
        'What would be your primary requirement before switching to a new solution?',
      ],
      nextSteps: theme.validationSteps,
      priorityScore: scoreResult.score,
      scoreBreakdown: scoreResult.breakdown,
      tags: [theme.category, 'AI Opportunity', 'Validation Ready'],
      status: 'validating',
      createdAt: new Date().toISOString(),
    });
  }

  return opportunities;
}

/**
 * AI Outreach Drafter: creates personalized, respectful B2B outreach proposals.
 */
export async function draftOutreachEmailWithAI(params: {
  contact: Contact;
  opportunity?: Opportunity;
  app?: Application;
  objective: string;
  tone: string;
}): Promise<{ subject: string; body: string }> {
  const { contact, opportunity, app, objective, tone } = params;
  if (!opportunity?.supportingReviewIds?.length || !opportunity.supportingReviewQuotes?.length) {
    throw new Error('An opportunity linked to collected review evidence is required to draft outreach.');
  }

  if (aiClient) {
    try {
      const prompt = `Draft a highly professional, ethical, and concise B2B cold outreach email.
Recipient: ${contact.name}, ${contact.title} at ${contact.company} (${contact.website || ''})
Associated App: ${app?.name || contact.appName || 'Your Application'}
Product Research Insight: ${opportunity.problemStatement}
Evidence from collected public reviews: ${JSON.stringify(opportunity.supportingReviewQuotes.slice(0, 2))}
Proposed Concept: ${opportunity.proposedConcept}
Outreach Objective: ${objective} (e.g. Product Partnership, Feature Pitch, Advisory / Founder Discovery)
Preferred Tone: ${tone} (e.g. Consultative, Founder-to-Founder, Value-First, Technical)

Strict Guidelines:
1. Subject line must be under 9 words, compelling and professional (no spam keywords like FREE, URGENT).
2. Body must be 3 short paragraphs (under 130 words total).
3. Plain text format, no markdown asterisks.
4. Conclude with a clear, low-friction call to action (e.g. 10-minute feedback exchange).
5. Must include an ethical opt-out line at the very bottom.
6. Do not invent review counts, metrics, customer behavior, or claims beyond the supplied evidence.
`;

      const response = await aiClient.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
      });

      const text = response.text || '';
      const lines = text.split('\n').filter((l) => l.trim().length > 0);
      let subject = `Research insights on ${app?.name || contact.appName || contact.company}`;
      let bodyLines = lines;

      if (lines[0]?.toLowerCase().startsWith('subject:')) {
        subject = lines[0].replace(/subject:\s*/i, '').trim();
        bodyLines = lines.slice(1);
      }

      return {
        subject,
        body: bodyLines.join('\n\n').trim(),
      };
    } catch {
      console.warn('[draftOutreachEmailWithAI] Gemini request failed; using an evidence-linked template.');
    }
  }

  return {
    subject: `Review insight on ${app?.name || contact.appName || contact.company}`,
    body: `Hi ${contact.name.split(' ')[0] || 'there'},\n\nWe have a product observation based on collected public reviews associated with ${app?.name || opportunity.supportingAppNames[0] || 'your product'}.\n\nThe review-linked opportunity is: ${opportunity.title}. The concept is a hypothesis for discussion, not a measured customer outcome.\n\nWould you be open to a brief feedback exchange?\n\nBest regards,\nAppPulse Research Team\n\nIf you prefer not to receive further messages, reply "Unsubscribe" and your contact will be suppressed.`,
  };
}

/**
 * AI Forecast Engine: Predicts future competitor vulnerabilities and market gaps
 * based on emerging complaint trends, root causes, severity, and update inertia.
 */
function sourceReviews(reviews: Review[]): Review[] {
  return reviews.filter((review) => review.provenance !== 'seed' && review.provenance !== 'ai_generated' && review.provenance !== 'calculated');
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
  const recentStart = latest - 30 * 86400000;
  const previousStart = latest - 60 * 86400000;
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

export async function forecastFutureWeaknessesWithAI(
  reviews: Review[],
  apps: Application[],
  themes: ComplaintTheme[],
): Promise<PredictedWeakness[]> {
  const observedReviews = sourceReviews(reviews);
  const negativeReviews = observedReviews.filter((review) => review.starRating <= 2 && review.text.trim().length >= 12);
  if (!apps.length || negativeReviews.length < 2) return [];

  const appSummaries = apps.slice(0, 8).map((app) => ({
    id: app.id,
    name: app.name,
    category: app.category,
    updateCadence: app.updateFrequency,
  }));
  const complaintSamples = negativeReviews.slice(0, 35).map((review) => ({
    reviewId: review.id,
    appId: review.appId,
    app: review.appName,
    category: review.classification?.category || 'Unclassified',
    date: review.reviewDate || 'Not provided',
    text: review.text.slice(0, 400),
  }));

  if (aiClient) {
    try {
      const prompt = `Use only the supplied applications, review excerpts, and themes. Return zero to four product hypotheses, not claims about observed churn, market size, customer counts, release history, or future outcomes. Every hypothesis must name an exact application from the input and cite exact text from at least two distinct supplied review IDs. If evidence is insufficient, return []. Treat root causes and product gaps as hypotheses to validate. Do not output numeric risk values.
Apps: ${JSON.stringify(appSummaries)}
Negative review sample: ${JSON.stringify(complaintSamples)}
Themes: ${JSON.stringify(themes.slice(0, 5).map((theme) => ({ title: theme.title, category: theme.category, supportingReviewIds: theme.supportingReviewIds })))}
Return strict JSON with objects shaped as:
[{"weaknessTitle":"...","competitorAppNames":["Exact app name"],"category":"...","rootCauseTrend":"Hypothesis ...","forecastedWindowMonths":6,"marketGapSummary":"Hypothesis ...","suggestedWedgeFeature":"...","severity":"High","evidenceReviewQuotes":["Exact review excerpt","Another exact excerpt"],"validationMilestones":["...","..."]}]`;
      const response = await aiClient.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json', temperature: 0.2 },
      });
      const parsed: unknown = JSON.parse(response.text?.trim() || '[]');
      if (Array.isArray(parsed)) {
        const categories = new Set<PredictedWeakness['category']>([
          'Bugs & Crashes', 'Missing Features', 'UX & Navigation', 'Pricing & Subscriptions',
          'Billing & Payments', 'Performance & Reliability', 'Customer Support', 'Privacy & Security',
          'Compatibility', 'Advertising & Monetization', 'Feature Requests', 'Other',
        ]);
        const forecasts = parsed.flatMap((item: unknown, index: number): PredictedWeakness[] => {
          if (!item || typeof item !== 'object') return [];
          const candidate = item as Record<string, unknown>;
          const requestedNames = new Set(cleanList(candidate.competitorAppNames, 8));
          const namedApps = apps.filter((app) => requestedNames.has(app.name));
          if (!namedApps.length) return [];
          const namedAppIds = new Set(namedApps.map((app) => app.id));
          const candidateQuotes = cleanList(candidate.evidenceReviewQuotes, 12).filter((quote) => quote.length >= 12);
          const supportingReviews = negativeReviews.filter((review) => namedAppIds.has(review.appId) && candidateQuotes.some((quote) => review.text.includes(quote)));
          if (supportingReviews.length < 2) return [];
          const supportingReviewIds = [...new Set(supportingReviews.map((review) => review.id))];
          const supportingAppIds = [...new Set(supportingReviews.map((review) => review.appId))];
          const supportedApps = apps.filter((app) => supportingAppIds.includes(app.id));
          const evidenceReviewQuotes = [...new Set(candidateQuotes.filter((quote) => supportingReviews.some((review) => review.text.includes(quote))))].slice(0, 8);
          const risk = reviewShareForApps(supportingAppIds, observedReviews);
          const trendVelocity = reviewTrendVelocity(supportingReviews);
          const severityValues = ['Critical', 'High', 'Medium', 'Low'] as const;
          const severity = severityValues.includes(candidate.severity as typeof severityValues[number]) ? candidate.severity as typeof severityValues[number] : 'High';
          const updateFrequency = supportedApps[0]?.updateFrequency || 'Unknown';
          const scoreData = calculateFutureOpportunityScore({ trendVelocity, severity, updateFrequency, affectedCompetitorCount: supportingAppIds.length });
          const requestedWindow = Number(candidate.forecastedWindowMonths);
          const category = categories.has(candidate.category as PredictedWeakness['category']) ? candidate.category as PredictedWeakness['category'] : 'Other';
          const hypothesis = (value: unknown, fallback: string) => `${fallback}${typeof value === 'string' && value.trim() ? ` ${value.trim().slice(0, 700)}` : ''}`;

          return [{
            id: `forecast_ai_${crypto.randomUUID()}`,
            competitorAppIds: supportingAppIds,
            competitorAppNames: supportedApps.map((app) => app.name),
            weaknessTitle: typeof candidate.weaknessTitle === 'string' ? candidate.weaknessTitle.trim().slice(0, 180) : `${category} review pattern`,
            category,
            rootCauseTrend: hypothesis(candidate.rootCauseTrend, 'Hypothesis, not an observed cause:'),
            forecastedWindowMonths: Number.isFinite(requestedWindow) ? Math.max(3, Math.min(12, Math.round(requestedWindow))) : 6,
            negativeReviewSharePct: risk.negativeReviewSharePct,
            riskBasis: risk.riskBasis,
            ratingSampleCount: risk.ratingSampleCount,
            negativeReviewCount: risk.negativeReviewCount,
            coverageStartDate: risk.coverageStartDate,
            coverageEndDate: risk.coverageEndDate,
            marketGapSummary: hypothesis(candidate.marketGapSummary, 'Potential market gap to validate:'),
            suggestedWedgeFeature: typeof candidate.suggestedWedgeFeature === 'string' ? candidate.suggestedWedgeFeature.trim().slice(0, 700) : '',
            futureOpportunityScore: scoreData.futureOpportunityScore,
            scoreBreakdown: scoreData.scoreBreakdown,
            evidenceReviewQuotes,
            supportingReviewIds,
            validationMilestones: cleanList(candidate.validationMilestones),
            status: 'forecasted',
            createdAt: new Date().toISOString(),
          }];
        });
        if (forecasts.length) return forecasts;
      }
    } catch {
      console.warn('[forecastFutureWeaknessesWithAI] Provider request or output validation failed; using evidence-only forecast synthesis.');
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
    const updateFrequency = supportingApps[0].updateFrequency || 'Unknown';
    const scoreData = calculateFutureOpportunityScore({ trendVelocity, severity: theme.severity, updateFrequency, affectedCompetitorCount: supportingAppIds.length });

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
      createdAt: new Date().toISOString(),
    });
    if (result.length === 4) break;
  }
  return result;
}
