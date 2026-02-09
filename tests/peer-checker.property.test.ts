import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import semver from 'semver';
import {
  checkPeerDependencies,
  classifySeverity,
  type PeerDependencyResolver,
  type PeerDependencyMap,
} from '../src/checker/peer-dependency-checker.js';
import type { RecommendedChange } from '../src/schemas/output.schema.js';

// ---------------------------------------------------------------------------
// Arbitraries — reusable generators
// ---------------------------------------------------------------------------

/** Safe non-empty string for identifiers */
const safeString = fc.stringMatching(/^[a-z][a-z0-9_-]{0,20}$/);

/** Generate a valid semver version string (e.g., "1.2.3") */
const semverVersionArb = fc
  .record({
    major: fc.integer({ min: 0, max: 30 }),
    minor: fc.integer({ min: 0, max: 30 }),
    patch: fc.integer({ min: 0, max: 30 }),
  })
  .map(({ major, minor, patch }) => `${major}.${minor}.${patch}`);

/** Generate a valid semver range string using common range operators */
const semverRangeArb = fc
  .record({
    operator: fc.constantFrom('^', '~', '>=', ''),
    major: fc.integer({ min: 0, max: 20 }),
    minor: fc.integer({ min: 0, max: 20 }),
    patch: fc.integer({ min: 0, max: 20 }),
  })
  .map(({ operator, major, minor, patch }) => `${operator}${major}.${minor}.${patch}`)
  .filter((range) => semver.validRange(range) !== null);

/** Migration risk arbitrary */
const migrationRiskArb = fc.constantFrom('low' as const, 'medium' as const, 'high' as const);

/** Integer dimension score in [1, 10] */
const dimensionScoreArb = fc.integer({ min: 1, max: 10 });

/** Composite score in [1, 10] */
const compositeScoreArb = fc.integer({ min: 10, max: 100 }).map((n) => n / 10);

/** Confidence score in [0, 1] */
const confidenceArb = fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true });

/** A valid RecommendedChange arbitrary */
const recommendedChangeArb: fc.Arbitrary<RecommendedChange> = fc
  .record({
    filePath: safeString,
    lineStart: fc.integer({ min: 1, max: 500 }),
    lineEnd: fc.integer({ min: 1, max: 1000 }),
    patternCategory: safeString,
    confidenceScore: confidenceArb,
    libraryName: safeString,
    libraryVersion: semverVersionArb,
    license: fc.constantFrom('MIT', 'Apache-2.0', 'BSD-3-Clause'),
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
    affectedFiles: fc.double({ min: 0.1, max: 1000, noNaN: true, noDefaultInfinity: true }),
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
    affectedFiles: r.affectedFiles,
    verificationStatus: r.verificationStatus,
  }));

/**
 * Generate a peer dependency entry with a known relationship to currentLibraries.
 * Returns { peerName, requiredRange, installedVersion (or undefined), expectedSeverity }.
 */
const peerDepEntryArb = fc.oneof(
  // Case 1: compatible — installed version satisfies the range
  fc
    .record({
      peerName: safeString,
      major: fc.integer({ min: 0, max: 20 }),
      minor: fc.integer({ min: 0, max: 20 }),
      patch: fc.integer({ min: 0, max: 20 }),
    })
    .map(({ peerName, major, minor, patch }) => ({
      peerName,
      requiredRange: `^${major}.${minor}.${patch}`,
      installedVersion: `${major}.${minor}.${patch}`,
      expectedSeverity: 'compatible' as const,
    })),
  // Case 2: conflict — installed version does NOT satisfy the range
  fc
    .record({
      peerName: safeString,
      major: fc.integer({ min: 1, max: 20 }),
      minor: fc.integer({ min: 0, max: 20 }),
      patch: fc.integer({ min: 0, max: 20 }),
    })
    .map(({ peerName, major, minor, patch }) => ({
      peerName,
      requiredRange: `^${major}.${minor}.${patch}`,
      // Use a version from a different major — guaranteed conflict with ^major
      installedVersion: `${major - 1}.${minor}.${patch}`,
      expectedSeverity: 'conflict' as const,
    })),
  // Case 3: missing — peer dep not in currentLibraries
  fc
    .record({
      peerName: safeString,
      major: fc.integer({ min: 0, max: 20 }),
      minor: fc.integer({ min: 0, max: 20 }),
      patch: fc.integer({ min: 0, max: 20 }),
    })
    .map(({ peerName, major, minor, patch }) => ({
      peerName,
      requiredRange: `^${major}.${minor}.${patch}`,
      installedVersion: undefined,
      expectedSeverity: 'missing' as const,
    })),
);

// ---------------------------------------------------------------------------
// Helper: compute expected severity using semver as oracle
// ---------------------------------------------------------------------------

function oracleSeverity(
  requiredRange: string,
  installedVersion: string | undefined,
): 'compatible' | 'conflict' | 'missing' {
  if (installedVersion === undefined) return 'missing';
  const coerced = semver.coerce(installedVersion);
  if (!coerced) return 'conflict';
  return semver.satisfies(coerced, requiredRange) ? 'compatible' : 'conflict';
}

// ---------------------------------------------------------------------------
// Helper: create a mock resolver from a peer dep map
// ---------------------------------------------------------------------------

function createMockResolver(
  peerDepsPerLibrary: Map<string, PeerDependencyMap>,
): PeerDependencyResolver {
  return {
    resolve: async (libraryName: string): Promise<PeerDependencyMap> => {
      return peerDepsPerLibrary.get(libraryName) ?? {};
    },
  };
}

// ---------------------------------------------------------------------------
// Property 1: Severity classification correctness
// ---------------------------------------------------------------------------

describe('Feature: peer-dependency-warnings, Property 1: Severity classification correctness', () => {
  it('classifySeverity matches semver oracle for all generated inputs', () => {
    /**
     * **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
     *
     * For any recommended library with peer dependencies and for any
     * currentLibraries map, each produced PeerDependencyWarning SHALL have
     * severity matching the semver oracle classification.
     */
    fc.assert(
      fc.property(semverRangeArb, fc.option(semverVersionArb, { nil: undefined }), (range, version) => {
        const result = classifySeverity(range, version);
        const expected = oracleSeverity(range, version);
        expect(result).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });

  it('checkPeerDependencies produces correct severity for each warning', async () => {
    /**
     * **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
     *
     * Generate random recommendations with random peer dep maps and
     * currentLibraries. Verify each warning's severity matches the
     * semver oracle.
     */
    await fc.assert(
      fc.asyncProperty(
        recommendedChangeArb,
        fc.array(peerDepEntryArb, { minLength: 1, maxLength: 5 }),
        async (rec, peerEntries) => {
          // Deduplicate peer entries by name to avoid collisions
          const uniqueEntries = new Map<string, (typeof peerEntries)[0]>();
          for (const entry of peerEntries) {
            uniqueEntries.set(entry.peerName, entry);
          }
          const entries = [...uniqueEntries.values()];

          // Build peer dep map for this recommendation
          const peerDeps: PeerDependencyMap = {};
          for (const entry of entries) {
            peerDeps[entry.peerName] = entry.requiredRange;
          }

          // Build currentLibraries from entries that have an installed version
          const currentLibraries: Record<string, string> = {};
          for (const entry of entries) {
            if (entry.installedVersion !== undefined) {
              currentLibraries[entry.peerName] = entry.installedVersion;
            }
          }

          // Create mock resolver
          const peerDepsMap = new Map<string, PeerDependencyMap>();
          peerDepsMap.set(rec.recommendedLibrary.name, peerDeps);
          const resolver = createMockResolver(peerDepsMap);

          // Run the checker
          const result = await checkPeerDependencies([rec], currentLibraries, resolver);

          // Verify we got the expected number of warnings
          expect(result.warnings.length).toBe(entries.length);

          // Verify each warning
          for (const warning of result.warnings) {
            // Find the matching entry
            const entry = entries.find((e) => e.peerName === warning.peerDependency);
            expect(entry).toBeDefined();

            // Verify severity matches oracle
            const expectedSeverity = oracleSeverity(
              warning.requiredRange,
              entry!.installedVersion,
            );
            expect(warning.severity).toBe(expectedSeverity);

            // Verify all fields are populated correctly
            expect(warning.recommendedLibrary).toBe(rec.recommendedLibrary.name);
            expect(warning.peerDependency).toBe(entry!.peerName);
            expect(warning.requiredRange).toBe(entry!.requiredRange);

            if (entry!.installedVersion === undefined) {
              expect(warning.installedVersion).toBeNull();
            } else {
              expect(warning.installedVersion).toBe(entry!.installedVersion);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('checkPeerDependencies produces correct severity with fully random semver inputs', async () => {
    /**
     * **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
     *
     * Generate fully random semver ranges and versions (not pre-classified),
     * and verify the checker's output matches the semver oracle.
     */
    await fc.assert(
      fc.asyncProperty(
        recommendedChangeArb,
        fc.array(
          fc.record({
            peerName: safeString,
            requiredRange: semverRangeArb,
            installedVersion: fc.option(semverVersionArb, { nil: undefined }),
          }),
          { minLength: 1, maxLength: 5 },
        ),
        async (rec, peerEntries) => {
          // Deduplicate by peer name
          const uniqueEntries = new Map<string, (typeof peerEntries)[0]>();
          for (const entry of peerEntries) {
            uniqueEntries.set(entry.peerName, entry);
          }
          const entries = [...uniqueEntries.values()];

          // Build peer dep map
          const peerDeps: PeerDependencyMap = {};
          for (const entry of entries) {
            peerDeps[entry.peerName] = entry.requiredRange;
          }

          // Build currentLibraries
          const currentLibraries: Record<string, string> = {};
          for (const entry of entries) {
            if (entry.installedVersion !== undefined) {
              currentLibraries[entry.peerName] = entry.installedVersion;
            }
          }

          // Create mock resolver
          const peerDepsMap = new Map<string, PeerDependencyMap>();
          peerDepsMap.set(rec.recommendedLibrary.name, peerDeps);
          const resolver = createMockResolver(peerDepsMap);

          // Run the checker
          const result = await checkPeerDependencies([rec], currentLibraries, resolver);

          expect(result.warnings.length).toBe(entries.length);

          for (const warning of result.warnings) {
            const entry = entries.find((e) => e.peerName === warning.peerDependency);
            expect(entry).toBeDefined();

            // Use semver oracle to determine expected severity
            const expectedSeverity = oracleSeverity(
              entry!.requiredRange,
              entry!.installedVersion,
            );
            expect(warning.severity).toBe(expectedSeverity);

            // Verify field population
            expect(warning.recommendedLibrary).toBe(rec.recommendedLibrary.name);
            expect(warning.peerDependency).toBe(entry!.peerName);
            expect(warning.requiredRange).toBe(entry!.requiredRange);
            expect(warning.installedVersion).toBe(entry!.installedVersion ?? null);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /** Validates: Requirements 2.1, 2.2, 2.3, 2.4 */
});

// ---------------------------------------------------------------------------
// Property 2: Risk escalation for conflict or missing peer dependencies
// ---------------------------------------------------------------------------

describe('Feature: peer-dependency-warnings, Property 2: Risk escalation for conflict/missing', () => {
  /**
   * **Validates: Requirements 3.1, 3.3**
   *
   * For any recommendation that has at least one PeerDependencyWarning with
   * severity "conflict" or "missing", the output recommendation's migrationRisk
   * SHALL be at least "medium". If the original migrationRisk was already "high",
   * it SHALL remain "high".
   */

  /** Arbitrary that generates only conflict or missing peer dep entries */
  const conflictOrMissingEntryArb = fc.oneof(
    // Conflict: installed version does NOT satisfy the range
    fc
      .record({
        peerName: safeString,
        major: fc.integer({ min: 1, max: 20 }),
        minor: fc.integer({ min: 0, max: 20 }),
        patch: fc.integer({ min: 0, max: 20 }),
      })
      .map(({ peerName, major, minor, patch }) => ({
        peerName,
        requiredRange: `^${major}.${minor}.${patch}`,
        installedVersion: `${major - 1}.${minor}.${patch}` as string | undefined,
        expectedSeverity: 'conflict' as const,
      })),
    // Missing: peer dep not in currentLibraries
    fc
      .record({
        peerName: safeString,
        major: fc.integer({ min: 0, max: 20 }),
        minor: fc.integer({ min: 0, max: 20 }),
        patch: fc.integer({ min: 0, max: 20 }),
      })
      .map(({ peerName, major, minor, patch }) => ({
        peerName,
        requiredRange: `^${major}.${minor}.${patch}`,
        installedVersion: undefined as string | undefined,
        expectedSeverity: 'missing' as const,
      })),
  );

  it('migrationRisk is at least "medium" when conflict/missing peer deps exist', async () => {
    await fc.assert(
      fc.asyncProperty(
        recommendedChangeArb,
        fc.array(conflictOrMissingEntryArb, { minLength: 1, maxLength: 5 }),
        async (rec, conflictEntries) => {
          // Deduplicate peer entries by name
          const uniqueEntries = new Map<string, (typeof conflictEntries)[0]>();
          for (const entry of conflictEntries) {
            uniqueEntries.set(entry.peerName, entry);
          }
          const entries = [...uniqueEntries.values()];

          // Build peer dep map for this recommendation
          const peerDeps: PeerDependencyMap = {};
          for (const entry of entries) {
            peerDeps[entry.peerName] = entry.requiredRange;
          }

          // Build currentLibraries — only include entries that have an installed version
          const currentLibraries: Record<string, string> = {};
          for (const entry of entries) {
            if (entry.installedVersion !== undefined) {
              currentLibraries[entry.peerName] = entry.installedVersion;
            }
          }

          // Create mock resolver
          const peerDepsMap = new Map<string, PeerDependencyMap>();
          peerDepsMap.set(rec.recommendedLibrary.name, peerDeps);
          const resolver = createMockResolver(peerDepsMap);

          const originalRisk = rec.migrationRisk;

          // Run the checker
          const result = await checkPeerDependencies([rec], currentLibraries, resolver);

          // The output should have exactly one recommendation
          expect(result.recommendations.length).toBe(1);
          const outputRisk = result.recommendations[0].migrationRisk;

          // Risk must be at least "medium"
          expect(['medium', 'high']).toContain(outputRisk);

          // If original was "high", it must stay "high"
          if (originalRisk === 'high') {
            expect(outputRisk).toBe('high');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('preserves "high" risk regardless of conflict/missing warnings', async () => {
    /**
     * **Validates: Requirements 3.3**
     *
     * Focused sub-property: when original migrationRisk is "high" and there
     * are conflict/missing peer deps, the output risk must remain "high".
     */
    const highRiskRecArb = recommendedChangeArb.map((rec) => ({
      ...rec,
      migrationRisk: 'high' as const,
    }));

    await fc.assert(
      fc.asyncProperty(
        highRiskRecArb,
        fc.array(conflictOrMissingEntryArb, { minLength: 1, maxLength: 5 }),
        async (rec, conflictEntries) => {
          // Deduplicate
          const uniqueEntries = new Map<string, (typeof conflictEntries)[0]>();
          for (const entry of conflictEntries) {
            uniqueEntries.set(entry.peerName, entry);
          }
          const entries = [...uniqueEntries.values()];

          const peerDeps: PeerDependencyMap = {};
          for (const entry of entries) {
            peerDeps[entry.peerName] = entry.requiredRange;
          }

          const currentLibraries: Record<string, string> = {};
          for (const entry of entries) {
            if (entry.installedVersion !== undefined) {
              currentLibraries[entry.peerName] = entry.installedVersion;
            }
          }

          const peerDepsMap = new Map<string, PeerDependencyMap>();
          peerDepsMap.set(rec.recommendedLibrary.name, peerDeps);
          const resolver = createMockResolver(peerDepsMap);

          const result = await checkPeerDependencies([rec], currentLibraries, resolver);

          expect(result.recommendations.length).toBe(1);
          expect(result.recommendations[0].migrationRisk).toBe('high');
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ---------------------------------------------------------------------------
// Property 3: Risk preservation for compatible-only peer dependencies
// ---------------------------------------------------------------------------

describe('Feature: peer-dependency-warnings, Property 3: Risk preservation for compatible-only', () => {
  /**
   * **Validates: Requirements 3.2**
   *
   * For any recommendation where all PeerDependencyWarning entries have
   * severity "compatible" (or the recommendation has no peer dependencies),
   * the output recommendation's migrationRisk SHALL equal the original
   * migrationRisk unchanged.
   */

  /**
   * Arbitrary that generates only compatible peer dep entries.
   * Uses `^major.minor.patch` as range and `major.minor.patch` as installed version,
   * which guarantees the installed version satisfies the range.
   */
  const compatibleOnlyEntryArb = fc
    .record({
      peerName: safeString,
      major: fc.integer({ min: 0, max: 20 }),
      minor: fc.integer({ min: 0, max: 20 }),
      patch: fc.integer({ min: 0, max: 20 }),
    })
    .map(({ peerName, major, minor, patch }) => ({
      peerName,
      requiredRange: `^${major}.${minor}.${patch}`,
      installedVersion: `${major}.${minor}.${patch}`,
    }));

  it('migrationRisk is preserved when all peer deps are compatible', async () => {
    await fc.assert(
      fc.asyncProperty(
        recommendedChangeArb,
        fc.array(compatibleOnlyEntryArb, { minLength: 1, maxLength: 5 }),
        async (rec, compatibleEntries) => {
          // Deduplicate peer entries by name
          const uniqueEntries = new Map<string, (typeof compatibleEntries)[0]>();
          for (const entry of compatibleEntries) {
            uniqueEntries.set(entry.peerName, entry);
          }
          const entries = [...uniqueEntries.values()];

          // Build peer dep map for this recommendation
          const peerDeps: PeerDependencyMap = {};
          for (const entry of entries) {
            peerDeps[entry.peerName] = entry.requiredRange;
          }

          // Build currentLibraries — all entries have installed versions that satisfy the range
          const currentLibraries: Record<string, string> = {};
          for (const entry of entries) {
            currentLibraries[entry.peerName] = entry.installedVersion;
          }

          // Create mock resolver
          const peerDepsMap = new Map<string, PeerDependencyMap>();
          peerDepsMap.set(rec.recommendedLibrary.name, peerDeps);
          const resolver = createMockResolver(peerDepsMap);

          const originalRisk = rec.migrationRisk;

          // Run the checker
          const result = await checkPeerDependencies([rec], currentLibraries, resolver);

          // The output should have exactly one recommendation
          expect(result.recommendations.length).toBe(1);

          // All warnings should be "compatible"
          for (const warning of result.warnings) {
            expect(warning.severity).toBe('compatible');
          }

          // migrationRisk must be preserved unchanged
          expect(result.recommendations[0].migrationRisk).toBe(originalRisk);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('migrationRisk is preserved when recommendation has no peer dependencies', async () => {
    await fc.assert(
      fc.asyncProperty(recommendedChangeArb, async (rec) => {
        // Resolver returns empty peer dep map — no peer dependencies
        const peerDepsMap = new Map<string, PeerDependencyMap>();
        peerDepsMap.set(rec.recommendedLibrary.name, {});
        const resolver = createMockResolver(peerDepsMap);

        const originalRisk = rec.migrationRisk;

        // Run the checker with empty currentLibraries
        const result = await checkPeerDependencies([rec], {}, resolver);

        // The output should have exactly one recommendation
        expect(result.recommendations.length).toBe(1);

        // No warnings should be produced
        expect(result.warnings.length).toBe(0);

        // migrationRisk must be preserved unchanged
        expect(result.recommendations[0].migrationRisk).toBe(originalRisk);
      }),
      { numRuns: 100 },
    );
  });

  it('migrationRisk is preserved for each risk level with compatible-only deps', async () => {
    /**
     * **Validates: Requirements 3.2**
     *
     * Focused sub-property: explicitly test each risk level ("low", "medium", "high")
     * to ensure none are modified when only compatible peer deps exist.
     */
    for (const riskLevel of ['low', 'medium', 'high'] as const) {
      const fixedRiskRecArb = recommendedChangeArb.map((rec) => ({
        ...rec,
        migrationRisk: riskLevel,
      }));

      await fc.assert(
        fc.asyncProperty(
          fixedRiskRecArb,
          fc.array(compatibleOnlyEntryArb, { minLength: 1, maxLength: 5 }),
          async (rec, compatibleEntries) => {
            // Deduplicate peer entries by name
            const uniqueEntries = new Map<string, (typeof compatibleEntries)[0]>();
            for (const entry of compatibleEntries) {
              uniqueEntries.set(entry.peerName, entry);
            }
            const entries = [...uniqueEntries.values()];

            const peerDeps: PeerDependencyMap = {};
            for (const entry of entries) {
              peerDeps[entry.peerName] = entry.requiredRange;
            }

            const currentLibraries: Record<string, string> = {};
            for (const entry of entries) {
              currentLibraries[entry.peerName] = entry.installedVersion;
            }

            const peerDepsMap = new Map<string, PeerDependencyMap>();
            peerDepsMap.set(rec.recommendedLibrary.name, peerDeps);
            const resolver = createMockResolver(peerDepsMap);

            const result = await checkPeerDependencies([rec], currentLibraries, resolver);

            expect(result.recommendations.length).toBe(1);
            expect(result.recommendations[0].migrationRisk).toBe(riskLevel);
          },
        ),
        { numRuns: 100 },
      );
    }
  });
});

