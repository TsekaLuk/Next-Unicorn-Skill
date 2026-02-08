/**
 * Property-based tests for Update Policy and Update Scorer.
 * Properties 19, 20, 21, 22, 23, 24
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  applyUpdatePolicy,
  classifyUpdateType,
  type UpdatePolicy,
} from '../src/updater/update-policy.js';
import {
  computeUrgency,
  computeBreakingRisk,
} from '../src/updater/update-scorer.js';
import { maxUrgency } from '../src/updater/update-plan-builder.js';
import type { PackageVersionInfo } from '../src/updater/registry-client.js';
import type { ChangelogAnalysis } from '../src/updater/changelog-verifier.js';
import type { UpdateCandidate } from '../src/updater/update-policy.js';
import type { VulnerabilityRecord } from '../src/security/osv-client.js';
import type { VulnFinding } from '../src/security/vulnerability-scanner.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVersionInfo(name: string, current: string, latest: string): PackageVersionInfo {
  return {
    name,
    currentVersion: current,
    latestPatch: current === latest ? null : latest,
    latestMinor: current === latest ? null : latest,
    latestMajor: latest,
    publishedAt: '2025-01-01T00:00:00Z', // old enough
    deprecated: false,
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
    versionInfo: makeVersionInfo(name, current, target),
  };
}

function makeVulnFinding(
  severity: 'critical' | 'high' | 'medium' | 'low',
): VulnFinding {
  const vuln: VulnerabilityRecord = {
    id: 'GHSA-test-1234',
    aliases: [],
    summary: 'Test vuln',
    details: 'Test details',
    severity,
    cvssScore: null,
    cvssVector: null,
    affectedVersionRange: '>=0.0.0',
    fixedVersion: '9.9.9',
    publishedAt: '2026-01-01T00:00:00Z',
    withdrawnAt: null,
    references: [],
  };
  return {
    source: 'current',
    packageName: 'test-pkg',
    installedVersion: '1.0.0',
    ecosystem: 'npm',
    vulnerability: vuln,
    fixAvailable: '9.9.9',
  };
}

// ---------------------------------------------------------------------------
// Property 19: Pinned packages excluded
// ---------------------------------------------------------------------------

describe('Feature: next-unicorn, Property 19: Pinned packages excluded', () => {
  it('should never include pinned packages in candidates', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 5 }),
        (pinnedNames) => {
          const versionInfoMap = new Map<string, PackageVersionInfo>();
          for (const name of pinnedNames) {
            versionInfoMap.set(name, makeVersionInfo(name, '1.0.0', '2.0.0'));
          }
          // Also add a non-pinned package
          versionInfoMap.set('not-pinned', makeVersionInfo('not-pinned', '1.0.0', '2.0.0'));

          const policy: UpdatePolicy = {
            defaultStrategy: 'all',
            packageOverrides: {},
            maxUpdates: 100,
            minAgeDays: 0,
            groupRelatedPackages: false,
            pinned: pinnedNames,
          };

          const candidates = applyUpdatePolicy(versionInfoMap, policy, 'npm');

          for (const candidate of candidates) {
            expect(pinnedNames).not.toContain(candidate.packageName);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 20: Update type classification correctness
// ---------------------------------------------------------------------------

describe('Feature: next-unicorn, Property 20: Update type classification correctness', () => {
  it('should correctly classify patch/minor/major based on semver diff', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 0, max: 20 }),
        fc.constantFrom('patch', 'minor', 'major') as fc.Arbitrary<'patch' | 'minor' | 'major'>,
        (major, minor, patch, bumpType) => {
          let targetMajor = major;
          let targetMinor = minor;
          let targetPatch = patch;

          if (bumpType === 'patch') {
            targetPatch = patch + 1;
          } else if (bumpType === 'minor') {
            targetMinor = minor + 1;
            targetPatch = 0;
          } else {
            targetMajor = major + 1;
            targetMinor = 0;
            targetPatch = 0;
          }

          const current = `${major}.${minor}.${patch}`;
          const target = `${targetMajor}.${targetMinor}.${targetPatch}`;

          const result = classifyUpdateType(current, target);
          expect(result).toBe(bumpType);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 21: Breaking changes require high breaking risk
// ---------------------------------------------------------------------------

describe('Feature: next-unicorn, Property 21: Breaking changes require medium or high risk', () => {
  it('should return medium or high breaking risk when hasBreakingChanges is true', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('patch', 'minor', 'major') as fc.Arbitrary<'patch' | 'minor' | 'major'>,
        (updateType) => {
          const candidate = makeCandidate('test-pkg', '1.0.0', '2.0.0', updateType);
          const changelog: ChangelogAnalysis = {
            hasBreakingChanges: true,
            newFeatures: [],
            bugFixes: [],
            deprecations: [],
            verificationStatus: 'verified',
          };

          const risk = computeBreakingRisk(candidate, changelog);
          expect(['medium', 'high']).toContain(risk);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 22: Security update urgency escalation
// ---------------------------------------------------------------------------

describe('Feature: next-unicorn, Property 22: Security update urgency escalation', () => {
  it('should set urgency to critical when fixing critical vulns', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('patch', 'minor', 'major') as fc.Arbitrary<'patch' | 'minor' | 'major'>,
        (updateType) => {
          const candidate = makeCandidate('test-pkg', '1.0.0', '2.0.0', updateType);
          const changelog: ChangelogAnalysis = {
            hasBreakingChanges: false,
            newFeatures: [],
            bugFixes: [],
            deprecations: [],
            verificationStatus: 'verified',
          };

          const urgency = computeUrgency(candidate, changelog, [
            makeVulnFinding('critical'),
          ]);
          expect(urgency).toBe('critical');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should set urgency to urgent when fixing high vulns', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('patch', 'minor', 'major') as fc.Arbitrary<'patch' | 'minor' | 'major'>,
        (updateType) => {
          const candidate = makeCandidate('test-pkg', '1.0.0', '2.0.0', updateType);
          const changelog: ChangelogAnalysis = {
            hasBreakingChanges: false,
            newFeatures: [],
            bugFixes: [],
            deprecations: [],
            verificationStatus: 'verified',
          };

          const urgency = computeUrgency(candidate, changelog, [
            makeVulnFinding('high'),
          ]);
          expect(urgency).toBe('urgent');
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 23: Group urgency is max of members
// ---------------------------------------------------------------------------

describe('Feature: next-unicorn, Property 23: Group urgency is max of members', () => {
  it('should return the highest urgency among group members', () => {
    const urgencyArb = fc.constantFrom('routine', 'recommended', 'urgent', 'critical') as fc.Arbitrary<
      'routine' | 'recommended' | 'urgent' | 'critical'
    >;

    fc.assert(
      fc.property(
        fc.array(urgencyArb, { minLength: 1, maxLength: 10 }),
        (urgencies) => {
          const order = { routine: 0, recommended: 1, urgent: 2, critical: 3 };
          const result = maxUrgency(urgencies);

          const expectedMax = urgencies.reduce((max, u) =>
            (order[u] ?? 0) > (order[max] ?? 0) ? u : max,
          );

          expect(result).toBe(expectedMax);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 24: Min-age filtering
// ---------------------------------------------------------------------------

describe('Feature: next-unicorn, Property 24: Min-age filtering', () => {
  it('should exclude packages published less than minAgeDays ago', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 30 }),
        (minAgeDays) => {
          const recentDate = new Date();
          recentDate.setDate(recentDate.getDate() - 1); // 1 day ago

          const versionInfoMap = new Map<string, PackageVersionInfo>();
          versionInfoMap.set('recent-pkg', {
            ...makeVersionInfo('recent-pkg', '1.0.0', '2.0.0'),
            publishedAt: recentDate.toISOString(),
          });
          versionInfoMap.set('old-pkg', {
            ...makeVersionInfo('old-pkg', '1.0.0', '2.0.0'),
            publishedAt: '2020-01-01T00:00:00Z', // very old
          });

          const policy: UpdatePolicy = {
            defaultStrategy: 'all',
            packageOverrides: {},
            maxUpdates: 100,
            minAgeDays,
            groupRelatedPackages: false,
            pinned: [],
          };

          const candidates = applyUpdatePolicy(versionInfoMap, policy, 'npm');

          // If minAgeDays > 1, recent-pkg should be excluded
          if (minAgeDays > 1) {
            expect(candidates.some((c) => c.packageName === 'recent-pkg')).toBe(false);
          }
          // old-pkg should always be included
          expect(candidates.some((c) => c.packageName === 'old-pkg')).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
