/**
 * Unit tests for Vulnerability Scanner.
 *
 * Tests: OSV client mock responses, batch queries, severity filtering,
 * service unavailability, recommended-library scanning.
 *
 * Requirements: 10.1–10.7
 */

import { describe, it, expect } from 'vitest';
import { scanVulnerabilities } from '../src/security/vulnerability-scanner.js';
import { buildVulnReport, buildSarifOutput } from '../src/security/vuln-report-builder.js';
import { vulnMapKey, packageManagerToEcosystem } from '../src/security/osv-client.js';
import type { VulnerabilityClient, VulnerabilityRecord } from '../src/security/osv-client.js';
import type { RecommendedChange } from '../src/schemas/output.schema.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeVuln(
  id: string,
  severity: VulnerabilityRecord['severity'],
  fixedVersion: string | null = null,
): VulnerabilityRecord {
  return {
    id,
    aliases: [],
    summary: `Vuln ${id}`,
    details: `Details for ${id}`,
    severity,
    cvssScore: severity === 'critical' ? 9.8 : severity === 'high' ? 7.5 : 5.0,
    cvssVector: null,
    affectedVersionRange: '>=0.0.0',
    fixedVersion,
    publishedAt: '2026-01-15T00:00:00Z',
    withdrawnAt: null,
    references: ['https://example.com/advisory'],
  };
}

function makeRec(name: string, version: string): RecommendedChange {
  return {
    currentImplementation: {
      filePath: 'src/test.ts',
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
    estimatedEffort: 2,
    verificationStatus: 'verified',
  };
}

function makeMockClient(
  responses: Map<string, VulnerabilityRecord[]>,
): VulnerabilityClient {
  return {
    queryByPackage: async (eco, pkg, _ver) => {
      return responses.get(vulnMapKey(eco, pkg)) ?? [];
    },
    queryBatch: async (queries) => {
      const map = new Map<string, VulnerabilityRecord[]>();
      for (const q of queries) {
        const key = vulnMapKey(q.ecosystem, q.packageName);
        map.set(key, responses.get(key) ?? []);
      }
      return map;
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Vulnerability Scanner', () => {
  describe('scanVulnerabilities', () => {
    it('should return empty findings for clean dependencies', async () => {
      const client = makeMockClient(new Map());
      const result = await scanVulnerabilities(
        {
          currentLibraries: { lodash: '4.17.21', react: '18.2.0' },
          recommendedChanges: [],
          target: 'current',
          defaultEcosystem: 'npm',
        },
        client,
      );

      expect(result.findings).toHaveLength(0);
      expect(result.summary.totalDepsScanned).toBe(2);
      expect(result.summary.currentDepsScanned).toBe(2);
      expect(result.serviceUnavailable).toBe(false);
    });

    it('should detect vulnerabilities in current dependencies', async () => {
      const responses = new Map([
        [
          vulnMapKey('npm', 'lodash'),
          [
            makeVuln('GHSA-1111', 'critical', '4.17.22'),
            makeVuln('GHSA-2222', 'high'),
          ],
        ],
      ]);

      const client = makeMockClient(responses);
      const result = await scanVulnerabilities(
        {
          currentLibraries: { lodash: '4.17.20' },
          recommendedChanges: [],
          target: 'current',
          defaultEcosystem: 'npm',
        },
        client,
      );

      expect(result.findings).toHaveLength(2);
      expect(result.summary.critical).toBe(1);
      expect(result.summary.high).toBe(1);
      expect(result.summary.fixable).toBe(1);
      expect(result.summary.unfixable).toBe(1);
    });

    it('should scan recommended libraries with target="recommended"', async () => {
      const responses = new Map([
        [vulnMapKey('npm', 'date-fns'), [makeVuln('GHSA-3333', 'medium', '3.0.1')]],
      ]);

      const client = makeMockClient(responses);
      const result = await scanVulnerabilities(
        {
          currentLibraries: {},
          recommendedChanges: [makeRec('date-fns', '3.0.0')],
          target: 'recommended',
          defaultEcosystem: 'npm',
        },
        client,
      );

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]!.source).toBe('recommended');
      expect(result.findings[0]!.recommendationIndex).toBe(0);
      expect(result.summary.recommendedDepsScanned).toBe(1);
    });

    it('should scan both current and recommended with target="both"', async () => {
      const responses = new Map([
        [vulnMapKey('npm', 'lodash'), [makeVuln('GHSA-1111', 'critical')]],
        [vulnMapKey('npm', 'date-fns'), [makeVuln('GHSA-2222', 'low')]],
      ]);

      const client = makeMockClient(responses);
      const result = await scanVulnerabilities(
        {
          currentLibraries: { lodash: '4.17.20' },
          recommendedChanges: [makeRec('date-fns', '3.0.0')],
          target: 'both',
          defaultEcosystem: 'npm',
        },
        client,
      );

      expect(result.findings).toHaveLength(2);
      expect(result.findings.filter((f) => f.source === 'current')).toHaveLength(1);
      expect(result.findings.filter((f) => f.source === 'recommended')).toHaveLength(1);
      expect(result.summary.totalDepsScanned).toBe(2);
    });

    it('should filter by minimumSeverity', async () => {
      const responses = new Map([
        [
          vulnMapKey('npm', 'pkg'),
          [
            makeVuln('V-CRIT', 'critical'),
            makeVuln('V-HIGH', 'high'),
            makeVuln('V-MED', 'medium'),
            makeVuln('V-LOW', 'low'),
          ],
        ],
      ]);

      const client = makeMockClient(responses);
      const result = await scanVulnerabilities(
        {
          currentLibraries: { pkg: '1.0.0' },
          recommendedChanges: [],
          target: 'current',
          defaultEcosystem: 'npm',
          minimumSeverity: 'high',
        },
        client,
      );

      expect(result.findings).toHaveLength(2);
      expect(result.findings.every((f) => ['critical', 'high'].includes(f.vulnerability.severity))).toBe(true);
    });

    it('should return serviceUnavailable=true when client throws', async () => {
      const client: VulnerabilityClient = {
        queryByPackage: async () => { throw new Error('Network error'); },
        queryBatch: async () => { throw new Error('Network error'); },
      };

      const result = await scanVulnerabilities(
        {
          currentLibraries: { pkg: '1.0.0' },
          recommendedChanges: [],
          target: 'current',
          defaultEcosystem: 'npm',
        },
        client,
      );

      expect(result.serviceUnavailable).toBe(true);
      expect(result.findings).toHaveLength(0);
      expect(result.summary.totalDepsScanned).toBe(1);
    });

    it('should skip withdrawn vulnerabilities', async () => {
      const withdrawn: VulnerabilityRecord = {
        ...makeVuln('GHSA-WITHDRAWN', 'critical'),
        withdrawnAt: '2026-01-20T00:00:00Z',
      };
      const responses = new Map([
        [vulnMapKey('npm', 'pkg'), [withdrawn, makeVuln('GHSA-ACTIVE', 'high')]],
      ]);

      const client = makeMockClient(responses);
      const result = await scanVulnerabilities(
        {
          currentLibraries: { pkg: '1.0.0' },
          recommendedChanges: [],
          target: 'current',
          defaultEcosystem: 'npm',
        },
        client,
      );

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]!.vulnerability.id).toBe('GHSA-ACTIVE');
    });
  });

  describe('buildVulnReport', () => {
    it('should produce a markdown report with summary table', () => {
      const result = {
        findings: [
          {
            source: 'current' as const,
            packageName: 'lodash',
            installedVersion: '4.17.20',
            ecosystem: 'npm',
            vulnerability: makeVuln('GHSA-1111', 'critical', '4.17.22'),
            fixAvailable: '4.17.22',
          },
        ],
        summary: {
          totalDepsScanned: 5,
          currentDepsScanned: 4,
          recommendedDepsScanned: 1,
          critical: 1,
          high: 0,
          medium: 0,
          low: 0,
          fixable: 1,
          unfixable: 0,
        },
        serviceUnavailable: false,
      };

      const report = buildVulnReport(result);
      expect(report).toContain('# Vulnerability Scan Report');
      expect(report).toContain('Critical (1)');
      expect(report).toContain('GHSA-1111');
      expect(report).toContain('lodash@4.17.20');
    });

    it('should indicate service unavailability', () => {
      const report = buildVulnReport({
        findings: [],
        summary: {
          totalDepsScanned: 0,
          currentDepsScanned: 0,
          recommendedDepsScanned: 0,
          critical: 0, high: 0, medium: 0, low: 0,
          fixable: 0, unfixable: 0,
        },
        serviceUnavailable: true,
      });

      expect(report).toContain('Warning');
      expect(report).toContain('unreachable');
    });
  });

  describe('buildSarifOutput', () => {
    it('should produce valid SARIF structure', () => {
      const result = {
        findings: [
          {
            source: 'current' as const,
            packageName: 'lodash',
            installedVersion: '4.17.20',
            ecosystem: 'npm',
            vulnerability: makeVuln('GHSA-1111', 'critical'),
            fixAvailable: null,
          },
        ],
        summary: {
          totalDepsScanned: 1, currentDepsScanned: 1, recommendedDepsScanned: 0,
          critical: 1, high: 0, medium: 0, low: 0, fixable: 0, unfixable: 1,
        },
        serviceUnavailable: false,
      };

      const sarif = buildSarifOutput(result) as Record<string, unknown>;
      expect(sarif['version']).toBe('2.1.0');
      expect(sarif['$schema']).toContain('sarif');
      expect(Array.isArray(sarif['runs'])).toBe(true);
    });
  });

  describe('packageManagerToEcosystem', () => {
    it('should map known package managers', () => {
      expect(packageManagerToEcosystem('npm')).toBe('npm');
      expect(packageManagerToEcosystem('pnpm')).toBe('npm');
      expect(packageManagerToEcosystem('yarn')).toBe('npm');
      expect(packageManagerToEcosystem('pip')).toBe('PyPI');
      expect(packageManagerToEcosystem('cargo')).toBe('crates.io');
      expect(packageManagerToEcosystem('go')).toBe('Go');
    });

    it('should return null for unknown package managers', () => {
      expect(packageManagerToEcosystem('unknown')).toBeNull();
    });
  });
});
