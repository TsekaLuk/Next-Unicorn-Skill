import type { Detection } from '../analyzer/scanner.js';
import type { VerificationResult } from '../verifier/context7.js';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface ScoringConfig {
  /** Priority domain boost multiplier (default: 1.2) */
  priorityBoost?: number;
  /** Maximum composite score cap (default: 10) */
  maxComposite?: number;
  /** Base effort hours per line (default: 0.1) */
  baseEffortPerLine?: number;
  /** Risk multipliers for effort: [low, medium, high] */
  riskMultipliers?: [number, number, number];
}

export interface ScoringInput {
  detection: Detection;
  verification: VerificationResult;
  weights?: Record<string, number>; // 7 dimension weights
  priorityFocusAreas?: string[];
  config?: ScoringConfig;

  /**
   * Optional dimension score overrides from the AI agent.
   * Keys are dimension names (e.g., "security", "ux"), values are scores 1–10.
   * When provided, these override the confidence-based defaults.
   * The AI agent can provide more accurate scores based on code context.
   */
  dimensionHints?: Partial<Record<string, number>>;

  /**
   * Optional base effort in hours from the AI agent.
   * When provided, overrides the default effort estimation.
   * The AI agent can estimate more accurately based on code complexity.
   */
  baseEffortHours?: number;
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

/** Default priority domain boost multiplier */
const DEFAULT_PRIORITY_BOOST = 1.2;

/** Default maximum composite score (cap) */
const DEFAULT_MAX_COMPOSITE = 10;

/** Default risk multipliers: [low, medium, high] */
const DEFAULT_RISK_MULTIPLIERS: [number, number, number] = [1.0, 1.5, 2.5];

/** Default base effort per line */
const DEFAULT_BASE_EFFORT_PER_LINE = 0.1;

/** Default base effort when not provided by AI agent */
const DEFAULT_BASE_EFFORT_HOURS = 2.0;

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
 * Scoring strategy:
 * - If AI agent provides `dimensionHints`, use those as dimension scores
 * - Otherwise, derive scores from confidence level (uniform across dimensions)
 * - Computes composite score using provided or default weights
 * - Applies priority domain boost (1.2x, capped at 10) if domain is in priorityFocusAreas
 * - Derives migrationRisk from confidence and verification status
 * - Estimates effort using AI agent's baseEffortHours if provided, or line-count heuristic
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 5.2
 */
export function computeImpactScore(input: ScoringInput): ScoringOutput {
  const { detection, verification, weights, priorityFocusAreas } = input;

  // --- Step 1: Generate dimension scores ---
  const dimensionScores = generateDimensionScores(detection, input.dimensionHints);

  // --- Step 2: Build weights map ---
  const effectiveWeights: Record<string, number> = {};
  for (const dim of DIMENSIONS) {
    effectiveWeights[dim] = weights?.[dim] ?? DEFAULT_WEIGHT;
  }

  // --- Step 3: Compute composite ---
  let composite = computeCompositeScore(dimensionScores, effectiveWeights);

  // --- Step 4: Apply priority domain boost ---
  const priorityBoost = input.config?.priorityBoost ?? DEFAULT_PRIORITY_BOOST;
  const maxComposite = input.config?.maxComposite ?? DEFAULT_MAX_COMPOSITE;
  if (priorityFocusAreas && priorityFocusAreas.includes(detection.domain)) {
    composite = Math.round(Math.min(composite * priorityBoost, maxComposite) * 10) / 10;
  }

  // --- Step 5: Derive migration risk ---
  const migrationRisk = deriveMigrationRisk(detection.confidenceScore, verification.status);

  // --- Step 6: Estimate effort ---
  const estimatedEffort = estimateEffort(detection, migrationRisk, input.config, input.baseEffortHours);

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
 * Generate dimension scores (1–10 integers) based on:
 * - AI agent-provided dimension hints (if available), OR
 * - Confidence-based uniform scores (default fallback)
 *
 * When no hints are provided, all dimensions get the same base score derived
 * from the detection's confidence level. The AI agent can provide more
 * nuanced per-dimension scores based on its understanding of the code.
 */
function generateDimensionScores(
  detection: Detection,
  dimensionHints?: Partial<Record<string, number>>,
): Record<string, number> {
  const { confidenceScore } = detection;

  // Base score derived from confidence: maps [0, 1] → [3, 7]
  const baseScore = Math.round(3 + confidenceScore * 4);

  const scores: Record<string, number> = {};

  for (const dim of DIMENSIONS) {
    const hint = dimensionHints?.[dim];
    if (hint !== undefined) {
      // AI agent provided a score — clamp to [1, 10]
      scores[dim] = Math.max(1, Math.min(10, Math.round(hint)));
    } else {
      // Default: uniform score based on confidence
      scores[dim] = Math.max(1, Math.min(10, baseScore));
    }
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
 * Uses AI agent's baseEffortHours if provided, otherwise falls back to
 * a simple line-count heuristic. Multiplied by risk factor.
 */
function estimateEffort(
  detection: Detection,
  migrationRisk: 'low' | 'medium' | 'high',
  config?: ScoringConfig,
  baseEffortHours?: number,
): number {
  const lineCount = detection.lineRange.end - detection.lineRange.start + 1;
  const perLine = config?.baseEffortPerLine ?? DEFAULT_BASE_EFFORT_PER_LINE;
  const [lowMul, medMul, highMul] = config?.riskMultipliers ?? DEFAULT_RISK_MULTIPLIERS;

  // Base effort: AI agent override, or simple line-count heuristic
  const baseEffort = baseEffortHours ?? (DEFAULT_BASE_EFFORT_HOURS + lineCount * perLine);

  // Risk multiplier
  const riskMultiplier = migrationRisk === 'low' ? lowMul : migrationRisk === 'medium' ? medMul : highMul;

  return Math.round(baseEffort * riskMultiplier * 10) / 10;
}
