/**
 * Unit tests for Update Policy and Update Scorer.
 *
 * Tests: policy filtering, semver classification, scorer urgency rules,
 * grouping logic, changelog verification.
 *
 * Requirements: 11.1–11.9
 */

import { describe, it, expect } from 'vitest';
import {
  applyUpdatePolicy,
  classifyUpdateType,
  type UpdatePolicy,
} from '../src/updater/update-policy.js';
import {
  scoreUpdate,
  computeUrgency,
  computeBreakingRisk,
} from '../src/updater/update-scorer.js';
import { buildUpdatePlan, maxUrgency } from '../src/updater/update-plan-builder.js';
import { verifyChangelog } from '../src/updater/changelog-verifier.js';
import type { PackageVersionInfo } from '../src/updater/registry-client.js';
import type { Context7Client } from '../src/verifier/context7.js';
import type { ChangelogAnalysis } from '../src/updater/changelog-verifier.js';
import type { UpdateCandidate } from '../src/updater/update-policy.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeVersionInfo(
  name: string,
  current: string,
  overrides?: Partial<PackageVersionInfo>,
): PackageVersionInfo {
  return {
    name,
    currentVersion: current,
    latestPatch: null,
    latestMinor: null,
    latestMajor: current,
    publishedAt: '2025-01-01T00:00:00Z',
    deprecated: false,
    ...overrides,
  };
}

function makeCandidate(
  name: string,
  current: string,
  target: string,
  updateType: 'patch' | 'minor' | 'major',
): UpdateCandidate {
  return {
    packageName: name,
    ecosystem: 'npm',
    currentVersion: current,
    targetVersion: target,
    updateType,
    versionInfo: makeVersionInfo(name, current, { latestMajor: target }),
  };
}

const noBreakingChangelog: ChangelogAnalysis = {
  hasBreakingChanges: false,
  newFeatures: [],
  bugFixes: [],
  deprecations: [],
  verificationStatus: 'verified',
};

// ---------------------------------------------------------------------------
// classifyUpdateType
// ---------------------------------------------------------------------------

describe('classifyUpdateType', () => {
  it('should classify patch updates', () => {
    expect(classifyUpdateType('1.2.3', '1.2.4')).toBe('patch');
    expect(classifyUpdateType('0.0.1', '0.0.2')).toBe('patch');
  });

  it('should classify minor updates', () => {
    expect(classifyUpdateType('1.2.3', '1.3.0')).toBe('minor');
    expect(classifyUpdateType('2.0.0', '2.1.0')).toBe('minor');
  });

  it('should classify major updates', () => {
    expect(classifyUpdateType('1.2.3', '2.0.0')).toBe('major');
    expect(classifyUpdateType('0.9.0', '1.0.0')).toBe('major');
  });

  it('should return null for same version', () => {
    expect(classifyUpdateType('1.2.3', '1.2.3')).toBeNull();
  });

  it('should handle version prefixes', () => {
    expect(classifyUpdateType('^1.2.3', '1.3.0')).toBe('minor');
    expect(classifyUpdateType('~1.2.3', '1.2.4')).toBe('patch');
  });

  it('should return null for invalid semver', () => {
    expect(classifyUpdateType('not-a-version', '1.0.0')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// applyUpdatePolicy
// ---------------------------------------------------------------------------

describe('applyUpdatePolicy', () => {
  it('should exclude pinned packages', () => {
    const map = new Map<string, PackageVersionInfo>([
      ['pinned-pkg', makeVersionInfo('pinned-pkg', '1.0.0', { latestMajor: '2.0.0' })],
      ['free-pkg', makeVersionInfo('free-pkg', '1.0.0', { latestMajor: '2.0.0' })],
    ]);

    const policy: UpdatePolicy = {
      defaultStrategy: 'all',
      packageOverrides: {},
      maxUpdates: 50,
      minAgeDays: 0,
      groupRelatedPackages: false,
      pinned: ['pinned-pkg'],
    };

    const candidates = applyUpdatePolicy(map, policy, 'npm');
    expect(candidates.some((c) => c.packageName === 'pinned-pkg')).toBe(false);
    expect(candidates.some((c) => c.packageName === 'free-pkg')).toBe(true);
  });

  it('should respect maxUpdates limit', () => {
    const map = new Map<string, PackageVersionInfo>();
    for (let i = 0; i < 10; i++) {
      map.set(`pkg-${i}`, makeVersionInfo(`pkg-${i}`, '1.0.0', { latestMajor: '2.0.0' }));
    }

    const policy: UpdatePolicy = {
      defaultStrategy: 'all',
      packageOverrides: {},
      maxUpdates: 3,
      minAgeDays: 0,
      groupRelatedPackages: false,
      pinned: [],
    };

    const candidates = applyUpdatePolicy(map, policy, 'npm');
    expect(candidates.length).toBeLessThanOrEqual(3);
  });

  it('should filter by minAgeDays', () => {
    const recentDate = new Date();
    recentDate.setHours(recentDate.getHours() - 1);

    const map = new Map<string, PackageVersionInfo>([
      ['recent', makeVersionInfo('recent', '1.0.0', {
        latestMajor: '2.0.0',
        publishedAt: recentDate.toISOString(),
      })],
      ['old', makeVersionInfo('old', '1.0.0', {
        latestMajor: '2.0.0',
        publishedAt: '2020-01-01T00:00:00Z',
      })],
    ]);

    const policy: UpdatePolicy = {
      defaultStrategy: 'all',
      packageOverrides: {},
      maxUpdates: 50,
      minAgeDays: 7,
      groupRelatedPackages: false,
      pinned: [],
    };

    const candidates = applyUpdatePolicy(map, policy, 'npm');
    expect(candidates.some((c) => c.packageName === 'recent')).toBe(false);
    expect(candidates.some((c) => c.packageName === 'old')).toBe(true);
  });

  it('should add groupKey when groupRelatedPackages is true', () => {
    const map = new Map<string, PackageVersionInfo>([
      ['@babel/core', makeVersionInfo('@babel/core', '7.0.0', { latestMajor: '8.0.0' })],
      ['@babel/preset-env', makeVersionInfo('@babel/preset-env', '7.0.0', { latestMajor: '8.0.0' })],
    ]);

    const policy: UpdatePolicy = {
      defaultStrategy: 'all',
      packageOverrides: {},
      maxUpdates: 50,
      minAgeDays: 0,
      groupRelatedPackages: true,
      pinned: [],
    };

    const candidates = applyUpdatePolicy(map, policy, 'npm');
    for (const c of candidates) {
      expect(c.groupKey).toBe('@babel');
    }
  });

  it('should respect per-package strategy overrides', () => {
    const map = new Map<string, PackageVersionInfo>([
      ['pkg-a', makeVersionInfo('pkg-a', '1.0.0', {
        latestPatch: '1.0.1',
        latestMinor: '1.1.0',
        latestMajor: '2.0.0',
      })],
    ]);

    // Override: only allow patch
    const policy: UpdatePolicy = {
      defaultStrategy: 'all',
      packageOverrides: { 'pkg-a': 'patch' },
      maxUpdates: 50,
      minAgeDays: 0,
      groupRelatedPackages: false,
      pinned: [],
    };

    const candidates = applyUpdatePolicy(map, policy, 'npm');
    if (candidates.length > 0) {
      expect(candidates[0]!.targetVersion).toBe('1.0.1');
      expect(candidates[0]!.updateType).toBe('patch');
    }
  });
});

// ---------------------------------------------------------------------------
// computeUrgency
// ---------------------------------------------------------------------------

describe('computeUrgency', () => {
  it('should return "routine" for patch with no vulns', () => {
    const candidate = makeCandidate('pkg', '1.0.0', '1.0.1', 'patch');
    expect(computeUrgency(candidate, noBreakingChangelog)).toBe('routine');
  });

  it('should return "urgent" for deprecated package', () => {
    const candidate = makeCandidate('pkg', '1.0.0', '2.0.0', 'major');
    candidate.versionInfo.deprecated = true;
    expect(computeUrgency(candidate, noBreakingChangelog)).toBe('urgent');
  });

  it('should return "recommended" for minor with new features', () => {
    const candidate = makeCandidate('pkg', '1.0.0', '1.1.0', 'minor');
    const changelog: ChangelogAnalysis = {
      ...noBreakingChangelog,
      newFeatures: ['New feature X'],
    };
    expect(computeUrgency(candidate, changelog)).toBe('recommended');
  });
});

// ---------------------------------------------------------------------------
// computeBreakingRisk
// ---------------------------------------------------------------------------

describe('computeBreakingRisk', () => {
  it('should return "none" for patch with no breaking changes', () => {
    const candidate = makeCandidate('pkg', '1.0.0', '1.0.1', 'patch');
    expect(computeBreakingRisk(candidate, noBreakingChangelog)).toBe('none');
  });

  it('should return "low" for minor with no breaking changes', () => {
    const candidate = makeCandidate('pkg', '1.0.0', '1.1.0', 'minor');
    expect(computeBreakingRisk(candidate, noBreakingChangelog)).toBe('low');
  });

  it('should return "medium" for major with no confirmed breaking changes', () => {
    const candidate = makeCandidate('pkg', '1.0.0', '2.0.0', 'major');
    expect(computeBreakingRisk(candidate, noBreakingChangelog)).toBe('medium');
  });

  it('should return "high" for major with confirmed breaking changes', () => {
    const candidate = makeCandidate('pkg', '1.0.0', '2.0.0', 'major');
    const changelog: ChangelogAnalysis = {
      ...noBreakingChangelog,
      hasBreakingChanges: true,
    };
    expect(computeBreakingRisk(candidate, changelog)).toBe('high');
  });
});

// ---------------------------------------------------------------------------
// scoreUpdate
// ---------------------------------------------------------------------------

describe('scoreUpdate', () => {
  it('should produce valid impact scores', () => {
    const candidate = makeCandidate('pkg', '1.0.0', '1.0.1', 'patch');
    const result = scoreUpdate({ candidate, changelog: noBreakingChangelog });

    expect(result.impactScores.composite).toBeGreaterThanOrEqual(1);
    expect(result.impactScores.composite).toBeLessThanOrEqual(10);
    expect(result.estimatedEffort).toBeGreaterThan(0);
  });

  it('should boost security score when fixing vulns', () => {
    const candidate = makeCandidate('pkg', '1.0.0', '1.0.1', 'patch');
    const vuln = {
      source: 'current' as const,
      packageName: 'pkg',
      installedVersion: '1.0.0',
      ecosystem: 'npm',
      vulnerability: {
        id: 'GHSA-test',
        aliases: [],
        summary: 'test',
        details: 'test',
        severity: 'critical' as const,
        cvssScore: 9.8,
        cvssVector: null,
        affectedVersionRange: '>=0.0.0',
        fixedVersion: '1.0.1',
        publishedAt: '2026-01-01T00:00:00Z',
        withdrawnAt: null,
        references: [],
      },
      fixAvailable: '1.0.1',
    };

    const withVuln = scoreUpdate({
      candidate,
      changelog: noBreakingChangelog,
      vulnFindings: [vuln],
    });
    const withoutVuln = scoreUpdate({
      candidate,
      changelog: noBreakingChangelog,
    });

    expect(withVuln.impactScores.security).toBeGreaterThan(withoutVuln.impactScores.security);
  });
});

// ---------------------------------------------------------------------------
// maxUrgency
// ---------------------------------------------------------------------------

describe('maxUrgency', () => {
  it('should return the highest urgency', () => {
    expect(maxUrgency(['routine', 'recommended'])).toBe('recommended');
    expect(maxUrgency(['routine', 'urgent'])).toBe('urgent');
    expect(maxUrgency(['routine', 'critical'])).toBe('critical');
    expect(maxUrgency(['urgent', 'critical'])).toBe('critical');
    expect(maxUrgency(['routine'])).toBe('routine');
  });
});

// ---------------------------------------------------------------------------
// buildUpdatePlan
// ---------------------------------------------------------------------------

describe('buildUpdatePlan', () => {
  it('should build a plan from scored candidates', () => {
    const candidates = [
      makeCandidate('pkg-a', '1.0.0', '1.0.1', 'patch'),
      makeCandidate('pkg-b', '1.0.0', '2.0.0', 'major'),
    ];

    const scores = candidates.map((c) =>
      scoreUpdate({ candidate: c, changelog: noBreakingChangelog }),
    );

    const changelogs = candidates.map(() => noBreakingChangelog);

    const plan = buildUpdatePlan(candidates, scores, changelogs);

    expect(plan.updates).toHaveLength(2);
    expect(plan.summary.totalUpdatesAvailable).toBe(2);
    expect(plan.summary.estimatedTotalEffort).toBeGreaterThan(0);
  });

  it('should group related packages', () => {
    const candidates = [
      { ...makeCandidate('@babel/core', '7.0.0', '8.0.0', 'major'), groupKey: '@babel' },
      { ...makeCandidate('@babel/preset-env', '7.0.0', '8.0.0', 'major'), groupKey: '@babel' },
    ];

    const scores = candidates.map((c) =>
      scoreUpdate({ candidate: c, changelog: noBreakingChangelog }),
    );
    const changelogs = candidates.map(() => noBreakingChangelog);

    const plan = buildUpdatePlan(candidates, scores, changelogs);

    expect(plan.groups).toHaveLength(1);
    expect(plan.groups[0]!.groupKey).toBe('@babel');
    expect(plan.groups[0]!.items).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// verifyChangelog
// ---------------------------------------------------------------------------

describe('verifyChangelog', () => {
  it('should return verified when Context7 resolves and returns docs', async () => {
    const mockClient: Context7Client = {
      resolveLibraryId: async () => '/test/lib',
      getLibraryDocs: async () => ({ url: 'https://docs.test', version: '2.0.0' }),
    };

    const result = await verifyChangelog(mockClient, 'test-lib', '1.0.0', '2.0.0');
    expect(result.verificationStatus).toBe('verified');
  });

  it('should return unverified when library not found', async () => {
    const mockClient: Context7Client = {
      resolveLibraryId: async () => null,
      getLibraryDocs: async () => null,
    };

    const result = await verifyChangelog(mockClient, 'unknown-lib', '1.0.0', '2.0.0');
    expect(result.verificationStatus).toBe('unverified');
  });

  it('should return unavailable when Context7 throws after retry', async () => {
    const mockClient: Context7Client = {
      resolveLibraryId: async () => { throw new Error('Network error'); },
      getLibraryDocs: async () => null,
    };

    const result = await verifyChangelog(mockClient, 'test-lib', '1.0.0', '2.0.0');
    expect(result.verificationStatus).toBe('unavailable');
  });
});
