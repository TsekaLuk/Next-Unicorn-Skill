/**
 * Registry client interface for querying package version metadata.
 *
 * Injectable for testability — real implementation calls npm/PyPI/crates.io/Go
 * registry APIs.
 *
 * Requirements: 11.1
 */

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

export interface PackageVersionInfo {
  name: string;
  currentVersion: string;
  /** Latest version in current minor series (e.g. 2.3.x) */
  latestPatch: string | null;
  /** Latest version in current major series (e.g. 2.x.x) */
  latestMinor: string | null;
  /** Absolute latest version */
  latestMajor: string;
  /** ISO 8601 of the latest version's publish date */
  publishedAt: string;
  /** Whether the package is deprecated */
  deprecated: boolean;
  deprecationMessage?: string;
  /** URL to changelog or releases page */
  changelog?: string;
  /** URL to source repository */
  repository?: string;
}

// ---------------------------------------------------------------------------
// Client interface
// ---------------------------------------------------------------------------

/**
 * Client interface for package registry queries.
 */
export interface RegistryClient {
  /**
   * Fetch version metadata for a package.
   * @param ecosystem - "npm", "PyPI", "crates.io", "Go"
   * @param packageName - Package name
   * @param currentVersion - Currently installed version
   */
  getVersionInfo(
    ecosystem: string,
    packageName: string,
    currentVersion: string,
  ): Promise<PackageVersionInfo>;

  /**
   * Batch version info retrieval.
   * @returns Map keyed by packageName -> PackageVersionInfo
   */
  getVersionInfoBatch(
    queries: Array<{ ecosystem: string; packageName: string; currentVersion: string }>,
  ): Promise<Map<string, PackageVersionInfo>>;
}
