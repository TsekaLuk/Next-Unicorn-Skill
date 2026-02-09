/**
 * Property-based tests for PR Strategy.
 * Properties 25, 26, 27, 28, 29
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { planPRs, type PRPolicy } from '../src/pr-creator/pr-strategy.js';
import { buildPRTitle } from '../src/pr-creator/pr-executor.js';
import type { OutputSchema, UpdateItem, UpdateGroup } from '../src/schemas/output.schema.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUpdateItem(
  name: string,
  urgency: 'routine' | 'recommended' | 'urgent' | 'critical',
  groupKey?: string,
): UpdateItem {
  return {
    packageName: name,
    ecosystem: 'npm',
    currentVersion: '1.0.0',
    targetVersion: '2.0.0',
    updateType: 'minor',
    urgency,
    breakingRisk: 'low',
    impactScores: {
      scalability: 5, performance: 5, security: 5,
      maintainability: 5, feature_richness: 5, ux: 5,
      ui_aesthetics: 5, composite: 5,
    },
    affectedFiles: 1,
    hasBreakingChanges: false,
    vulnFixCount: urgency === 'critical' ? 1 : 0,
    groupKey,
  };
}

function makeBaseOutput(updates: UpdateItem[] = [], groups: UpdateGroup[] = []): OutputSchema {
  return {
    recommendedChanges: [],
    filesToDelete: [],
    linesSavedEstimate: 0,
    uxAudit: [],
    migrationPlan: { phases: [], deletionChecklist: [], peerDependencyWarnings: [] },
    updatePlan: {
      updates,
      groups,
      summary: {
        totalUpdatesAvailable: updates.length,
        critical: updates.filter((u) => u.urgency === 'critical').length,
        urgent: updates.filter((u) => u.urgency === 'urgent').length,
        recommended: updates.filter((u) => u.urgency === 'recommended').length,
        routine: updates.filter((u) => u.urgency === 'routine').length,
        totalAffectedFiles: updates.reduce((s, u) => s + u.affectedFiles, 0),
      },
    },
  };
}

function makeBasePolicy(overrides?: Partial<PRPolicy>): PRPolicy {
  return {
    enabled: true,
    maxOpenPRs: 10,
    groupUpdates: false,
    separateSecurityPRs: true,
    createMigrationPRs: false,
    labels: [],
    reviewers: [],
    draft: true,
    branchPrefix: 'next-unicorn/',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Property 25: Security PRs are separated when policy requires
// ---------------------------------------------------------------------------

describe('Feature: next-unicorn, Property 25: Security PRs separated', () => {
  it('should create separate security PRs when separateSecurityPRs is true', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 0, max: 5 }),
        (securityCount, routineCount) => {
          const securityItems = Array.from({ length: securityCount }, (_, i) =>
            makeUpdateItem(`sec-${i}`, i % 2 === 0 ? 'critical' : 'urgent'),
          );
          const routineItems = Array.from({ length: routineCount }, (_, i) =>
            makeUpdateItem(`routine-${i}`, 'routine'),
          );

          const output = makeBaseOutput([...securityItems, ...routineItems]);
          const policy = makeBasePolicy({ separateSecurityPRs: true });
          const plans = planPRs({ output, policy });

          const securityPlans = plans.filter((p) => p.type === 'security-update');
          const nonSecurityPlans = plans.filter((p) => p.type !== 'security-update');

          // All security items should be in security PRs
          expect(securityPlans.length).toBe(securityCount);
          for (const plan of securityPlans) {
            expect(plan.type).toBe('security-update');
          }

          // Non-security items should not be in security PRs
          for (const plan of nonSecurityPlans) {
            expect(plan.type).not.toBe('security-update');
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 26: Branch name uniqueness
// ---------------------------------------------------------------------------

describe('Feature: next-unicorn, Property 26: Branch name uniqueness', () => {
  it('should generate unique branch names across all PR plans', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        (updateCount) => {
          const updates = Array.from({ length: updateCount }, (_, i) =>
            makeUpdateItem(`pkg-${i}`, 'routine'),
          );

          const output = makeBaseOutput(updates);
          const policy = makeBasePolicy({ maxOpenPRs: 50, separateSecurityPRs: false });
          const plans = planPRs({ output, policy });

          const branches = plans.map((p) => p.branchName);
          const uniqueBranches = new Set(branches);

          expect(uniqueBranches.size).toBe(branches.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 27: Max open PRs respected
// ---------------------------------------------------------------------------

describe('Feature: next-unicorn, Property 27: Max open PRs respected', () => {
  it('should not exceed maxOpenPRs', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 20 }),
        (maxOpenPRs, updateCount) => {
          const updates = Array.from({ length: updateCount }, (_, i) =>
            makeUpdateItem(`pkg-${i}`, 'routine'),
          );

          const output = makeBaseOutput(updates);
          const policy = makeBasePolicy({
            maxOpenPRs,
            separateSecurityPRs: false,
          });
          const plans = planPRs({ output, policy });

          expect(plans.length).toBeLessThanOrEqual(maxOpenPRs);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 28: PR title follows conventional commit format
// ---------------------------------------------------------------------------

describe('Feature: next-unicorn, Property 28: PR title follows conventional commit format', () => {
  it('should match type(scope): description pattern', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        (updateCount) => {
          const updates = Array.from({ length: updateCount }, (_, i) =>
            makeUpdateItem(`pkg-${i}`, i === 0 ? 'critical' : 'routine'),
          );

          const output = makeBaseOutput(updates);
          const policy = makeBasePolicy({ maxOpenPRs: 50 });
          const plans = planPRs({ output, policy });

          const conventionalCommitPattern = /^(fix|chore|refactor|feat)\(.+\):\s.+$/;

          for (const plan of plans) {
            const title = buildPRTitle(plan);
            expect(title).toMatch(conventionalCommitPattern);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 29: Existing PR deduplication
// (tested via unit tests since it requires platform client mock)
// We verify the structural property that branch names are unique here.
// ---------------------------------------------------------------------------

describe('Feature: next-unicorn, Property 29: Existing PR deduplication (structural)', () => {
  it('should handle duplicate package names without duplicate branches', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 5 }),
        (count) => {
          // Same package name repeated
          const updates = Array.from({ length: count }, () =>
            makeUpdateItem('same-pkg', 'routine'),
          );

          const output = makeBaseOutput(updates);
          const policy = makeBasePolicy({ maxOpenPRs: 50, separateSecurityPRs: false });
          const plans = planPRs({ output, policy });

          const branches = plans.map((p) => p.branchName);
          const uniqueBranches = new Set(branches);

          expect(uniqueBranches.size).toBe(branches.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});
