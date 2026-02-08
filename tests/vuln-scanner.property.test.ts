/**
 * Property-based tests for Vulnerability Scanner.
 * Properties 15, 16, 17, 18
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { scanVulnerabilities } from '../src/security/vulnerability-scanner.js';
import type { VulnerabilityClient, VulnerabilityRecord } from '../src/security/osv-client.js';
import { vulnMapKey } from '../src/security/osv-client.js';
import type { RecommendedChange } from '../src/schemas/output.schema.js';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const severityArb = fc.constantFrom('critical', 'high', 'medium', 'low', 'unknown') as fc.Arbitrary<
  'critical' | 'high' | 'medium' | 'low' | 'unknown'
>;

const vulnRecordArb: fc.Arbitrary<VulnerabilityRecord> = fc.record({
  id: fc.string({ minLength: 4, maxLength: 20 }),
  aliases: fc.array(fc.string({ minLength: 3, maxLength: 15 }), { maxLength: 3 }),
  summary: fc.string({ minLength: 5, maxLength: 100 }),
  details: fc.string({ minLength: 5, maxLength: 200 }),
  severity: severityArb,
  cvssScore: fc.option(fc.float({ min: 0, max: 10, noNaN: true }), { nil: null }),
  cvssVector: fc.constant(null),
  affectedVersionRange: fc.constant('>=0.0.0'),
  fixedVersion: fc.option(fc.constant('9.9.9'), { nil: null }),
  publishedAt: fc.constant('2026-01-01T00:00:00Z'),
  withdrawnAt: fc.constant(null),
  references: fc.array(fc.constant('https://example.com'), { maxLength: 2 }),
});

function makeMinimalRecommendation(name: string, version: string): RecommendedChange {
  return {
    currentImplementation: {
      filePath: 'test.ts',
      lineRange: { start: 1, end: 10 },
      patternCategory: 'test-pattern',
      confidenceScore: 0.8,
    },
    recommendedLibrary: { name, version, license: 'MIT' },
    domain: 'testing-strategy',
    impactScores: {
      scalability: 5, performance: 5, security: 5,
      maintainability: 5, feature_richness: 5, ux: 5,
      ui_aesthetics: 5, composite: 5,
    },
    migrationRisk: 'low',
    estimatedEffort: 1,
    verificationStatus: 'verified',
  };
}

// ---------------------------------------------------------------------------
// Property 15: Vulnerability findings match OSV response
// ---------------------------------------------------------------------------

describe('Feature: next-unicorn, Property 15: Vulnerability findings match OSV response', () => {
  it('should return exactly N findings for each package with N vulnerabilities', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.array(vulnRecordArb, { minLength: 0, maxLength: 5 }),
        async (pkgName, version, vulns) => {
          const mockClient: VulnerabilityClient = {
            queryByPackage: async () => vulns,
            queryBatch: async (queries) => {
              const map = new Map<string, VulnerabilityRecord[]>();
              for (const q of queries) {
                map.set(vulnMapKey(q.ecosystem, q.packageName), vulns);
              }
              return map;
            },
          };

          const result = await scanVulnerabilities(
            {
              currentLibraries: { [pkgName]: version },
              recommendedChanges: [],
              target: 'current',
              defaultEcosystem: 'npm',
            },
            mockClient,
          );

          // Each non-withdrawn vuln should produce a finding
          const expectedCount = vulns.filter((v) => v.withdrawnAt === null).length;
          expect(result.findings.length).toBe(expectedCount);

          for (const finding of result.findings) {
            expect(finding.packageName).toBe(pkgName);
            expect(finding.source).toBe('current');
            // Verify ID matches one of the vulns
            expect(vulns.some((v) => v.id === finding.vulnerability.id)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 16: Recommended-library vulnerability scanning
// ---------------------------------------------------------------------------

describe('Feature: next-unicorn, Property 16: Recommended-library vulnerability scanning', () => {
  it('should scan recommended libraries with source="recommended" and correct index', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(vulnRecordArb, { minLength: 1, maxLength: 3 }),
        async (vulns) => {
          const mockClient: VulnerabilityClient = {
            queryByPackage: async () => vulns,
            queryBatch: async (queries) => {
              const map = new Map<string, VulnerabilityRecord[]>();
              for (const q of queries) {
                map.set(vulnMapKey(q.ecosystem, q.packageName), vulns);
              }
              return map;
            },
          };

          const recs = [
            makeMinimalRecommendation('test-lib', '1.0.0'),
            makeMinimalRecommendation('other-lib', '2.0.0'),
          ];

          const result = await scanVulnerabilities(
            {
              currentLibraries: {},
              recommendedChanges: recs,
              target: 'recommended',
              defaultEcosystem: 'npm',
            },
            mockClient,
          );

          for (const finding of result.findings) {
            expect(finding.source).toBe('recommended');
            expect(finding.recommendationIndex).toBeDefined();
            expect(finding.recommendationIndex).toBeGreaterThanOrEqual(0);
            expect(finding.recommendationIndex).toBeLessThan(recs.length);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 17: Severity filtering respects minimumSeverity
// ---------------------------------------------------------------------------

describe('Feature: next-unicorn, Property 17: Severity filtering respects minimumSeverity', () => {
  it('should exclude findings below minimumSeverity threshold', async () => {
    const severityOrder = { critical: 4, high: 3, medium: 2, low: 1, unknown: 0 };

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('critical', 'high', 'medium', 'low') as fc.Arbitrary<'critical' | 'high' | 'medium' | 'low'>,
        fc.array(vulnRecordArb, { minLength: 1, maxLength: 5 }),
        async (minimumSeverity, vulns) => {
          const mockClient: VulnerabilityClient = {
            queryByPackage: async () => vulns,
            queryBatch: async (queries) => {
              const map = new Map<string, VulnerabilityRecord[]>();
              for (const q of queries) {
                map.set(vulnMapKey(q.ecosystem, q.packageName), vulns);
              }
              return map;
            },
          };

          const result = await scanVulnerabilities(
            {
              currentLibraries: { 'test-pkg': '1.0.0' },
              recommendedChanges: [],
              target: 'current',
              defaultEcosystem: 'npm',
              minimumSeverity,
            },
            mockClient,
          );

          const threshold = severityOrder[minimumSeverity];
          for (const finding of result.findings) {
            const findingSev = severityOrder[finding.vulnerability.severity] ?? 0;
            expect(findingSev).toBeGreaterThanOrEqual(threshold);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 18: Fixable count equals findings with non-null fixAvailable
// ---------------------------------------------------------------------------

describe('Feature: next-unicorn, Property 18: Fixable count equals non-null fixAvailable count', () => {
  it('should have summary.fixable equal to count of findings with fixAvailable', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(vulnRecordArb, { minLength: 0, maxLength: 5 }),
        async (vulns) => {
          const mockClient: VulnerabilityClient = {
            queryByPackage: async () => vulns,
            queryBatch: async (queries) => {
              const map = new Map<string, VulnerabilityRecord[]>();
              for (const q of queries) {
                map.set(vulnMapKey(q.ecosystem, q.packageName), vulns);
              }
              return map;
            },
          };

          const result = await scanVulnerabilities(
            {
              currentLibraries: { 'test-pkg': '1.0.0' },
              recommendedChanges: [],
              target: 'current',
              defaultEcosystem: 'npm',
            },
            mockClient,
          );

          const fixableCount = result.findings.filter((f) => f.fixAvailable !== null).length;
          const unfixableCount = result.findings.filter((f) => f.fixAvailable === null).length;

          expect(result.summary.fixable).toBe(fixableCount);
          expect(result.summary.unfixable).toBe(unfixableCount);
        },
      ),
      { numRuns: 100 },
    );
  });
});
