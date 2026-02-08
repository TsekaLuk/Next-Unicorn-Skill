/**
 * Update Policy — filters and prioritizes dependency update candidates
 * based on configurable policies.
 *
 * Requirements: 11.1, 11.6, 11.7
 */

import semver from 'semver';
import type { PackageVersionInfo } from './registry-client.js';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export type UpdateStrategy = 'patch' | 'minor' | 'major' | 'all';

export interface UpdatePolicy {
  /** Default strategy for all packages */
  defaultStrategy: UpdateStrategy;
  /** Per-package overrides */
  packageOverrides: Record<string, UpdateStrategy>;
  /** Maximum number of updates to suggest */
  maxUpdates: number;
  /** Skip dependencies published less than N days ago */
  minAgeDays: number;
  /** Auto-group related packages (e.g. @babel/*) */
  groupRelatedPackages: boolean;
  /** Packages to never auto-update */
  pinned: string[];
}

export interface UpdateCandidate {
  packageName: string;
  ecosystem: string;
  currentVersion: string;
  targetVersion: string;
  updateType: 'patch' | 'minor' | 'major';
  versionInfo: PackageVersionInfo;
  /** Grouping key for related packages */
  groupKey?: string;
}

// ---------------------------------------------------------------------------
// classifyUpdateType
// ---------------------------------------------------------------------------

/**
 * Classify the update type by comparing semver versions.
 *
 * Property 20: Update type classification correctness
 */
export function classifyUpdateType(
  currentVersion: string,
  targetVersion: string,
): 'patch' | 'minor' | 'major' | null {
  const current = semver.coerce(currentVersion);
  const target = semver.coerce(targetVersion);

  if (!current || !target) return null;
  if (semver.eq(current, target)) return null;

  if (current.major !== target.major) return 'major';
  if (current.minor !== target.minor) return 'minor';
  return 'patch';
}

// ---------------------------------------------------------------------------
// applyUpdatePolicy
// ---------------------------------------------------------------------------

/**
 * Apply update policy to filter and prioritize update candidates.
 *
 * Flow:
 * 1. For each dependency, determine available updates
 * 2. Filter by policy (strategy, pinned list, min age)
 * 3. Group related packages if enabled
 * 4. Sort by priority: security patches > patch > minor > major
 * 5. Truncate to maxUpdates
 */
export function applyUpdatePolicy(
  versionInfoMap: Map<string, PackageVersionInfo>,
  policy: UpdatePolicy,
  ecosystem: string,
): UpdateCandidate[] {
  const pinnedSet = new Set(policy.pinned);
  const candidates: UpdateCandidate[] = [];
  const now = Date.now();

  for (const [, info] of versionInfoMap) {
    // Skip pinned packages (Property 19)
    if (pinnedSet.has(info.name)) continue;

    // Determine the strategy for this package
    const strategy = policy.packageOverrides[info.name] ?? policy.defaultStrategy;

    // Pick target version based on strategy
    const targetVersion = pickTargetVersion(info, strategy);
    if (!targetVersion) continue;

    // Classify update type
    const updateType = classifyUpdateType(info.currentVersion, targetVersion);
    if (!updateType) continue;

    // Check min age (Property 24)
    if (policy.minAgeDays > 0) {
      const publishedAt = new Date(info.publishedAt).getTime();
      const ageDays = (now - publishedAt) / (1000 * 60 * 60 * 24);
      if (ageDays < policy.minAgeDays) continue;
    }

    const candidate: UpdateCandidate = {
      packageName: info.name,
      ecosystem,
      currentVersion: info.currentVersion,
      targetVersion,
      updateType,
      versionInfo: info,
    };

    // Add group key if enabled
    if (policy.groupRelatedPackages) {
      candidate.groupKey = deriveGroupKey(info.name);
    }

    candidates.push(candidate);
  }

  // Sort: patch > minor > major (safer updates first)
  const typeOrder: Record<string, number> = { patch: 0, minor: 1, major: 2 };
  candidates.sort((a, b) => (typeOrder[a.updateType] ?? 0) - (typeOrder[b.updateType] ?? 0));

  // Truncate to maxUpdates
  return candidates.slice(0, policy.maxUpdates);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Pick the appropriate target version based on update strategy.
 */
function pickTargetVersion(
  info: PackageVersionInfo,
  strategy: UpdateStrategy,
): string | null {
  switch (strategy) {
    case 'patch':
      return info.latestPatch;
    case 'minor':
      return info.latestMinor ?? info.latestPatch;
    case 'major':
    case 'all':
      return info.latestMajor;
    default:
      return null;
  }
}

/**
 * Derive a grouping key for related packages.
 * e.g. "@babel/core" -> "@babel", "lodash" -> "lodash"
 */
function deriveGroupKey(packageName: string): string {
  if (packageName.startsWith('@')) {
    const slashIndex = packageName.indexOf('/');
    if (slashIndex > 0) return packageName.slice(0, slashIndex);
  }
  return packageName;
}
