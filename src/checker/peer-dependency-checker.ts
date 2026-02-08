import semver from 'semver';
import type { RecommendedChange } from '../schemas/output.schema.js';

/**
 * Resolved peer dependency metadata for a library.
 * Maps peer dependency name → required version range.
 */
export type PeerDependencyMap = Record<string, string>;

/**
 * Interface for resolving peer dependency metadata.
 * Injected for testability — real implementation reads from npm registry or package.json.
 */
export interface PeerDependencyResolver {
  resolve(libraryName: string, version: string): Promise<PeerDependencyMap>;
}

export type WarningSeverity = 'conflict' | 'missing' | 'compatible';

export interface PeerDependencyWarning {
  recommendedLibrary: string;
  peerDependency: string;
  requiredRange: string;
  installedVersion: string | null;
  severity: WarningSeverity;
}

export interface PeerCheckResult {
  warnings: PeerDependencyWarning[];
  recommendations: RecommendedChange[];
}

/**
 * Classify the severity of a peer dependency relationship.
 *
 * - If the peer dependency is not installed (undefined), returns "missing"
 * - If the installed version cannot be coerced to a valid semver, returns "conflict"
 * - If the installed version satisfies the required range, returns "compatible"
 * - Otherwise, returns "conflict"
 *
 * Requirements: 2.1, 2.2, 2.3
 */
export function classifySeverity(
  requiredRange: string,
  installedVersion: string | undefined,
): WarningSeverity {
  if (installedVersion === undefined) return 'missing';
  const coerced = semver.coerce(installedVersion);
  if (!coerced) return 'conflict';
  return semver.satisfies(coerced, requiredRange) ? 'compatible' : 'conflict';
}

/**
 * Escalate migration risk when conflict or missing peer dependencies are detected.
 *
 * - If no conflict/missing, preserves current risk
 * - If current risk is "high", preserves "high"
 * - Otherwise bumps to "medium"
 *
 * Requirements: 3.1, 3.2, 3.3
 */
export function escalateRisk(
  currentRisk: 'low' | 'medium' | 'high',
  hasConflictOrMissing: boolean,
): 'low' | 'medium' | 'high' {
  if (!hasConflictOrMissing) return currentRisk;
  if (currentRisk === 'high') return 'high';
  return 'medium';
}

/**
 * Check peer dependencies for all recommendations against currentLibraries.
 *
 * For each recommendation:
 * 1. Resolve peer dependency metadata via the resolver
 * 2. For each peer dep, compare against currentLibraries using semver
 * 3. Classify as "compatible", "conflict", or "missing"
 * 4. If any peer dep is "conflict" or "missing", escalate migrationRisk to at least "medium"
 *
 * On resolver error for a specific library: catch error, produce zero warnings,
 * preserve original migrationRisk, and continue processing.
 *
 * Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3
 */
export async function checkPeerDependencies(
  recommendations: RecommendedChange[],
  currentLibraries: Record<string, string>,
  resolver: PeerDependencyResolver,
): Promise<PeerCheckResult> {
  const allWarnings: PeerDependencyWarning[] = [];
  const updatedRecommendations: RecommendedChange[] = [];

  for (const rec of recommendations) {
    let peerDeps: PeerDependencyMap = {};

    try {
      const resolved = await resolver.resolve(
        rec.recommendedLibrary.name,
        rec.recommendedLibrary.version,
      );

      // Validate resolved data — filter out non-string values (malformed data)
      for (const [key, value] of Object.entries(resolved)) {
        if (typeof key === 'string' && typeof value === 'string') {
          peerDeps[key] = value;
        }
      }
    } catch {
      // Resolver error: produce zero warnings, preserve original risk, continue
      updatedRecommendations.push(rec);
      continue;
    }

    const recWarnings: PeerDependencyWarning[] = [];

    for (const [peerName, requiredRange] of Object.entries(peerDeps)) {
      const installedVersion = currentLibraries[peerName];
      const severity = classifySeverity(requiredRange, installedVersion);

      recWarnings.push({
        recommendedLibrary: rec.recommendedLibrary.name,
        peerDependency: peerName,
        requiredRange,
        installedVersion: installedVersion ?? null,
        severity,
      });
    }

    const hasConflictOrMissing = recWarnings.some(
      (w) => w.severity === 'conflict' || w.severity === 'missing',
    );

    const escalatedRisk = escalateRisk(rec.migrationRisk, hasConflictOrMissing);

    updatedRecommendations.push({
      ...rec,
      migrationRisk: escalatedRisk,
    });

    allWarnings.push(...recWarnings);
  }

  return {
    warnings: allWarnings,
    recommendations: updatedRecommendations,
  };
}
