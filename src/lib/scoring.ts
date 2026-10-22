import { OpportunityScoreBreakdown } from '../types.ts';

/**
 * Calculates priority score for an opportunity based on:
 * - Severity (30%): Critical=100, High=75, Medium=50, Low=25
 * - Frequency (30%): Logarithmic scaling up to 100
 * - Recency (20%): Score based on reviews recency
 * - Competitor Breadth (20%): How many competitor apps share the same complaint
 */
export function calculateOpportunityScore(params: {
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  complaintFrequency: number;
  latestReviewDate?: string;
  affectedAppCount: number;
}): { score: number; breakdown: OpportunityScoreBreakdown } {
  // 1. Severity Score (0 - 100)
  const severityMap: Record<string, number> = {
    Critical: 100,
    High: 75,
    Medium: 50,
    Low: 25,
  };
  const severityScore = severityMap[params.severity] || 50;

  // 2. Frequency Score (0 - 100)
  // 1 review -> 20, 5 reviews -> 50, 15 reviews -> 80, 30+ reviews -> 100
  const frequencyScore = Math.min(100, Math.round(Math.log10(Math.max(1, params.complaintFrequency) + 1) * 65));

  // 3. Recency Score (0 - 100)
  let recencyScore = 70;
  if (params.latestReviewDate) {
    const diffDays = Math.max(0, (Date.now() - new Date(params.latestReviewDate).getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 14) recencyScore = 100;
    else if (diffDays <= 30) recencyScore = 85;
    else if (diffDays <= 90) recencyScore = 65;
    else if (diffDays <= 180) recencyScore = 45;
    else recencyScore = 25;
  }

  // 4. Breadth Score (0 - 100)
  // Cross-app pain points have higher market demand
  const breadthScore = Math.min(100, Math.round(params.affectedAppCount * 28));

  // Weighted total: 30% Severity, 30% Frequency, 20% Recency, 20% Breadth
  const score = Math.round(
    severityScore * 0.30 +
    frequencyScore * 0.30 +
    recencyScore * 0.20 +
    breadthScore * 0.20
  );

  return {
    score: Math.min(100, Math.max(0, score)),
    breakdown: {
      severityScore,
      frequencyScore,
      recencyScore,
      breadthScore,
    },
  };
}
