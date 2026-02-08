/**
 * Update Scorer — scores dependency updates using the same 7-dimension model
 * with urgency and breakingRisk classification.
 *
 * Requirements: 11.4, 11.8
 */

import type { ImpactScores } from '../schemas/output.schema.js';
import type { VulnFinding } from '../security/vulnerability-scanner.js';
import type { UpdateCandidate } from './update-policy.js';
import type { ChangelogAnalysis } from './changelog-verifier.js';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface UpdateScoringInput {
  candidate: UpdateCandidate;
  changelog: ChangelogAnalysis;
  vulnFindings?: VulnFinding[];
}

export interface UpdateScoringOutput {
  impactScores: ImpactScores;
  /** Update urgency */
  urgency: 'routine' | 'recommended' | 'urgent' | 'critical';
  /** Risk of the update breaking the project */
  breakingRisk: 'none' | 'low' | 'medium' | 'high';
  /** Estimated effort in developer-hours */
  estimatedEffort: number;
}

// ---------------------------------------------------------------------------
// scoreUpdate
// ---------------------------------------------------------------------------

/**
 * Score a dependency update using the 7-dimension model.
 *
 * Urgency rules (Property 22):
 * - "critical": fixes a critical vulnerability
 * - "urgent": fixes a high vulnerability or deprecated package
 * - "recommended": minor version with new features
 * - "routine": patch version, no security impact
 *
 * Breaking risk rules (Property 21):
 * - "none": patch update, no breaking changes
 * - "low": minor update, no breaking changes
 * - "medium": minor update with deprecations, or major with adapter path
 * - "high": major update with confirmed breaking changes
 */
export function scoreUpdate(input: UpdateScoringInput): UpdateScoringOutput {
  const { candidate, changelog, vulnFindings } = input;

  // --- Urgency ---
  const urgency = computeUrgency(candidate, changelog, vulnFindings);

  // --- Breaking risk ---
  const breakingRisk = computeBreakingRisk(candidate, changelog);

  // --- Impact scores ---
  const impactScores = computeUpdateImpactScores(candidate, changelog, vulnFindings);

  // --- Estimated effort ---
  const estimatedEffort = computeUpdateEffort(candidate, breakingRisk);

  return {
    impactScores,
    urgency,
    breakingRisk,
    estimatedEffort,
  };
}

// ---------------------------------------------------------------------------
// computeUrgency
// ---------------------------------------------------------------------------

/**
 * Compute urgency for a dependency update.
 * Property 22: Security update urgency escalation.
 */
export function computeUrgency(
  candidate: UpdateCandidate,
  changelog: ChangelogAnalysis,
  vulnFindings?: VulnFinding[],
): 'routine' | 'recommended' | 'urgent' | 'critical' {
  // Check for vulnerability fixes
  if (vulnFindings && vulnFindings.length > 0) {
    const hasCritical = vulnFindings.some(
      (f) => f.vulnerability.severity === 'critical',
    );
    if (hasCritical) return 'critical';

    const hasHigh = vulnFindings.some(
      (f) => f.vulnerability.severity === 'high',
    );
    if (hasHigh) return 'urgent';
  }

  // Deprecated packages are urgent
  if (candidate.versionInfo.deprecated) return 'urgent';

  // Minor/major with new features = recommended
  if (
    (candidate.updateType === 'minor' || candidate.updateType === 'major') &&
    changelog.newFeatures.length > 0
  ) {
    return 'recommended';
  }

  return 'routine';
}

// ---------------------------------------------------------------------------
// computeBreakingRisk
// ---------------------------------------------------------------------------

/**
 * Compute breaking risk for a dependency update.
 * Property 21: Breaking changes require high breaking risk.
 */
export function computeBreakingRisk(
  candidate: UpdateCandidate,
  changelog: ChangelogAnalysis,
): 'none' | 'low' | 'medium' | 'high' {
  // Confirmed breaking changes → medium or high
  if (changelog.hasBreakingChanges) {
    return candidate.updateType === 'major' ? 'high' : 'medium';
  }

  // Major update even without confirmed breaks → medium
  if (candidate.updateType === 'major') return 'medium';

  // Deprecations in minor → low
  if (candidate.updateType === 'minor' && changelog.deprecations.length > 0) {
    return 'low';
  }

  // Minor with no concerns → low
  if (candidate.updateType === 'minor') return 'low';

  // Patch → none
  return 'none';
}

// ---------------------------------------------------------------------------
// computeUpdateImpactScores
// ---------------------------------------------------------------------------

function computeUpdateImpactScores(
  candidate: UpdateCandidate,
  _changelog: ChangelogAnalysis,
  vulnFindings?: VulnFinding[],
): ImpactScores {
  // Base scores for updates (moderate baseline)
  let security = 5;
  let maintainability = 6;
  let performance = 5;
  const scalability = 5;
  const featureRichness = candidate.updateType === 'major' ? 7 : 5;
  const ux = 5;
  const uiAesthetics = 5;

  // Security boost if fixing vulnerabilities
  if (vulnFindings && vulnFindings.length > 0) {
    const hasCritical = vulnFindings.some((f) => f.vulnerability.severity === 'critical');
    const hasHigh = vulnFindings.some((f) => f.vulnerability.severity === 'high');
    if (hasCritical) security = 10;
    else if (hasHigh) security = 8;
    else security = 7;
  }

  // Maintainability boost for staying up-to-date
  if (candidate.updateType === 'patch') maintainability = 7;
  if (candidate.versionInfo.deprecated) maintainability = 9;

  // Performance — minor improvements expected with updates
  if (candidate.updateType !== 'patch') performance = 6;

  // Composite: simple average
  const allScores = [
    scalability,
    performance,
    security,
    maintainability,
    featureRichness,
    ux,
    uiAesthetics,
  ];
  const composite = Math.round((allScores.reduce((a, b) => a + b, 0) / allScores.length) * 10) / 10;

  return {
    scalability,
    performance,
    security,
    maintainability,
    feature_richness: featureRichness,
    ux,
    ui_aesthetics: uiAesthetics,
    composite,
  };
}

// ---------------------------------------------------------------------------
// computeUpdateEffort
// ---------------------------------------------------------------------------

function computeUpdateEffort(
  candidate: UpdateCandidate,
  breakingRisk: 'none' | 'low' | 'medium' | 'high',
): number {
  const baseEffort: Record<string, number> = {
    patch: 0.5,
    minor: 1,
    major: 4,
  };

  const riskMultiplier: Record<string, number> = {
    none: 1,
    low: 1.2,
    medium: 1.5,
    high: 2.5,
  };

  const base = baseEffort[candidate.updateType] ?? 1;
  const mult = riskMultiplier[breakingRisk] ?? 1;

  return Math.round(base * mult * 10) / 10;
}
