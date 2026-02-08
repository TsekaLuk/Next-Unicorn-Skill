import type { Detection } from '../analyzer/scanner.js';
import type { VerificationResult } from '../verifier/context7.js';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface ScoringInput {
  detection: Detection;
  verification: VerificationResult;
  weights?: Record<string, number>; // 7 dimension weights
  priorityFocusAreas?: string[];
}

export interface ScoringOutput {
  scores: {
    scalability: number;
    performance: number;
    security: number;
    maintainability: number;
    feature_richness: number;
    ux: number;
    ui_aesthetics: number;
    composite: number;
  };
  migrationRisk: 'low' | 'medium' | 'high';
  estimatedEffort: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DIMENSIONS = [
  'scalability',
  'performance',
  'security',
  'maintainability',
  'feature_richness',
  'ux',
  'ui_aesthetics',
] as const;

type Dimension = (typeof DIMENSIONS)[number];

const DEFAULT_WEIGHT = 1 / 7;

/** Priority domain boost multiplier */
const PRIORITY_BOOST = 1.2;

/** Maximum composite score (cap) */
const MAX_COMPOSITE = 10;

// ---------------------------------------------------------------------------
// Domain → dimension affinity mapping
// ---------------------------------------------------------------------------

/**
 * Maps each Vibe Coding domain to the dimensions it most strongly affects.
 * Dimensions listed here get a boost based on the detection's confidence.
 */
const DOMAIN_DIMENSION_AFFINITY: Record<string, Partial<Record<Dimension, number>>> = {
  // A. UX / Design
  'ux-completeness': { ux: 1.4, ui_aesthetics: 1.3, feature_richness: 1.1 },
  'ui-aesthetics': { ui_aesthetics: 1.4, ux: 1.2, feature_richness: 1.1 },
  'design-system': { ui_aesthetics: 1.3, maintainability: 1.3, ux: 1.1 },
  'theming-dark-mode': { ui_aesthetics: 1.3, ux: 1.2, maintainability: 1.1 },
  'a11y-accessibility': { ux: 1.4, feature_richness: 1.2, maintainability: 1.1 },
  'responsive-mobile-ux': { ux: 1.3, ui_aesthetics: 1.2, performance: 1.1 },
  'empty-loading-error-states': { ux: 1.4, ui_aesthetics: 1.2, feature_richness: 1.1 },
  'forms-ux': { ux: 1.3, feature_richness: 1.2, maintainability: 1.1 },
  'validation-feedback': { ux: 1.3, security: 1.2, maintainability: 1.1 },
  'navigation-information-architecture': { ux: 1.3, feature_richness: 1.2, maintainability: 1.1 },
  'notifications-inapp': { ux: 1.3, feature_richness: 1.2, scalability: 1.1 },
  'tables-data-grid-ux': { ux: 1.3, performance: 1.2, feature_richness: 1.1 },
  'filters-sort-search-ux': { ux: 1.3, performance: 1.2, feature_richness: 1.1 },
  'onboarding-guided-tour': { ux: 1.4, ui_aesthetics: 1.2, feature_richness: 1.1 },

  // B. SEO / i18n / Content
  'seo': { performance: 1.2, feature_richness: 1.3, scalability: 1.1 },
  'i18n': { ux: 1.3, maintainability: 1.2, feature_richness: 1.1 },
  'localization-ux': { ux: 1.3, feature_richness: 1.2, maintainability: 1.1 },
  'content-marketing': { ux: 1.2, maintainability: 1.2, feature_richness: 1.1 },
  'landing-page-conversion': { ux: 1.3, ui_aesthetics: 1.2, performance: 1.1 },

  // C. Growth / Data
  'growth-hacking': { feature_richness: 1.3, ux: 1.2, scalability: 1.1 },
  'analytics-tracking': { feature_richness: 1.3, scalability: 1.2, security: 1.1 },
  'attribution-measurement': { feature_richness: 1.3, scalability: 1.2, security: 1.1 },
  'ab-testing-experimentation': { feature_richness: 1.3, scalability: 1.2, maintainability: 1.1 },
  'product-led-growth': { ux: 1.3, feature_richness: 1.2, scalability: 1.1 },
  'retention-lifecycle-crm': { feature_richness: 1.3, scalability: 1.2, ux: 1.1 },
  'referrals-virality': { feature_richness: 1.3, scalability: 1.2, ux: 1.1 },

  // D. App / Frontend Architecture
  'agent-architecture': { maintainability: 1.3, scalability: 1.2, feature_richness: 1.1 },
  'frontend-architecture': { maintainability: 1.3, performance: 1.2, scalability: 1.1 },
  'state-management': { maintainability: 1.3, performance: 1.2, scalability: 1.1 },
  'data-fetching-caching': { performance: 1.3, scalability: 1.2, maintainability: 1.1 },
  'error-handling-resilience': { maintainability: 1.3, security: 1.2, ux: 1.1 },
  'realtime-collaboration': { scalability: 1.3, performance: 1.2, feature_richness: 1.1 },
  'file-upload-media': { feature_richness: 1.3, ux: 1.2, security: 1.1 },
  'search-discovery': { performance: 1.3, feature_richness: 1.2, ux: 1.1 },

  // E. Backend / Platform
  'api-design-contracts': { maintainability: 1.3, scalability: 1.2, security: 1.1 },
  'backend-architecture': { maintainability: 1.3, scalability: 1.2, performance: 1.1 },
  'database-orm-migrations': { maintainability: 1.3, scalability: 1.2, security: 1.1 },
  'caching-rate-limit': { performance: 1.3, scalability: 1.2, security: 1.1 },
  'jobs-queue-scheduler': { scalability: 1.3, maintainability: 1.2, performance: 1.1 },
  'webhooks-integrations': { scalability: 1.3, maintainability: 1.2, feature_richness: 1.1 },
  'feature-flags-config': { maintainability: 1.3, feature_richness: 1.2, scalability: 1.1 },
  'multi-tenancy-saas': { scalability: 1.3, security: 1.2, maintainability: 1.1 },

  // F. Security / Compliance
  'auth-security': { security: 1.4, maintainability: 1.2, performance: 1.1 },
  'permissions-rbac-ux': { security: 1.3, ux: 1.2, maintainability: 1.1 },
  'security-hardening': { security: 1.4, performance: 1.1, maintainability: 1.1 },
  'privacy-compliance': { security: 1.3, maintainability: 1.2, feature_richness: 1.1 },
  'fraud-abuse-prevention': { security: 1.4, scalability: 1.2, performance: 1.1 },

  // G. Observability / Ops
  'observability': { maintainability: 1.3, performance: 1.2, security: 1.1 },
  'logging-tracing-metrics': { maintainability: 1.3, performance: 1.2, scalability: 1.1 },
  'error-monitoring': { maintainability: 1.3, security: 1.2, ux: 1.1 },
  'alerting-incident-response': { maintainability: 1.3, scalability: 1.2, security: 1.1 },

  // H. Delivery / Quality / DevEx
  'testing-strategy': { maintainability: 1.3, security: 1.2, performance: 1.1 },
  'ci-cd-release': { maintainability: 1.3, scalability: 1.2, performance: 1.1 },
  'devex-tooling': { maintainability: 1.3, performance: 1.2, feature_richness: 1.1 },
  'documentation-sop': { maintainability: 1.3, feature_richness: 1.1, ux: 1.1 },
  'code-quality-linting': { maintainability: 1.3, security: 1.2, performance: 1.1 },
  'dependency-management': { maintainability: 1.3, security: 1.2, scalability: 1.1 },

  // I. Performance / Cost
  'performance-web-vitals': { performance: 1.4, ux: 1.2, scalability: 1.1 },
  'backend-performance': { performance: 1.4, scalability: 1.2, maintainability: 1.1 },
  'cost-optimization': { performance: 1.3, scalability: 1.2, maintainability: 1.1 },

  // J. AI Engineering
  'ai-model-serving': { performance: 1.3, scalability: 1.3, security: 1.1 },
  'ai-evaluation-observability': { maintainability: 1.3, performance: 1.2, security: 1.1 },
  'rag-vector-search': { performance: 1.3, scalability: 1.2, feature_richness: 1.1 },

  // K. Business domains
  'cross-border-ecommerce': { security: 1.3, feature_richness: 1.2, scalability: 1.1 },
  'payments-billing': { security: 1.4, scalability: 1.2, feature_richness: 1.1 },
  'marketplace-platform': { scalability: 1.3, feature_richness: 1.2, security: 1.1 },
};

// ---------------------------------------------------------------------------
// computeCompositeScore — pure function
// ---------------------------------------------------------------------------

/**
 * Compute the weighted average composite score from dimension scores and weights.
 *
 * Formula: sum(score_i * weight_i) / sum(weight_i), rounded to one decimal place.
 *
 * If the sum of weights is zero or negative, falls back to equal weights.
 *
 * Requirements: 3.2, 3.3
 */
export function computeCompositeScore(
  dimensionScores: Record<string, number>,
  weights: Record<string, number>,
): number {
  let weightedSum = 0;
  let weightSum = 0;

  for (const dim of DIMENSIONS) {
    const score = dimensionScores[dim];
    const weight = weights[dim];
    if (score !== undefined && weight !== undefined) {
      weightedSum += score * weight;
      weightSum += weight;
    }
  }

  // Fallback to equal weights if weight sum is not positive
  if (weightSum <= 0) {
    weightedSum = 0;
    weightSum = 0;
    for (const dim of DIMENSIONS) {
      const score = dimensionScores[dim];
      if (score !== undefined) {
        weightedSum += score * DEFAULT_WEIGHT;
        weightSum += DEFAULT_WEIGHT;
      }
    }
  }

  if (weightSum <= 0) return 1;

  const raw = weightedSum / weightSum;
  return Math.round(raw * 10) / 10;
}

// ---------------------------------------------------------------------------
// computeImpactScore — main scoring function
// ---------------------------------------------------------------------------

/**
 * Compute the full 7-dimension impact score for a detection + verification pair.
 *
 * - Generates dimension scores based on the detection's domain and confidence
 * - Computes composite score using provided or default weights
 * - Applies priority domain boost (1.2x, capped at 10) if domain is in priorityFocusAreas
 * - Derives migrationRisk from confidence and verification status
 * - Estimates effort in developer-hours
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 5.2
 */
export function computeImpactScore(input: ScoringInput): ScoringOutput {
  const { detection, verification, weights, priorityFocusAreas } = input;

  // --- Step 1: Generate dimension scores ---
  const dimensionScores = generateDimensionScores(detection);

  // --- Step 2: Build weights map ---
  const effectiveWeights: Record<string, number> = {};
  for (const dim of DIMENSIONS) {
    effectiveWeights[dim] = weights?.[dim] ?? DEFAULT_WEIGHT;
  }

  // --- Step 3: Compute composite ---
  let composite = computeCompositeScore(dimensionScores, effectiveWeights);

  // --- Step 4: Apply priority domain boost ---
  if (priorityFocusAreas && priorityFocusAreas.includes(detection.domain)) {
    composite = Math.round(Math.min(composite * PRIORITY_BOOST, MAX_COMPOSITE) * 10) / 10;
  }

  // --- Step 5: Derive migration risk ---
  const migrationRisk = deriveMigrationRisk(detection.confidenceScore, verification.status);

  // --- Step 6: Estimate effort ---
  const estimatedEffort = estimateEffort(detection, migrationRisk);

  return {
    scores: {
      scalability: dimensionScores['scalability']!,
      performance: dimensionScores['performance']!,
      security: dimensionScores['security']!,
      maintainability: dimensionScores['maintainability']!,
      feature_richness: dimensionScores['feature_richness']!,
      ux: dimensionScores['ux']!,
      ui_aesthetics: dimensionScores['ui_aesthetics']!,
      composite,
    },
    migrationRisk,
    estimatedEffort,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Generate dimension scores (1–10 integers) based on the detection's domain
 * and confidence score. Uses domain affinity to boost relevant dimensions.
 */
function generateDimensionScores(detection: Detection): Record<string, number> {
  const { domain, confidenceScore } = detection;
  const affinity = DOMAIN_DIMENSION_AFFINITY[domain] ?? {};

  // Base score derived from confidence: higher confidence → higher base score
  // Maps confidence [0, 1] to base score [3, 7]
  const baseScore = Math.round(3 + confidenceScore * 4);

  const scores: Record<string, number> = {};

  for (const dim of DIMENSIONS) {
    const boost = affinity[dim] ?? 1.0;
    const raw = baseScore * boost;
    // Clamp to [1, 10] and round to integer
    scores[dim] = Math.max(1, Math.min(10, Math.round(raw)));
  }

  return scores;
}

/**
 * Derive migration risk from confidence score and verification status.
 *
 * - High confidence + verified → low risk
 * - Medium confidence or unverified → medium risk
 * - Low confidence or unavailable verification → high risk
 */
function deriveMigrationRisk(
  confidenceScore: number,
  verificationStatus: VerificationResult['status'],
): 'low' | 'medium' | 'high' {
  if (verificationStatus === 'unavailable') return 'high';
  if (confidenceScore >= 0.7 && verificationStatus === 'verified') return 'low';
  if (confidenceScore >= 0.4) return 'medium';
  return 'high';
}

/**
 * Estimate migration effort in developer-hours.
 *
 * Based on the size of the code range being replaced and the migration risk.
 */
function estimateEffort(
  detection: Detection,
  migrationRisk: 'low' | 'medium' | 'high',
): number {
  const lineCount = detection.lineRange.end - detection.lineRange.start + 1;

  // Base effort: roughly 0.5 hours per line of code being replaced
  const baseEffort = Math.max(1, lineCount * 0.5);

  // Risk multiplier
  const riskMultiplier = migrationRisk === 'low' ? 1.0 : migrationRisk === 'medium' ? 1.5 : 2.5;

  return Math.round(baseEffort * riskMultiplier * 10) / 10;
}
