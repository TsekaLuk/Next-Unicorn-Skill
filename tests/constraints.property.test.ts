import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { filterByLicense, detectDependencyConflicts } from '../src/utils/constraint-filter.js';
import type { RecommendedChange } from '../src/schemas/output.schema.js';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const migrationRiskArb = fc.constantFrom('low' as const, 'medium' as const, 'high' as const);

/** Safe non-empty string for file paths and identifiers */
const safeString = fc.stringMatching(/^[a-z][a-z0-9_/.-]{0,30}$/);

/** Integer dimension score in [1, 10] */
const dimensionScoreArb = fc.integer({ min: 1, max: 10 });

/** Composite score in [1, 10] with one decimal place */
const compositeScoreArb = fc.integer({ min: 10, max: 100 }).map((n) => n / 10);

/** Confidence score in [0, 1] */
const confidenceArb = fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true });

/** License identifiers used in tests */
const licenseArb = fc.constantFrom(
  'MIT',
  'Apache-2.0',
  'BSD-3-Clause',
  'ISC',
  'GPL-3.0',
  'LGPL-2.1',
  'MPL-2.0',
  'AGPL-3.0',
  'Unlicense',
  'BSD-2-Clause',
);

/** A valid RecommendedChange arbitrary */
const recommendedChangeArb: fc.Arbitrary<RecommendedChange> = fc
  .record({
    filePath: safeString,
    lineStart: fc.integer({ min: 1, max: 500 }),
    lineEnd: fc.integer({ min: 1, max: 1000 }),
    patternCategory: safeString,
    confidenceScore: confidenceArb,
    libraryName: safeString,
    libraryVersion: safeString,
    license: licenseArb,
    domain: safeString,
    scalability: dimensionScoreArb,
    performance: dimensionScoreArb,
    security: dimensionScoreArb,
    maintainability: dimensionScoreArb,
    feature_richness: dimensionScoreArb,
    ux: dimensionScoreArb,
    ui_aesthetics: dimensionScoreArb,
    composite: compositeScoreArb,
    migrationRisk: migrationRiskArb,
    estimatedEffort: fc.double({ min: 0.1, max: 1000, noNaN: true, noDefaultInfinity: true }),
    verificationStatus: fc.constantFrom(
      'verified' as const,
      'unverified' as const,
      'unavailable' as const,
    ),
  })
  .filter((r) => r.lineStart <= r.lineEnd)
  .map((r) => ({
    currentImplementation: {
      filePath: r.filePath,
      lineRange: { start: r.lineStart, end: r.lineEnd },
      patternCategory: r.patternCategory,
      confidenceScore: r.confidenceScore,
    },
    recommendedLibrary: {
      name: r.libraryName,
      version: r.libraryVersion,
      license: r.license,
    },
    domain: r.domain,
    impactScores: {
      scalability: r.scalability,
      performance: r.performance,
      security: r.security,
      maintainability: r.maintainability,
      feature_richness: r.feature_richness,
      ux: r.ux,
      ui_aesthetics: r.ui_aesthetics,
      composite: r.composite,
    },
    migrationRisk: r.migrationRisk,
    estimatedEffort: r.estimatedEffort,
    verificationStatus: r.verificationStatus,
  }));

// ---------------------------------------------------------------------------
// Property 12: License constraint filtering
// ---------------------------------------------------------------------------

describe('Feature: next-unicorn, Property 12: License constraint filtering', () => {
  /**
   * **Validates: Requirements 7.5, 9.3**
   *
   * For any InputSchema with a non-empty licenseAllowlist and any recommendation
   * whose library license is not in that allowlist, the final
   * OutputSchema.recommendedChanges SHALL NOT contain that recommendation.
   */

  it('non-allowed licenses are excluded from output', () => {
    fc.assert(
      fc.property(
        fc.array(recommendedChangeArb, { minLength: 1, maxLength: 15 }),
        fc.array(licenseArb, { minLength: 1, maxLength: 5 }),
        (recommendations, allowlist) => {
          const result = filterByLicense(recommendations, allowlist);
          const allowSet = new Set<string>(allowlist);

          // Every kept recommendation must have an allowed license
          for (const rec of result.recommendations) {
            expect(allowSet.has(rec.recommendedLibrary.license)).toBe(true);
          }

          // Every excluded recommendation must have a non-allowed license
          for (const excl of result.exclusions) {
            expect(allowSet.has(excl.license)).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('kept + excluded counts equal original count', () => {
    fc.assert(
      fc.property(
        fc.array(recommendedChangeArb, { minLength: 0, maxLength: 15 }),
        fc.array(licenseArb, { minLength: 1, maxLength: 5 }),
        (recommendations, allowlist) => {
          const result = filterByLicense(recommendations, allowlist);

          expect(result.recommendations.length + result.exclusions.length).toBe(
            recommendations.length,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it('empty allowlist means no filtering — all pass through', () => {
    fc.assert(
      fc.property(
        fc.array(recommendedChangeArb, { minLength: 0, maxLength: 15 }),
        (recommendations) => {
          const result = filterByLicense(recommendations, []);

          expect(result.recommendations.length).toBe(recommendations.length);
          expect(result.exclusions.length).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('exclusion records contain the correct library name and license', () => {
    fc.assert(
      fc.property(
        fc.array(recommendedChangeArb, { minLength: 1, maxLength: 10 }),
        fc.array(licenseArb, { minLength: 1, maxLength: 3 }),
        (recommendations, allowlist) => {
          const result = filterByLicense(recommendations, allowlist);

          // Build a map of excluded library names to their licenses from original data
          const allowSet = new Set<string>(allowlist);
          const expectedExclusions = recommendations.filter(
            (r) => !allowSet.has(r.recommendedLibrary.license),
          );

          expect(result.exclusions.length).toBe(expectedExclusions.length);

          for (let i = 0; i < result.exclusions.length; i++) {
            const excl = result.exclusions[i]!;
            const expected = expectedExclusions[i]!;
            expect(excl.libraryName).toBe(expected.recommendedLibrary.name);
            expect(excl.license).toBe(expected.recommendedLibrary.license);
            expect(excl.reason.length).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('when all licenses are allowed, nothing is excluded', () => {
    fc.assert(
      fc.property(
        fc.array(recommendedChangeArb, { minLength: 1, maxLength: 10 }),
        (recommendations) => {
          // Build an allowlist that contains every license in the recommendations
          const allLicenses = recommendations.map((r) => r.recommendedLibrary.license);
          const result = filterByLicense(recommendations, allLicenses);

          expect(result.recommendations.length).toBe(recommendations.length);
          expect(result.exclusions.length).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 13: Dependency conflict sets high migration risk
// ---------------------------------------------------------------------------

describe('Feature: next-unicorn, Property 13: Dependency conflict sets high migration risk', () => {
  /**
   * **Validates: Requirements 9.2**
   *
   * For any recommendation where the recommended library version conflicts
   * with an existing dependency in currentLibraries, the migrationRisk
   * SHALL be "high".
   */

  it('conflicting dependencies have migrationRisk set to "high"', () => {
    fc.assert(
      fc.property(
        fc.array(recommendedChangeArb, { minLength: 1, maxLength: 15 }),
        (recommendations) => {
          // Build currentLibraries that conflict with some recommendations
          const currentLibraries: Record<string, string> = {};
          for (const rec of recommendations) {
            // Add every recommended library to currentLibraries with a different version
            currentLibraries[rec.recommendedLibrary.name] = '0.0.0-conflict';
          }

          const result = detectDependencyConflicts(recommendations, currentLibraries);

          // Every recommendation should now have migrationRisk "high"
          for (const rec of result) {
            expect(rec.migrationRisk).toBe('high');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('non-conflicting dependencies preserve original migrationRisk', () => {
    fc.assert(
      fc.property(
        fc.array(recommendedChangeArb, { minLength: 1, maxLength: 15 }),
        (recommendations) => {
          // Empty currentLibraries — no conflicts possible
          const result = detectDependencyConflicts(recommendations, {});

          // Original migrationRisk should be preserved
          for (let i = 0; i < result.length; i++) {
            expect(result[i]!.migrationRisk).toBe(recommendations[i]!.migrationRisk);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('output array length matches input array length', () => {
    fc.assert(
      fc.property(
        fc.array(recommendedChangeArb, { minLength: 0, maxLength: 15 }),
        fc.dictionary(safeString, safeString, { minKeys: 0, maxKeys: 10 }),
        (recommendations, currentLibraries) => {
          const result = detectDependencyConflicts(recommendations, currentLibraries);
          expect(result.length).toBe(recommendations.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('only matching library names trigger high risk', () => {
    fc.assert(
      fc.property(
        fc.array(recommendedChangeArb, { minLength: 1, maxLength: 10 }),
        fc.dictionary(safeString, safeString, { minKeys: 0, maxKeys: 10 }),
        (recommendations, currentLibraries) => {
          const result = detectDependencyConflicts(recommendations, currentLibraries);

          for (let i = 0; i < result.length; i++) {
            const rec = result[i]!;
            const original = recommendations[i]!;
            const libraryName = original.recommendedLibrary.name;

            if (libraryName in currentLibraries) {
              // Conflict detected — must be high
              expect(rec.migrationRisk).toBe('high');
            } else {
              // No conflict — original risk preserved
              expect(rec.migrationRisk).toBe(original.migrationRisk);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('partial conflicts only affect matching recommendations', () => {
    fc.assert(
      fc.property(
        fc.array(recommendedChangeArb, { minLength: 2, maxLength: 10 }),
        (recommendations) => {
          // Only add the first recommendation's library to currentLibraries
          const currentLibraries: Record<string, string> = {
            [recommendations[0]!.recommendedLibrary.name]: '99.99.99',
          };

          const result = detectDependencyConflicts(recommendations, currentLibraries);

          // First recommendation should be high risk
          expect(result[0]!.migrationRisk).toBe('high');

          // Others should keep original risk (unless they happen to share the same library name)
          for (let i = 1; i < result.length; i++) {
            const libName = recommendations[i]!.recommendedLibrary.name;
            if (libName in currentLibraries) {
              expect(result[i]!.migrationRisk).toBe('high');
            } else {
              expect(result[i]!.migrationRisk).toBe(recommendations[i]!.migrationRisk);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
