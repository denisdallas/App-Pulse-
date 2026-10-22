import { UpdateFrequency } from '../types.ts';

/**
 * Normalizes and compares two semver or numeric version strings.
 * Returns:
 *   negative if v1 < v2
 *   0 if v1 === v2
 *   positive if v1 > v2
 */
export function compareVersions(v1: string, v2: string): number {
  const clean1 = (v1 || '').replace(/[^0-9.]/g, '');
  const clean2 = (v2 || '').replace(/[^0-9.]/g, '');

  const parts1 = clean1.split('.').map((p) => parseInt(p, 10) || 0);
  const parts2 = clean2.split('.').map((p) => parseInt(p, 10) || 0);

  const len = Math.max(parts1.length, parts2.length);
  for (let i = 0; i < len; i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;
    if (num1 !== num2) {
      return num1 - num2;
    }
  }
  return 0;
}

/**
 * Validates if an app version falls within min and max boundaries.
 */
export function isVersionInRange(version: string, minVersion?: string, maxVersion?: string): boolean {
  if (!version) return true;
  if (minVersion && minVersion.trim()) {
    if (compareVersions(version, minVersion.trim()) < 0) {
      return false;
    }
  }
  if (maxVersion && maxVersion.trim()) {
    if (compareVersions(version, maxVersion.trim()) > 0) {
      return false;
    }
  }
  return true;
}

/**
 * Calculates a Future Opportunity Score (0 - 100) forecasting competitor weaknesses and market gaps.
 * Weights:
 * - Trend Velocity Score (35%): How rapidly complaints are escalating over time.
 * - Severity Impact Score (30%): Depth of workflow disruption caused by the flaw.
 * - Incumbent Inertia Score (20%): Slower release cadence means incumbents take longer to fix.
 * - Market TAM Readiness Score (15%): Cross-competitor presence and user churn readiness.
 */
export function calculateFutureOpportunityScore(params: {
  trendVelocity: 'Accelerating' | 'Steady' | 'Decelerating';
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  updateFrequency: UpdateFrequency;
  affectedCompetitorCount: number;
  estimatedChurnRiskPct: number;
}): {
  futureOpportunityScore: number;
  scoreBreakdown: {
    trendVelocityScore: number;
    severityImpactScore: number;
    incumbentInertiaScore: number;
    marketTAMReadinessScore: number;
  };
} {
  // 1. Trend Velocity Score (0 - 100)
  const velocityMap: Record<string, number> = {
    Accelerating: 100,
    Steady: 65,
    Decelerating: 30,
  };
  const trendVelocityScore = velocityMap[params.trendVelocity] || 65;

  // 2. Severity Impact Score (0 - 100)
  const severityMap: Record<string, number> = {
    Critical: 100,
    High: 75,
    Medium: 50,
    Low: 25,
  };
  const severityImpactScore = severityMap[params.severity] || 50;

  // 3. Incumbent Inertia Score (0 - 100)
  // Slower update cadence = higher inertia = bigger window for market entry
  const inertiaMap: Record<UpdateFrequency, number> = {
    Stale: 100,
    Quarterly: 85,
    Monthly: 70,
    'Bi-weekly': 50,
    Weekly: 30,
    Daily: 15,
  };
  const incumbentInertiaScore = inertiaMap[params.updateFrequency] || 60;

  // 4. Market TAM Readiness Score (0 - 100)
  // Combined based on churn risk percentage and multi-competitor breadth
  const churnScore = Math.min(100, Math.round(params.estimatedChurnRiskPct * 2.5));
  const breadthBonus = Math.min(30, (params.affectedCompetitorCount - 1) * 15);
  const marketTAMReadinessScore = Math.min(100, Math.round(churnScore * 0.7 + breadthBonus));

  // Weighted Total
  const finalScore = Math.round(
    trendVelocityScore * 0.35 +
    severityImpactScore * 0.30 +
    incumbentInertiaScore * 0.20 +
    marketTAMReadinessScore * 0.15
  );

  return {
    futureOpportunityScore: Math.min(100, Math.max(0, finalScore)),
    scoreBreakdown: {
      trendVelocityScore,
      severityImpactScore,
      incumbentInertiaScore,
      marketTAMReadinessScore,
    },
  };
}
