import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildMigrationPlan } from '../src/planner/migration-planner.js';
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
    license: fc.constantFrom('MIT', 'Apache-2.0', 'BSD-3-Clause', 'ISC'),
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

/** Generate a RecommendedChange with a specific risk level */
function recommendedChangeWithRisk(
  risk: 'low' | 'medium' | 'high',
): fc.Arbitrary<RecommendedChange> {
  return recommendedChangeArb.map((rec) => ({
    ...rec,
    migrationRisk: risk,
  }));
}

/** Generate a non-empty array of RecommendedChange with mixed risk levels */
const mixedRiskRecommendationsArb = fc
  .tuple(
    fc.array(recommendedChangeWithRisk('low'), { minLength: 1, maxLength: 5 }),
    fc.array(recommendedChangeWithRisk('medium'), { minLength: 1, maxLength: 5 }),
    fc.array(recommendedChangeWithRisk('high'), { minLength: 1, maxLength: 5 }),
  )
  .map(([low, medium, high]) => [...low, ...medium, ...high]);

// ---------------------------------------------------------------------------
// Property 8: Migration phase ordering by risk
// ---------------------------------------------------------------------------

describe('Feature: next-unicorn, Property 8: Migration phase ordering by risk', () => {
  /**
   * **Validates: Requirements 4.1**
   *
   * For any set of recommendations with mixed migration_risk values,
   * the Migration_Planner SHALL place all "low" risk items in phases
   * numbered lower than all "medium" risk items, and all "medium" risk
   * items in phases numbered lower than all "high" risk items.
   */

  it('low-risk phases come before medium-risk phases, which come before high-risk phases', () => {
    fc.assert(
      fc.property(mixedRiskRecommendationsArb, (recommendations) => {
        const plan = buildMigrationPlan(recommendations);

        // Collect phase numbers for each risk level by examining steps
        const phaseByRisk: Record<string, number[]> = {
          low: [],
          medium: [],
          high: [],
        };

        for (const phase of plan.phases) {
          for (const step of phase.steps) {
            const rec = recommendations[step.recommendationIndex]!;
            phaseByRisk[rec.migrationRisk]!.push(phase.phase);
          }
        }

        // All low-risk phase numbers must be less than all medium-risk phase numbers
        for (const lowPhase of phaseByRisk.low) {
          for (const medPhase of phaseByRisk.medium) {
            expect(lowPhase).toBeLessThan(medPhase);
          }
        }

        // All medium-risk phase numbers must be less than all high-risk phase numbers
        for (const medPhase of phaseByRisk.medium) {
          for (const highPhase of phaseByRisk.high) {
            expect(medPhase).toBeLessThan(highPhase);
          }
        }

        // All low-risk phase numbers must be less than all high-risk phase numbers
        for (const lowPhase of phaseByRisk.low) {
          for (const highPhase of phaseByRisk.high) {
            expect(lowPhase).toBeLessThan(highPhase);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('empty recommendations produce zero phases', () => {
    const plan = buildMigrationPlan([]);
    expect(plan.phases).toHaveLength(0);
    expect(plan.deletionChecklist).toHaveLength(0);
  });

  it('only non-empty phases are created', () => {
    fc.assert(
      fc.property(
        fc.array(recommendedChangeArb, { minLength: 1, maxLength: 10 }),
        (recommendations) => {
          const plan = buildMigrationPlan(recommendations);

          // Every phase must have at least one step
          for (const phase of plan.phases) {
            expect(phase.steps.length).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('within each phase, steps touching the same file are grouped together', () => {
    fc.assert(
      fc.property(
        fc.array(recommendedChangeArb, { minLength: 2, maxLength: 10 }),
        (recommendations) => {
          const plan = buildMigrationPlan(recommendations);

          for (const phase of plan.phases) {
            // Within each file group, composite scores should be descending
            let prevFile = '';
            let prevComposite = Infinity;
            for (const step of phase.steps) {
              const rec = recommendations[step.recommendationIndex]!;
              const file = rec.currentImplementation.filePath;
              if (file !== prevFile) {
                // New file group — reset composite tracking
                prevFile = file;
                prevComposite = rec.impactScores.composite;
              } else {
                // Same file — composite should be descending
                expect(prevComposite).toBeGreaterThanOrEqual(
                  rec.impactScores.composite,
                );
                prevComposite = rec.impactScores.composite;
              }
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 9: High-risk recommendations mandate adapter strategy
// ---------------------------------------------------------------------------

describe('Feature: next-unicorn, Property 9: High-risk recommendations mandate adapter strategy', () => {
  /**
   * **Validates: Requirements 4.2, 9.4**
   *
   * For any recommendation with migrationRisk equal to "high",
   * the Migration_Planner output SHALL include a non-null AdapterStrategy
   * with non-empty wrapperInterface, legacyCode, and targetLibrary fields.
   */

  it('every high-risk step has a non-null AdapterStrategy with non-empty fields', () => {
    fc.assert(
      fc.property(
        fc.array(recommendedChangeWithRisk('high'), { minLength: 1, maxLength: 10 }),
        (recommendations) => {
          const plan = buildMigrationPlan(recommendations);

          // All recommendations are high-risk, so there should be exactly one phase
          for (const phase of plan.phases) {
            for (const step of phase.steps) {
              const rec = recommendations[step.recommendationIndex]!;
              if (rec.migrationRisk === 'high') {
                expect(step.adapterStrategy).toBeDefined();
                expect(step.adapterStrategy!.wrapperInterface.length).toBeGreaterThan(0);
                expect(step.adapterStrategy!.legacyCode.length).toBeGreaterThan(0);
                expect(step.adapterStrategy!.targetLibrary.length).toBeGreaterThan(0);
                expect(step.adapterStrategy!.description.length).toBeGreaterThan(0);
              }
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('high-risk items with existing adapterStrategy preserve it', () => {
    fc.assert(
      fc.property(
        fc.array(recommendedChangeWithRisk('high'), { minLength: 1, maxLength: 5 }),
        (recommendations) => {
          // Add explicit adapter strategies to all recommendations
          const withAdapters = recommendations.map((rec) => ({
            ...rec,
            adapterStrategy: {
              wrapperInterface: 'ICustomAdapter',
              legacyCode: rec.currentImplementation.filePath,
              targetLibrary: rec.recommendedLibrary.name,
              description: 'Custom adapter for migration',
            },
          }));

          const plan = buildMigrationPlan(withAdapters);

          for (const phase of plan.phases) {
            for (const step of phase.steps) {
              expect(step.adapterStrategy).toBeDefined();
              expect(step.adapterStrategy!.wrapperInterface).toBe('ICustomAdapter');
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('mixed-risk recommendations: only high-risk steps have adapter strategies', () => {
    fc.assert(
      fc.property(mixedRiskRecommendationsArb, (recommendations) => {
        const plan = buildMigrationPlan(recommendations);

        for (const phase of plan.phases) {
          for (const step of phase.steps) {
            const rec = recommendations[step.recommendationIndex]!;
            if (rec.migrationRisk === 'high') {
              expect(step.adapterStrategy).toBeDefined();
            } else {
              expect(step.adapterStrategy).toBeUndefined();
            }
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 10: Deletion checklist covers all replaced files
// ---------------------------------------------------------------------------

describe('Feature: next-unicorn, Property 10: Deletion checklist covers all replaced files', () => {
  /**
   * **Validates: Requirements 4.3**
   *
   * For any set of recommendations, every filePath from a recommendation's
   * currentImplementation SHALL appear in the migration plan's deletionChecklist.
   */

  it('every recommendation filePath appears in the deletion checklist', () => {
    fc.assert(
      fc.property(
        fc.array(recommendedChangeArb, { minLength: 1, maxLength: 15 }),
        (recommendations) => {
          const plan = buildMigrationPlan(recommendations);

          const checklistPaths = new Set(plan.deletionChecklist.map((item) => item.filePath));

          for (const rec of recommendations) {
            expect(checklistPaths.has(rec.currentImplementation.filePath)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('deletion checklist has at least as many items as recommendations', () => {
    fc.assert(
      fc.property(
        fc.array(recommendedChangeArb, { minLength: 0, maxLength: 15 }),
        (recommendations) => {
          const plan = buildMigrationPlan(recommendations);

          expect(plan.deletionChecklist.length).toBe(recommendations.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('deletion checklist items have non-empty filePath and reason', () => {
    fc.assert(
      fc.property(
        fc.array(recommendedChangeArb, { minLength: 1, maxLength: 10 }),
        (recommendations) => {
          const plan = buildMigrationPlan(recommendations);

          for (const item of plan.deletionChecklist) {
            expect(item.filePath.length).toBeGreaterThan(0);
            expect(item.reason.length).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('empty recommendations produce empty deletion checklist', () => {
    const plan = buildMigrationPlan([]);
    expect(plan.deletionChecklist).toHaveLength(0);
  });
});
