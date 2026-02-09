/**
 * Unit tests for PR Strategy and PR Description Builder.
 *
 * Tests: strategy planning, branch naming, title formatting,
 * description generation, deduplication logic.
 *
 * Requirements: 12.1–12.10
 */

import { describe, it, expect } from 'vitest';
import { planPRs, type PRPolicy } from '../src/pr-creator/pr-strategy.js';
import {
  buildPRTitle,
  buildPRDescription,
} from '../src/pr-creator/pr-executor.js';
import { executePRPlans } from '../src/pr-creator/pr-executor.js';
import type {
  OutputSchema,
  UpdateItem,
  RecommendedChange,
} from '../src/schemas/output.schema.js';
import type { PlatformClient, PullRequestResult } from '../src/pr-creator/platform-client.js';
import type { GitOperations } from '../src/pr-creator/git-operations.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeUpdateItem(
  name: string,
  urgency: 'routine' | 'recommended' | 'urgent' | 'critical' = 'routine',
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
    estimatedEffort: 1,
    hasBreakingChanges: false,
    vulnFixCount: 0,
    groupKey,
  };
}

function makeRecommendation(): RecommendedChange {
  return {
    currentImplementation: {
      filePath: 'src/utils/date.ts',
      lineRange: { start: 1, end: 50 },
      patternCategory: 'custom-date-formatting',
      confidenceScore: 0.9,
    },
    recommendedLibrary: { name: 'date-fns', version: '3.0.0', license: 'MIT' },
    domain: 'i18n',
    impactScores: {
      scalability: 5, performance: 7, security: 5,
      maintainability: 8, feature_richness: 7, ux: 6,
      ui_aesthetics: 5, composite: 6.1,
    },
    migrationRisk: 'low',
    estimatedEffort: 4,
    verificationStatus: 'verified',
  };
}

function makeOutput(overrides?: Partial<OutputSchema>): OutputSchema {
  return {
    recommendedChanges: [],
    filesToDelete: [],
    linesSavedEstimate: 0,
    uxAudit: [],
    migrationPlan: { phases: [], deletionChecklist: [], peerDependencyWarnings: [] },
    ...overrides,
  };
}

function makePolicy(overrides?: Partial<PRPolicy>): PRPolicy {
  return {
    enabled: true,
    maxOpenPRs: 10,
    groupUpdates: false,
    separateSecurityPRs: true,
    createMigrationPRs: false,
    labels: ['next-unicorn'],
    reviewers: [],
    draft: true,
    branchPrefix: 'next-unicorn/',
    ...overrides,
  };
}

function makeMockPlatformClient(): PlatformClient {
  let prCounter = 0;
  return {
    platform: 'github',
    createPullRequest: async (input) => {
      prCounter++;
      return {
        id: prCounter,
        url: `https://github.com/test/repo/pull/${prCounter}`,
        number: prCounter,
        status: 'created',
      };
    },
    updatePullRequest: async (prNumber, _input) => ({
      id: prNumber,
      url: `https://github.com/test/repo/pull/${prNumber}`,
      number: prNumber,
      status: 'updated',
    }),
    findExistingPR: async () => null,
    getDefaultBranch: async () => 'main',
  };
}

function makeMockGitOps(): GitOperations {
  return {
    createBranch: async () => {},
    checkout: async () => {},
    commitChanges: async () => ({ sha: 'abc123' }),
    push: async () => {},
    branchExists: async () => false,
    getCurrentBranch: async () => 'main',
  };
}

// ---------------------------------------------------------------------------
// Tests: planPRs
// ---------------------------------------------------------------------------

describe('planPRs', () => {
  it('should create security PRs separately', () => {
    const output = makeOutput({
      updatePlan: {
        updates: [
          makeUpdateItem('vuln-pkg', 'critical'),
          makeUpdateItem('safe-pkg', 'routine'),
        ],
        groups: [],
        summary: {
          totalUpdatesAvailable: 2,
          critical: 1, urgent: 0, recommended: 0, routine: 1,
          estimatedTotalEffort: 2,
        },
      },
    });

    const plans = planPRs({ output, policy: makePolicy() });
    const secPlans = plans.filter((p) => p.type === 'security-update');
    const depPlans = plans.filter((p) => p.type === 'dependency-update');

    expect(secPlans).toHaveLength(1);
    expect(depPlans).toHaveLength(1);
  });

  it('should not separate security PRs when disabled', () => {
    const output = makeOutput({
      updatePlan: {
        updates: [
          makeUpdateItem('vuln-pkg', 'critical'),
          makeUpdateItem('safe-pkg', 'routine'),
        ],
        groups: [],
        summary: {
          totalUpdatesAvailable: 2,
          critical: 1, urgent: 0, recommended: 0, routine: 1,
          estimatedTotalEffort: 2,
        },
      },
    });

    const plans = planPRs({
      output,
      policy: makePolicy({ separateSecurityPRs: false }),
    });
    const secPlans = plans.filter((p) => p.type === 'security-update');

    expect(secPlans).toHaveLength(0);
  });

  it('should create migration PRs when enabled', () => {
    const output = makeOutput({
      recommendedChanges: [makeRecommendation()],
      migrationPlan: {
        phases: [
          {
            phase: 1,
            name: 'Low-Risk Quick Wins',
            steps: [
              { recommendationIndex: 0, description: 'Replace custom date formatting' },
            ],
          },
        ],
        deletionChecklist: [],
        peerDependencyWarnings: [],
      },
    });

    const plans = planPRs({
      output,
      policy: makePolicy({ createMigrationPRs: true }),
    });

    const migrationPlans = plans.filter((p) => p.type === 'migration');
    expect(migrationPlans).toHaveLength(1);
  });

  it('should enforce maxOpenPRs', () => {
    const updates = Array.from({ length: 20 }, (_, i) =>
      makeUpdateItem(`pkg-${i}`, 'routine'),
    );
    const output = makeOutput({
      updatePlan: {
        updates,
        groups: [],
        summary: {
          totalUpdatesAvailable: 20,
          critical: 0, urgent: 0, recommended: 0, routine: 20,
          estimatedTotalEffort: 20,
        },
      },
    });

    const plans = planPRs({
      output,
      policy: makePolicy({ maxOpenPRs: 5, separateSecurityPRs: false }),
    });

    expect(plans.length).toBeLessThanOrEqual(5);
  });

  it('should prioritize security over routine updates', () => {
    const output = makeOutput({
      updatePlan: {
        updates: [
          makeUpdateItem('routine-1', 'routine'),
          makeUpdateItem('sec-1', 'critical'),
          makeUpdateItem('routine-2', 'routine'),
        ],
        groups: [],
        summary: {
          totalUpdatesAvailable: 3,
          critical: 1, urgent: 0, recommended: 0, routine: 2,
          estimatedTotalEffort: 3,
        },
      },
    });

    const plans = planPRs({ output, policy: makePolicy() });
    expect(plans[0]!.type).toBe('security-update');
  });

  it('should generate unique branch names', () => {
    const updates = Array.from({ length: 5 }, () =>
      makeUpdateItem('same-name', 'routine'),
    );
    const output = makeOutput({
      updatePlan: {
        updates,
        groups: [],
        summary: {
          totalUpdatesAvailable: 5,
          critical: 0, urgent: 0, recommended: 0, routine: 5,
          estimatedTotalEffort: 5,
        },
      },
    });

    const plans = planPRs({
      output,
      policy: makePolicy({ separateSecurityPRs: false }),
    });
    const branches = plans.map((p) => p.branchName);
    const unique = new Set(branches);

    expect(unique.size).toBe(branches.length);
  });
});

// ---------------------------------------------------------------------------
// Tests: buildPRTitle
// ---------------------------------------------------------------------------

describe('buildPRTitle', () => {
  it('should format security update title', () => {
    const plan = planPRs({
      output: makeOutput({
        updatePlan: {
          updates: [makeUpdateItem('lodash', 'critical')],
          groups: [],
          summary: {
            totalUpdatesAvailable: 1,
            critical: 1, urgent: 0, recommended: 0, routine: 0,
            estimatedTotalEffort: 1,
          },
        },
      }),
      policy: makePolicy(),
    })[0]!;

    const title = buildPRTitle(plan);
    expect(title).toMatch(/^fix\(deps\):/);
  });

  it('should format dependency update title', () => {
    const plan = planPRs({
      output: makeOutput({
        updatePlan: {
          updates: [makeUpdateItem('react', 'routine')],
          groups: [],
          summary: {
            totalUpdatesAvailable: 1,
            critical: 0, urgent: 0, recommended: 0, routine: 1,
            estimatedTotalEffort: 1,
          },
        },
      }),
      policy: makePolicy({ separateSecurityPRs: false }),
    })[0]!;

    const title = buildPRTitle(plan);
    expect(title).toMatch(/^chore\(deps\):/);
  });

  it('should format migration title', () => {
    const plan = planPRs({
      output: makeOutput({
        recommendedChanges: [makeRecommendation()],
        migrationPlan: {
          phases: [
            {
              phase: 1,
              name: 'Phase 1',
              steps: [{ recommendationIndex: 0, description: 'Migrate' }],
            },
          ],
          deletionChecklist: [],
          peerDependencyWarnings: [],
        },
      }),
      policy: makePolicy({ createMigrationPRs: true }),
    })[0]!;

    const title = buildPRTitle(plan);
    expect(title).toMatch(/^refactor:/);
  });
});

// ---------------------------------------------------------------------------
// Tests: buildPRDescription
// ---------------------------------------------------------------------------

describe('buildPRDescription', () => {
  it('should include summary and checklist', () => {
    const plan = planPRs({
      output: makeOutput({
        updatePlan: {
          updates: [makeUpdateItem('lodash', 'routine')],
          groups: [],
          summary: {
            totalUpdatesAvailable: 1,
            critical: 0, urgent: 0, recommended: 0, routine: 1,
            estimatedTotalEffort: 1,
          },
        },
      }),
      policy: makePolicy({ separateSecurityPRs: false }),
    })[0]!;

    const body = buildPRDescription(plan);
    expect(body).toContain('change(s)');
    expect(body).toContain('Update');
  });
});

// ---------------------------------------------------------------------------
// Tests: executePRPlans
// ---------------------------------------------------------------------------

describe('executePRPlans', () => {
  it('should create PRs via platform client', async () => {
    const output = makeOutput({
      updatePlan: {
        updates: [makeUpdateItem('lodash', 'routine')],
        groups: [],
        summary: {
          totalUpdatesAvailable: 1,
          critical: 0, urgent: 0, recommended: 0, routine: 1,
          estimatedTotalEffort: 1,
        },
      },
    });

    const plans = planPRs({
      output,
      policy: makePolicy({ separateSecurityPRs: false }),
    });

    const result = await executePRPlans({
      plans,
      platformClient: makeMockPlatformClient(),
      gitOps: makeMockGitOps(),
      labels: ['next-unicorn'],
      reviewers: [],
      draft: true,
    });

    expect(result.summary.created).toBe(plans.length);
    expect(result.summary.failed).toBe(0);
    expect(result.created.every((r) => r.status === 'created')).toBe(true);
  });

  it('should update existing PRs instead of creating duplicates', async () => {
    const existingPR: PullRequestResult = {
      id: 42,
      url: 'https://github.com/test/repo/pull/42',
      number: 42,
      status: 'created',
    };

    const platformClient: PlatformClient = {
      ...makeMockPlatformClient(),
      findExistingPR: async () => existingPR,
      updatePullRequest: async (prNumber) => ({
        id: prNumber,
        url: `https://github.com/test/repo/pull/${prNumber}`,
        number: prNumber,
        status: 'updated',
      }),
    };

    const output = makeOutput({
      updatePlan: {
        updates: [makeUpdateItem('lodash', 'routine')],
        groups: [],
        summary: {
          totalUpdatesAvailable: 1,
          critical: 0, urgent: 0, recommended: 0, routine: 1,
          estimatedTotalEffort: 1,
        },
      },
    });

    const plans = planPRs({
      output,
      policy: makePolicy({ separateSecurityPRs: false }),
    });

    const result = await executePRPlans({
      plans,
      platformClient,
      gitOps: makeMockGitOps(),
      labels: [],
      reviewers: [],
      draft: true,
    });

    expect(result.summary.updated).toBe(plans.length);
    expect(result.created.every((r) => r.status === 'updated')).toBe(true);
  });

  it('should handle platform client errors gracefully', async () => {
    const failingClient: PlatformClient = {
      platform: 'github',
      createPullRequest: async () => { throw new Error('Auth failed'); },
      updatePullRequest: async () => { throw new Error('Auth failed'); },
      findExistingPR: async () => null,
      getDefaultBranch: async () => 'main',
    };

    const output = makeOutput({
      updatePlan: {
        updates: [makeUpdateItem('lodash', 'routine')],
        groups: [],
        summary: {
          totalUpdatesAvailable: 1,
          critical: 0, urgent: 0, recommended: 0, routine: 1,
          estimatedTotalEffort: 1,
        },
      },
    });

    const plans = planPRs({
      output,
      policy: makePolicy({ separateSecurityPRs: false }),
    });

    const result = await executePRPlans({
      plans,
      platformClient: failingClient,
      gitOps: makeMockGitOps(),
      labels: [],
      reviewers: [],
      draft: true,
    });

    expect(result.summary.failed).toBe(plans.length);
    expect(result.created.every((r) => r.status === 'failed')).toBe(true);
    expect(result.created[0]!.errorMessage).toContain('Auth failed');
  });
});
