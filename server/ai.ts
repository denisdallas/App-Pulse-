import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import { Review, ComplaintTheme, Opportunity, Contact, Application, PredictedWeakness } from '../src/types.ts';
import { calculateOpportunityScore } from '../src/lib/scoring.ts';
import { calculateFutureOpportunityScore } from '../src/lib/forecast.ts';

// Server-side initialization with required User-Agent telemetry header
const apiKey = process.env.GEMINI_API_KEY;
let aiClient: GoogleGenAI | null = null;

if (apiKey && apiKey !== 'MY_GEMINI_API_KEY') {
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
          const quotes = Array.isArray(item.representativeQuotes)
            ? item.representativeQuotes.filter((quote: unknown): quote is string => typeof quote === 'string' && quote.trim().length >= 12)
            : [];
          const matchedReviews = reviews.filter((review) => quotes.some((quote) => review.text.includes(quote.trim())));
          if (!matchedReviews.length) return [];
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
            representativeQuotes: [...new Set(quotes.filter((quote) => matchedReviews.some((review) => review.text.includes(quote.trim()))))].slice(0, 5),
            supportingReviewIds: [...new Set(matchedReviews.map((review) => review.id))],
            earliestDate: matchedDates[0] || '',
            latestDate: matchedDates.at(-1) || '',
            severity: validSeverity,
            confidenceScore: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
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
  const categoryCounts: Record<string, { quotes: string[]; apps: Set<string>; reviewIds: string[]; count: number }> = {};

  for (const r of reviews) {
    const cat = r.classification?.category || 'Bugs & Crashes';
    if (!categoryCounts[cat]) {
      categoryCounts[cat] = { quotes: [], apps: new Set(), reviewIds: [], count: 0 };
    }
    categoryCounts[cat].count++;
    categoryCounts[cat].apps.add(r.appName);
    categoryCounts[cat].reviewIds.push(r.id);
    if (categoryCounts[cat].quotes.length < 3 && r.text.length > 30) {
      categoryCounts[cat].quotes.push(r.text.slice(0, 150) + '...');
    }
  }

  return Object.entries(categoryCounts).map(([cat, info], idx) => {
    const appNames = Array.from(info.apps);
    const appIds = affectedApps.filter((a) => appNames.includes(a.name)).map((a) => a.id);

    return {
      id: `theme_clustered_${Date.now()}_${idx}`,
      title: `Recurring ${cat} Deficits across ${appNames.slice(0, 2).join(' & ')}`,
      category: cat as any,
      summary: `Users frequently report severe dissatisfaction regarding ${cat.toLowerCase()}, citing operational disruption and workflow degradation.`,
      reviewCount: info.count,
      affectedApps: appIds,
      affectedAppNames: appNames,
      representativeQuotes: info.quotes,
      supportingReviewIds: info.reviewIds,
      earliestDate: reviews[reviews.length - 1]?.reviewDate || '',
      latestDate: reviews[0]?.reviewDate || '',
      severity: cat.includes('Crash') || cat.includes('Bugs') ? 'Critical' : 'High',
      confidenceScore: Math.min(0.95, info.count / Math.max(reviews.length, 1)),
      potentialImprovement: `Refactor core architecture to solve root cause of ${cat.toLowerCase()} and provide transparent fallback states.`,
      validationHypothesis: `A focused alternative solving ${cat.toLowerCase()} can capture early adopters actively churning from current market leaders.`,
      validationSteps: [
        `Direct discovery interviews with 15 users affected by ${cat.toLowerCase()}`,
        `Deploy interactive prototype benchmarking resolution speed`,
        `Validate pricing elasticity and willingness to switch`,
      ],
      trend: 'emerging',
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

  for (const theme of themes.filter((item) => item.supportingReviewIds?.length).slice(0, 3)) {
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
export async function forecastFutureWeaknessesWithAI(
  reviews: Review[],
  apps: Application[],
  themes: ComplaintTheme[]
): Promise<PredictedWeakness[]> {
  const recentComplaints = reviews
    .filter((r) => r.starRating <= 2)
    .slice(0, 35)
    .map((r) => ({
      app: r.appName,
      category: r.classification?.category,
      text: r.text.slice(0, 200),
      severity: r.classification?.severity,
    }));

  const appSummaries = apps.slice(0, 8).map((a) => ({
    id: a.id,
    name: a.name,
    category: a.category,
    version: a.currentVersion,
    updateCadence: a.updateFrequency,
  }));

  if (aiClient) {
    try {
      const prompt = `You are a Principal Market Intelligence Analyst predicting competitor vulnerabilities and software market entry windows.
Analyze the following app catalog and negative complaint data:
Apps: ${JSON.stringify(appSummaries, null, 2)}
Recent Negative Complaints: ${JSON.stringify(recentComplaints, null, 2)}
Identified Themes: ${JSON.stringify(themes.slice(0, 5).map((t) => ({ title: t.title, category: t.category, summary: t.summary })), null, 2)}

Predict 2 to 4 high-probability future competitor weaknesses and market gaps over the next 3 to 12 months.
Focus on where incumbent apps are stuck due to legacy architecture, slow update cycles, or persistent recurring complaints.
Respond with a strict JSON array of objects with this exact structure:
[
  {
    "weaknessTitle": "Short title describing the impending competitor breakdown or gap",
    "competitorAppNames": ["Exact Name of Competitor App"],
    "category": "One of: Bugs & Crashes | Missing Features | UX & Navigation | Pricing & Subscriptions | Performance & Reliability | Customer Support | Compatibility | Feature Requests | Other",
    "rootCauseTrend": "Analysis of why this issue will worsen or remain unaddressed (e.g. legacy backend tech debt)",
    "forecastedWindowMonths": 6,
    "estimatedChurnRiskPct": 28,
    "marketGapSummary": "Clear explanation of the unserved market segment or underserved workflow.",
    "suggestedWedgeFeature": "Specific product or feature to launch that exploits this gap.",
    "trendVelocity": "Accelerating",
    "severity": "Critical",
    "evidenceReviewQuotes": ["Quote 1 from reviews", "Quote 2 from reviews"],
    "validationMilestones": ["Milestone 1", "Milestone 2", "Milestone 3"]
  }
]
`;

      const response = await aiClient.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.3,
        },
      });

      const parsed = JSON.parse(response.text?.trim() || '[]');
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((item, idx) => {
          const matchedApps = apps.filter((a) => (item.competitorAppNames || []).includes(a.name));
          const targetApp = matchedApps[0] || apps[0];
          const competitorAppIds = matchedApps.map((a) => a.id);
          const updateFrequency = targetApp?.updateFrequency || 'Monthly';

          const scoreData = calculateFutureOpportunityScore({
            trendVelocity: (item.trendVelocity as any) || 'Accelerating',
            severity: (item.severity as any) || 'High',
            updateFrequency,
            affectedCompetitorCount: competitorAppIds.length || 1,
            estimatedChurnRiskPct: Number(item.estimatedChurnRiskPct) || 25,
          });

          return {
            id: `forecast_ai_${Date.now()}_${idx}`,
            competitorAppIds: competitorAppIds.length > 0 ? competitorAppIds : [targetApp?.id || 'app_1'],
            competitorAppNames: item.competitorAppNames || [targetApp?.name || 'Competitor'],
            weaknessTitle: item.weaknessTitle,
            category: item.category || 'Performance & Reliability',
            rootCauseTrend: item.rootCauseTrend,
            forecastedWindowMonths: Number(item.forecastedWindowMonths) || 6,
            estimatedChurnRiskPct: Number(item.estimatedChurnRiskPct) || 25,
            marketGapSummary: item.marketGapSummary,
            suggestedWedgeFeature: item.suggestedWedgeFeature,
            futureOpportunityScore: scoreData.futureOpportunityScore,
            scoreBreakdown: scoreData.scoreBreakdown,
            evidenceReviewQuotes: item.evidenceReviewQuotes || [],
            validationMilestones: item.validationMilestones || [
              'Build proof-of-concept benchmark',
              'Interview 10 churning customers',
              'Launch MVP landing page test',
            ],
            status: 'forecasted',
            createdAt: new Date().toISOString(),
          };
        });
      }
    } catch (err) {
      console.warn('[forecastFutureWeaknessesWithAI] Gemini API error, falling back to deterministic synthesis:', err);
    }
  }

  // Fallback synthesis based on stored complaint trends
  return synthesizeFallbackForecasts(apps, themes, reviews);
}

function synthesizeFallbackForecasts(apps: Application[], themes: ComplaintTheme[], reviews: Review[]): PredictedWeakness[] {
  const result: PredictedWeakness[] = [];
  
  // Find apps with slow update frequency or high bug mentions
  const vulnerableApps = apps.filter((a) => 
    a.updateFrequency === 'Stale' || 
    a.updateFrequency === 'Quarterly' || 
    a.updateFrequency === 'Monthly' ||
    a.hasBugMentions
  );

  for (let i = 0; i < Math.min(3, vulnerableApps.length); i++) {
    const app = vulnerableApps[i];
    const relatedTheme = themes.find((t) => t.affectedApps.includes(app.id)) || themes[i % themes.length];
    const relatedReviews = reviews.filter((r) => r.appId === app.id && r.starRating <= 2);
    const quotes = relatedReviews.slice(0, 2).map((r) => r.text.slice(0, 140) + '...');

    const churnPct = Math.min(42, Math.max(18, Math.round(30 - app.rating * 3 + i * 4)));
    const scoreData = calculateFutureOpportunityScore({
      trendVelocity: 'Accelerating',
      severity: relatedTheme?.severity || 'High',
      updateFrequency: app.updateFrequency,
      affectedCompetitorCount: 1,
      estimatedChurnRiskPct: churnPct,
    });

    result.push({
      id: `forecast_syn_${Date.now()}_${i}`,
      competitorAppIds: [app.id],
      competitorAppNames: [app.name],
      weaknessTitle: `Predictive Churn Risk: Escalating ${relatedTheme?.category || 'Reliability'} Failures in ${app.name}`,
      category: relatedTheme?.category || 'Performance & Reliability',
      rootCauseTrend: `Slow release velocity (${app.updateFrequency}) compounds unresolved customer friction, creating a critical vulnerability window as user frustration compounds.`,
      forecastedWindowMonths: app.updateFrequency === 'Stale' || app.updateFrequency === 'Quarterly' ? 3 : 6,
      estimatedChurnRiskPct: churnPct,
      marketGapSummary: `Power users are actively searching for lighter, modern alternatives with superior reliability and transparent feature iteration.`,
      suggestedWedgeFeature: `Zero-overhead, local-first alternative specifically engineered to bypass ${app.name}'s performance bottlenecks.`,
      futureOpportunityScore: scoreData.futureOpportunityScore,
      scoreBreakdown: scoreData.scoreBreakdown,
      evidenceReviewQuotes: quotes.length > 0 ? quotes : ['Repeated workflow disruption without resolution across multiple updates.'],
      validationMilestones: [
        `Run migration survey targeted at ${app.name} community`,
        `Prototype core workflow comparison demo`,
        `Pre-sell founding tier to 20 power users`,
      ],
      status: 'forecasted',
      createdAt: new Date().toISOString(),
    });
  }

  return result;
}
