import type { RecommendedChange } from '../schemas/output.schema.js';

/**
 * Record of a recommendation excluded by constraint filtering.
 */
export interface ExclusionRecord {
  libraryName: string;
  license: string;
  reason: string;
}

/**
 * Result of license-based filtering.
 */
export interface FilterResult {
  recommendations: RecommendedChange[];
  exclusions: ExclusionRecord[];
}

/**
 * Filter recommendations by license allowlist.
 *
 * If `licenseAllowlist` is empty, no filtering occurs — all recommendations pass through.
 * If non-empty, only recommendations whose `recommendedLibrary.license` is in the allowlist
 * are kept. Excluded recommendations are recorded with the reason.
 *
 * @param recommendations - Array of recommended changes to filter
 * @param licenseAllowlist - Array of allowed license identifiers (e.g. ["MIT", "Apache-2.0"])
 * @returns FilterResult with kept recommendations and exclusion records
 *
 * Validates: Requirements 7.5, 9.3
 */
export function filterByLicense(
  recommendations: RecommendedChange[],
  licenseAllowlist: string[],
): FilterResult {
  // Empty allowlist means no filtering — all pass through
  if (licenseAllowlist.length === 0) {
    return {
      recommendations: [...recommendations],
      exclusions: [],
    };
  }

  const allowSet = new Set(licenseAllowlist);
  const kept: RecommendedChange[] = [];
  const exclusions: ExclusionRecord[] = [];

  for (const rec of recommendations) {
    const license = rec.recommendedLibrary.license;
    if (allowSet.has(license)) {
      kept.push(rec);
    } else {
      exclusions.push({
        libraryName: rec.recommendedLibrary.name,
        license,
        reason: `License "${license}" is not in the allowlist [${licenseAllowlist.join(', ')}]`,
      });
    }
  }

  return {
    recommendations: kept,
    exclusions,
  };
}

/**
 * Detect dependency conflicts between recommended libraries and current libraries.
 *
 * If a recommended library's name already exists in `currentLibraries` (with any version),
 * the recommendation is flagged as a conflict and its `migrationRisk` is set to "high".
 *
 * @param recommendations - Array of recommended changes to check
 * @param currentLibraries - Map of library name → version currently in use
 * @returns New array of recommendations with migrationRisk updated for conflicts
 *
 * Validates: Requirements 9.2
 */
export function detectDependencyConflicts(
  recommendations: RecommendedChange[],
  currentLibraries: Record<string, string>,
): RecommendedChange[] {
  return recommendations.map((rec) => {
    const libraryName = rec.recommendedLibrary.name;
    const existingVersion = currentLibraries[libraryName];

    // If the library exists in currentLibraries, it's a potential conflict
    if (existingVersion !== undefined) {
      return {
        ...rec,
        migrationRisk: 'high' as const,
      };
    }

    return rec;
  });
}
