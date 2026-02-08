/**
 * OSV (Open Source Vulnerabilities) client interface and data models.
 *
 * OSV is a free, open, vendor-neutral vulnerability database backed by Google.
 * It aggregates GitHub Advisories, NVD, PyPI, RubyGems, crates.io, Go, npm.
 *
 * The client interface is designed for easy mocking in tests — the real
 * implementation calls the OSV.dev REST API.
 *
 * Requirements: 10.1, 10.2
 */

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

/**
 * A single known vulnerability from an advisory database.
 */
export interface VulnerabilityRecord {
  /** e.g. "GHSA-xxxx-yyyy-zzzz" or "CVE-2026-12345" */
  id: string;
  /** Cross-references (CVE <-> GHSA) */
  aliases: string[];
  /** One-line human-readable description */
  summary: string;
  /** Extended markdown description */
  details: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'unknown';
  /** 0.0 - 10.0, null if unavailable */
  cvssScore: number | null;
  /** e.g. "CVSS:3.1/AV:N/AC:L/..." */
  cvssVector: string | null;
  /** semver range, e.g. ">=1.0.0 <1.2.3" */
  affectedVersionRange: string;
  /** Earliest patched version, null if no fix */
  fixedVersion: string | null;
  /** ISO 8601 */
  publishedAt: string;
  /** ISO 8601, null if still active */
  withdrawnAt: string | null;
  /** URLs to advisories, patches, etc. */
  references: string[];
}

// ---------------------------------------------------------------------------
// Client interface
// ---------------------------------------------------------------------------

/**
 * Client interface for vulnerability database queries.
 * Injectable for testability — real implementation calls OSV.dev API.
 */
export interface VulnerabilityClient {
  /**
   * Query vulnerabilities for a single package.
   * @param ecosystem - Package ecosystem: "npm", "PyPI", "crates.io", "Go"
   * @param packageName - Package name as registered in the ecosystem
   * @param version - Installed or target version
   * @returns Array of matching vulnerabilities (empty if clean)
   */
  queryByPackage(
    ecosystem: string,
    packageName: string,
    version: string,
  ): Promise<VulnerabilityRecord[]>;

  /**
   * Batch query vulnerabilities for multiple packages.
   * More efficient than individual queries — OSV supports batching natively.
   * @returns Map keyed by "ecosystem:packageName" -> VulnerabilityRecord[]
   */
  queryBatch(
    queries: Array<{ ecosystem: string; packageName: string; version: string }>,
  ): Promise<Map<string, VulnerabilityRecord[]>>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a map key for vulnerability results.
 */
export function vulnMapKey(ecosystem: string, packageName: string): string {
  return `${ecosystem}:${packageName}`;
}

/**
 * Map package manager name to OSV ecosystem identifier.
 */
export function packageManagerToEcosystem(packageManager: string): string | null {
  const map: Record<string, string> = {
    npm: 'npm',
    pnpm: 'npm',
    yarn: 'npm',
    bun: 'npm',
    pip: 'PyPI',
    cargo: 'crates.io',
    go: 'Go',
  };
  return map[packageManager] ?? null;
}
