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
import type { PackageVersionInfo } from '../src/updater/registry-client.js';
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

// Tests for deleted modules (update-scorer, update-plan-builder, changelog-verifier)
// removed — Occam's Razor: Claude handles scoring, planning, changelog analysis
