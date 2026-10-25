export type Marketplace = 'googleplay' | 'steam' | 'microsoft' | 'apple';

export type AppCategory = 
  | 'Finance'
  | 'Productivity'
  | 'Healthcare'
  | 'Education'
  | 'E-commerce'
  | 'Gaming'
  | 'Fitness'
  | 'Business Software'
  | 'Developer Tools';

export type ComplaintCategory =
  | 'Bugs & Crashes'
  | 'Missing Features'
  | 'UX & Navigation'
  | 'Pricing & Subscriptions'
  | 'Billing & Payments'
  | 'Performance & Reliability'
  | 'Customer Support'
  | 'Privacy & Security'
  | 'Compatibility'
  | 'Advertising & Monetization'
  | 'Feature Requests'
  | 'Other';

export type UpdateFrequency = 'Daily' | 'Weekly' | 'Bi-weekly' | 'Monthly' | 'Quarterly' | 'Stale' | 'Unknown';

export interface Application {
  id: string;
  name: string;
  iconUrl?: string;
  publisher: string;
  marketplace: Marketplace;
  description: string;
  category: AppCategory;
  rating: number;
  ratingCount: number;
  reviewCount: number;
  metadataStatus?: 'catalog_only' | 'verified' | 'unknown';
  platform: string;
  releaseDate: string;
  lastUpdated: string;
  currentVersion: string;
  updateFrequency: UpdateFrequency;
  storeUrl: string;
  collectionAvailable: boolean;
  status: 'active' | 'indexing' | 'error';
  tags: string[];
  hasBugMentions?: boolean;
  hasFeatureRequests?: boolean;
}

export interface PredictedWeakness {
  id: string;
  competitorAppIds: string[];
  competitorAppNames: string[];
  weaknessTitle: string;
  category: ComplaintCategory;
  rootCauseTrend: string;
  forecastedWindowMonths: number; // e.g. 3, 6, 12 months
  estimatedChurnRiskPct: number; // e.g. 24%
  marketGapSummary: string;
  suggestedWedgeFeature: string;
  futureOpportunityScore: number; // 0 - 100
  scoreBreakdown: {
    trendVelocityScore: number;     // 35%: rate of complaint escalation
    severityImpactScore: number;    // 30%: operational disruption severity
    incumbentInertiaScore: number;  // 20%: sluggishness of competitor release cycle
    marketTAMReadinessScore: number;// 15%: willingness of market segment to switch
  };
  evidenceReviewQuotes: string[];
  supportingReviewIds?: string[];
  riskBasis?: 'model_estimate_from_review_evidence' | 'negative_review_share_proxy';
  validationMilestones: string[];
  status: 'forecasted' | 'validated' | 'promoted_to_opportunity';
  createdAt: string;
}

export interface AppDiscoveryFilter {
  query?: string;
  category?: string;
  marketplace?: string;
  minRating?: number;
  maxRating?: number;
  minVersion?: string;
  maxVersion?: string;
  updateFrequency?: string;
  hasFeatureRequests?: boolean;
  hasBugMentions?: boolean;
}

export interface ReviewClassification {
  category: ComplaintCategory;
  sentiment: 'negative' | 'neutral' | 'positive';
  keywords: string[];
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  isBug: boolean;
  isFeatureRequest: boolean;
  isPricingIssue: boolean;
}

export type DataProvenance = 'seed' | 'live_marketplace' | 'ai_generated' | 'calculated';

export interface Review {
  id: string; // source review identifier or composite
  provenance?: DataProvenance;
  sourceReviewId?: string;
  appId: string;
  appName: string;
  marketplace: Marketplace;
  text: string;
  starRating: number; // 1 - 5
  ratingScale?: 'stars' | 'binary_recommendation';
  reviewDate: string;
  language: string;
  reviewUrl?: string;
  helpfulVotes?: number;
  appVersion?: string;
  collectedAt: string;
  fingerprint: string;
  classification?: ReviewClassification;
  notes?: string;
  savedToCollection?: boolean;
  tagList?: string[];
}

export interface ComplaintTheme {
  id: string;
  title: string;
  category: ComplaintCategory;
  summary: string;
  reviewCount: number;
  affectedApps: string[];
  affectedAppNames: string[];
  representativeQuotes: string[];
  supportingReviewIds?: string[];
  earliestDate: string;
  latestDate: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  confidenceScore: number; // 0.0 - 1.0
  potentialImprovement: string;
  validationHypothesis: string;
  validationSteps: string[];
  trend: 'emerging' | 'stable' | 'decreasing';
  createdAt: string;
}

export interface OpportunityScoreBreakdown {
  severityScore: number;
  frequencyScore: number;
  recencyScore: number;
  breadthScore: number;
}

export interface Opportunity {
  id: string;
  title: string;
  problemStatement: string;
  targetUser: string;
  supportingAppIds: string[];
  supportingAppNames: string[];
  supportingReviewIds: string[];
  supportingReviewQuotes?: string[];
  complaintFrequency: number;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  existingSolutions: string;
  proposedConcept: string;
  differentiationHypothesis: string;
  validationQuestions: string[];
  nextSteps: string[];
  priorityScore: number; // 0 - 100
  scoreBreakdown: OpportunityScoreBreakdown;
  tags: string[];
  status: 'validating' | 'planned' | 'draft' | 'archived';
  createdAt: string;
}

export interface CollectionJob {
  id: string;
  appId: string;
  appName: string;
  marketplace: Marketplace;
  status: 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  jobType?: 'collection' | 'analysis' | 'forecast' | 'opportunities' | 'export' | 'report';
  attempts?: number;
  maxAttempts?: number;
  outcome?: 'collected' | 'empty' | 'unsupported' | 'failed';
  progress: number; // 0 - 100
  collectedCount: number;
  deduplicatedCount: number;
  error?: string;
  startedAt: string;
  completedAt?: string;
}

export interface Contact {
  id: string;
  name: string;
  title: string;
  company: string;
  email: string;
  phone?: string;
  website?: string;
  channel: 'email' | 'linkedin' | 'contact_form';
  sourceUrl: string;
  appId?: string;
  appName?: string;
  opportunityId?: string;
  status: 'New' | 'Contacted' | 'In Discussion' | 'Converted' | 'Do Not Contact';
  consentBasis: 'Legitimate Interest (B2B)' | 'Public Publisher Info' | 'Inquiry Request' | 'Unverified';
  notes?: string;
  createdAt: string;
}

export interface CampaignRecipient {
  contactId: string;
  email: string;
  company: string;
  appName: string;
  personalizedSubject: string;
  personalizedBody: string;
  status: 'pending' | 'approved' | 'queued' | 'sent' | 'delivered' | 'failed' | 'bounced' | 'unsubscribed' | 'suppressed';
  sentAt?: string;
  deliveredAt?: string;
  failureReason?: string;
}

export interface Campaign {
  id: string;
  name: string;
  objective: 'product_partnership' | 'feature_pitch' | 'advisory_discovery' | 'dev_services';
  tone: 'Consultative' | 'Founder-to-Founder' | 'Value-First' | 'Technical';
  targetCategory: string;
  templateSubject: string;
  templateBody: string;
  recipients: CampaignRecipient[];
  status: 'draft' | 'approved' | 'sending' | 'completed';
  stats: {
    total: number;
    approved: number;
    sent: number;
    delivered: number;
    opened: number;
    replied: number;
    bounced: number;
    unsubscribed: number;
    suppressed: number;
  };
  createdAt: string;
}

export interface SuppressionRecord {
  id: string;
  emailOrDomain: string;
  reason: 'unsubscribed' | 'manual_suppression' | 'bounce' | 'opt_out';
  createdAt: string;
}

export interface ResearchProject {
  id: string;
  name: string;
  description: string;
  savedAppIds: string[];
  savedReviewIds: string[];
  savedThemeIds: string[];
  savedOpportunityIds: string[];
  notes: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  timestamp: string;
}

export interface SystemStats {
  totalApps: number;
  totalReviews: number;
  negativeReviews: number;
  totalThemes: number;
  totalOpportunities: number;
  totalContacts: number;
  activeCampaigns: number;
  suppressionCount: number;
  complaintBreakdown: { category: string; count: number }[];
  marketplacesBreakdown: { marketplace: Marketplace; count: number }[];
  liveReviewCount?: number;
  demonstrationReviewCount?: number;
}
