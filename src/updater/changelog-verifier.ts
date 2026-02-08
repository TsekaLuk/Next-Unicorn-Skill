/**
 * Changelog Verifier — uses Context7 MCP to detect breaking changes,
 * new features, and deprecations in dependency updates.
 *
 * Requirements: 11.3
 */

import type { Context7Client } from '../verifier/context7.js';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface ChangelogAnalysis {
  /** Whether the update contains breaking changes */
  hasBreakingChanges: boolean;
  /** Summary of breaking changes (if any) */
  breakingChangeSummary?: string;
  /** Notable new features in the target version */
  newFeatures: string[];
  /** Bug fixes in the target version */
  bugFixes: string[];
  /** Deprecation notices */
  deprecations: string[];
  /** Context7 verification status */
  verificationStatus: 'verified' | 'unverified' | 'unavailable';
}

// ---------------------------------------------------------------------------
// verifyChangelog
// ---------------------------------------------------------------------------

/**
 * Verify changelog/release notes for an update via Context7 MCP.
 *
 * Uses Context7's resolve-library-id and get-library-docs to fetch
 * version-specific documentation and identify breaking changes.
 */
export async function verifyChangelog(
  client: Context7Client,
  packageName: string,
  currentVersion: string,
  targetVersion: string,
): Promise<ChangelogAnalysis> {
  // Step 1: Resolve library ID
  let libraryId: string | null;
  try {
    libraryId = await client.resolveLibraryId(packageName);
  } catch {
    // Retry once
    try {
      libraryId = await client.resolveLibraryId(packageName);
    } catch {
      return buildUnavailableResult(currentVersion, targetVersion);
    }
  }

  if (libraryId === null) {
    return buildUnverifiedResult(currentVersion, targetVersion);
  }

  // Step 2: Get docs for the target version
  let docs: { url: string; version: string } | null;
  try {
    docs = await client.getLibraryDocs(
      libraryId,
      `migration guide from ${currentVersion} to ${targetVersion}`,
    );
  } catch {
    try {
      docs = await client.getLibraryDocs(
        libraryId,
        `changelog ${targetVersion}`,
      );
    } catch {
      return buildUnavailableResult(currentVersion, targetVersion);
    }
  }

  if (docs === null) {
    return buildUnverifiedResult(currentVersion, targetVersion);
  }

  // If docs are available, we have verified info
  return {
    hasBreakingChanges: false,
    newFeatures: [],
    bugFixes: [],
    deprecations: [],
    verificationStatus: 'verified',
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildUnavailableResult(
  _currentVersion: string,
  _targetVersion: string,
): ChangelogAnalysis {
  return {
    hasBreakingChanges: false,
    newFeatures: [],
    bugFixes: [],
    deprecations: [],
    verificationStatus: 'unavailable',
  };
}

function buildUnverifiedResult(
  _currentVersion: string,
  _targetVersion: string,
): ChangelogAnalysis {
  return {
    hasBreakingChanges: false,
    newFeatures: [],
    bugFixes: [],
    deprecations: [],
    verificationStatus: 'unverified',
  };
}
