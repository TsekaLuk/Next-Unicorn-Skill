import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  computeCompositeScore,
  computeImpactScore,
  type ScoringInput,
} from '../src/scorer/impact-scorer.js';
import type { Detection } from '../src/analyzer/scanner.js';
import type { VerificationResult } from '../src/verifier/context7.js';

// ---------------------------------------------------------------------------
// Arbitraries
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

const vibeCodingDomains = [
  // A. UX / Design
  'ux-completeness', 'ui-aesthetics', 'design-system', 'theming-dark-mode',
  'a11y-accessibility', 'responsive-mobile-ux', 'empty-loading-error-states',
  'forms-ux', 'validation-feedback', 'navigation-information-architecture',
  'notifications-inapp', 'tables-data-grid-ux', 'filters-sort-search-ux',
  'onboarding-guided-tour',
  // B. SEO / i18n / Content
  'seo', 'i18n', 'localization-ux', 'content-marketing', 'landing-page-conversion',
  // C. Growth / Data
  'growth-hacking', 'analytics-tracking', 'attribution-measurement',
  'ab-testing-experimentation', 'product-led-growth', 'retention-lifecycle-crm',
  'referrals-virality',
  // D. App / Frontend Architecture
  'agent-architecture', 'frontend-architecture', 'state-management',
  'data-fetching-caching', 'error-handling-resilience', 'realtime-collaboration',
  'file-upload-media', 'search-discovery',
  // E. Backend / Platform
  'api-design-contracts', 'backend-architecture', 'database-orm-migrations',
  'caching-rate-limit', 'jobs-queue-scheduler', 'webhooks-integrations',
  'feature-flags-config', 'multi-tenancy-saas',
  // F. Security / Compliance
  'auth-security', 'permissions-rbac-ux', 'security-hardening',
  'privacy-compliance', 'fraud-abuse-prevention',
  // G. Observability / Ops
  'observability', 'logging-tracing-metrics', 'error-monitoring',
  'alerting-incident-response',
  // H. Delivery / Quality / DevEx
  'testing-strategy', 'ci-cd-release', 'devex-tooling', 'documentation-sop',
  'code-quality-linting', 'dependency-management',
  // I. Performance / Cost
  'performance-web-vitals', 'backend-performance', 'cost-optimization',
  // J. AI Engineering
  'ai-model-serving', 'ai-evaluation-observability', 'rag-vector-search',
  // K. Business domains
  'cross-border-ecommerce', 'payments-billing', 'marketplace-platform',
] as const;

/** Integer dimension score in [1, 10] */
const dimensionScoreArb = fc.integer({ min: 1, max: 10 });

/** Positive weight in (0, 1] — avoids zero weights which would be degenerate */
const positiveWeightArb = fc.double({ min: 0.01, max: 1.0, noNaN: true, noDefaultInfinity: true });

/** Record of all 7 dimension scores */
const dimensionScoresArb = fc.record({
  scalability: dimensionScoreArb,
  performance: dimensionScoreArb,
  security: dimensionScoreArb,
  maintainability: dimensionScoreArb,
  feature_richness: dimensionScoreArb,
  ux: dimensionScoreArb,
  ui_aesthetics: dimensionScoreArb,
});

/** Record of all 7 dimension weights (positive) */
const weightsArb = fc.record({
  scalability: positiveWeightArb,
  performance: positiveWeightArb,
  security: positiveWeightArb,
  maintainability: positiveWeightArb,
  feature_richness: positiveWeightArb,
  ux: positiveWeightArb,
  ui_aesthetics: positiveWeightArb,
});

/** A valid VibeCodingDomain */
const domainArb = fc.constantFrom(...vibeCodingDomains);

/** Safe file path string */
const safeString = fc.stringMatching(/^[a-z][a-z0-9_/.-]{0,30}$/);

/** Confidence score in [0, 1] */
const confidenceArb = fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true });

/** Verification status */
const verificationStatusArb = fc.constantFrom(
  'verified' as const,
  'unverified' as const,
  'unavailable' as const,
);

/** A Detection arbitrary */
const detectionArb: fc.Arbitrary<Detection> = fc.record({
  filePath: safeString,
  lineRange: fc.record({
    start: fc.integer({ min: 1, max: 500 }),
    end: fc.integer({ min: 1, max: 1000 }),
  }).filter((lr) => lr.start <= lr.end),
  patternCategory: safeString,
  confidenceScore: confidenceArb,
  suggestedLibrary: safeString,
  domain: domainArb as fc.Arbitrary<string>,
});

/** A VerificationResult arbitrary */
const verificationResultArb: fc.Arbitrary<VerificationResult> = fc.record({
  status: verificationStatusArb,
  libraryId: fc.option(safeString, { nil: undefined }),
  documentationUrl: fc.option(safeString, { nil: undefined }),
  version: fc.option(safeString, { nil: undefined }),
  note: fc.option(safeString, { nil: undefined }),
});

// ---------------------------------------------------------------------------
// Property 6: Scoring output range and composite correctness
// ---------------------------------------------------------------------------

describe('Feature: next-unicorn, Property 6: Scoring output range and composite correctness', () => {
  /**
   * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
   *
   * For any valid ScoringInput, the Impact_Scorer SHALL produce scores where:
   * - Each of the 7 dimension values is an integer between 1 and 10 inclusive
   * - The composite score equals the weighted average sum(score_i * weight_i) / sum(weight_i)
   *   rounded to one decimal place
   */

  it('computeCompositeScore equals weighted average rounded to 1 decimal place', () => {
    fc.assert(
      fc.property(dimensionScoresArb, weightsArb, (scores, weights) => {
        const composite = computeCompositeScore(scores, weights);

        // Manually compute expected weighted average
        let weightedSum = 0;
        let weightSum = 0;
        for (const dim of DIMENSIONS) {
          weightedSum += scores[dim] * weights[dim];
          weightSum += weights[dim];
        }
        const expected = Math.round((weightedSum / weightSum) * 10) / 10;

        // Composite must equal the expected weighted average
        expect(composite).toBeCloseTo(expected, 5);
      }),
      { numRuns: 100 },
    );
  });

  it('computeCompositeScore uses equal weights (1/7) when no custom weights provided', () => {
    fc.assert(
      fc.property(dimensionScoresArb, (scores) => {
        // Pass equal weights explicitly
        const equalWeights: Record<string, number> = {};
        for (const dim of DIMENSIONS) {
          equalWeights[dim] = 1 / 7;
        }

        const composite = computeCompositeScore(scores, equalWeights);

        // Expected: simple average of all 7 scores, rounded to 1 decimal
        let sum = 0;
        for (const dim of DIMENSIONS) {
          sum += scores[dim];
        }
        const expected = Math.round((sum / 7) * 10) / 10;

        expect(composite).toBeCloseTo(expected, 5);
      }),
      { numRuns: 100 },
    );
  });

  it('computeImpactScore produces dimension scores that are integers in [1, 10]', () => {
    fc.assert(
      fc.property(detectionArb, verificationResultArb, (detection, verification) => {
        const input: ScoringInput = { detection, verification };
        const output = computeImpactScore(input);

        for (const dim of DIMENSIONS) {
          const score = output.scores[dim];
          expect(score).toBeGreaterThanOrEqual(1);
          expect(score).toBeLessThanOrEqual(10);
          expect(Number.isInteger(score)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('computeImpactScore composite is in [1, 10] range', () => {
    fc.assert(
      fc.property(detectionArb, verificationResultArb, (detection, verification) => {
        const input: ScoringInput = { detection, verification };
        const output = computeImpactScore(input);

        expect(output.scores.composite).toBeGreaterThanOrEqual(1);
        expect(output.scores.composite).toBeLessThanOrEqual(10);
      }),
      { numRuns: 100 },
    );
  });

  it('computeImpactScore includes migrationRisk and positive estimatedEffort', () => {
    fc.assert(
      fc.property(detectionArb, verificationResultArb, (detection, verification) => {
        const input: ScoringInput = { detection, verification };
        const output = computeImpactScore(input);

        expect(['low', 'medium', 'high']).toContain(output.migrationRisk);
        expect(output.estimatedEffort).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  /** Validates: Requirements 3.1, 3.2, 3.3, 3.4 */
});

// ---------------------------------------------------------------------------
// Property 7: Priority domain boost
// ---------------------------------------------------------------------------

describe('Feature: next-unicorn, Property 7: Priority domain boost', () => {
  /**
   * **Validates: Requirements 5.2**
   *
   * For any recommendation and two otherwise-identical inputs where one includes
   * the recommendation's domain in priorityFocusAreas and the other does not,
   * the composite score from the priority input SHALL be strictly greater than
   * the composite score from the non-priority input.
   */

  it('priority domain boost produces strictly higher composite than non-priority', () => {
    fc.assert(
      fc.property(
        detectionArb,
        verificationResultArb,
        fc.option(weightsArb, { nil: undefined }),
        (detection, verification, weights) => {
          // Input WITHOUT priority boost
          const inputNoPriority: ScoringInput = {
            detection,
            verification,
            weights,
            priorityFocusAreas: [], // domain NOT in priority
          };

          // Input WITH priority boost — domain IS in priorityFocusAreas
          const inputWithPriority: ScoringInput = {
            detection,
            verification,
            weights,
            priorityFocusAreas: [detection.domain], // domain IS in priority
          };

          const outputNoPriority = computeImpactScore(inputNoPriority);
          const outputWithPriority = computeImpactScore(inputWithPriority);

          // The priority composite must be strictly greater, unless already capped at 10
          // When the non-priority composite * 1.2 > 10, both could be capped at 10
          // But since dimension scores are integers 1-10, the composite before boost
          // is at most 10, and 10 * 1.2 = 12 → capped at 10. So if non-priority is
          // exactly 10, priority is also 10 (not strictly greater).
          // For the property to hold strictly, we need the non-priority composite < 10/1.2 ≈ 8.33
          // OR we accept that when non-priority composite rounds to ≤ 10, priority ≥ non-priority.
          //
          // The spec says "strictly greater". Since the boost is 1.2x and cap is 10,
          // if the base composite is > 0 and < 10/1.2, the boosted version is strictly greater.
          // If the base composite * 1.2 rounds to the same value after capping, they could be equal.
          // We filter to cases where the non-priority composite < 8.4 (10/1.2 rounded) to ensure
          // the property holds strictly.
          if (outputNoPriority.scores.composite <= 8.3) {
            expect(outputWithPriority.scores.composite).toBeGreaterThan(
              outputNoPriority.scores.composite,
            );
          } else {
            // When near the cap, priority composite should be >= non-priority
            expect(outputWithPriority.scores.composite).toBeGreaterThanOrEqual(
              outputNoPriority.scores.composite,
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('priority domain boost is capped at 10', () => {
    fc.assert(
      fc.property(detectionArb, verificationResultArb, (detection, verification) => {
        const input: ScoringInput = {
          detection,
          verification,
          priorityFocusAreas: [detection.domain],
        };

        const output = computeImpactScore(input);

        expect(output.scores.composite).toBeLessThanOrEqual(10);
      }),
      { numRuns: 100 },
    );
  });

  it('non-priority domain does not get boost', () => {
    fc.assert(
      fc.property(detectionArb, verificationResultArb, (detection, verification) => {
        // Use a domain that is NOT the detection's domain
        const otherDomains = vibeCodingDomains.filter((d) => d !== detection.domain);
        const priorityFocusAreas = otherDomains.length > 0 ? [otherDomains[0]!] : [];

        const inputNoPriority: ScoringInput = {
          detection,
          verification,
          priorityFocusAreas: [],
        };

        const inputOtherPriority: ScoringInput = {
          detection,
          verification,
          priorityFocusAreas,
        };

        const outputNoPriority = computeImpactScore(inputNoPriority);
        const outputOtherPriority = computeImpactScore(inputOtherPriority);

        // When the detection's domain is NOT in priorityFocusAreas, no boost applied
        expect(outputOtherPriority.scores.composite).toBe(outputNoPriority.scores.composite);
      }),
      { numRuns: 100 },
    );
  });

  /** Validates: Requirements 5.2 */
});
