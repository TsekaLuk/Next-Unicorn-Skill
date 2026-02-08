/**
 * Vulnerability report builders — produces human-readable markdown
 * and machine-readable SARIF output from scan results.
 *
 * Requirements: 10.7
 */

import type { VulnScanResult, VulnFinding } from './vulnerability-scanner.js';

// ---------------------------------------------------------------------------
// Markdown report
// ---------------------------------------------------------------------------

/**
 * Build a markdown vulnerability report suitable for PR comments
 * or terminal output.
 */
export function buildVulnReport(result: VulnScanResult): string {
  const lines: string[] = [];

  lines.push('# Vulnerability Scan Report');
  lines.push('');

  if (result.serviceUnavailable) {
    lines.push('> **Warning:** Vulnerability database was unreachable. Results may be incomplete.');
    lines.push('');
  }

  // Summary table
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Count |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total dependencies scanned | ${result.summary.totalDepsScanned} |`);
  lines.push(`| Current deps scanned | ${result.summary.currentDepsScanned} |`);
  lines.push(`| Recommended deps scanned | ${result.summary.recommendedDepsScanned} |`);
  lines.push(`| Critical | ${result.summary.critical} |`);
  lines.push(`| High | ${result.summary.high} |`);
  lines.push(`| Medium | ${result.summary.medium} |`);
  lines.push(`| Low | ${result.summary.low} |`);
  lines.push(`| Fixable | ${result.summary.fixable} |`);
  lines.push(`| Unfixable | ${result.summary.unfixable} |`);
  lines.push('');

  if (result.findings.length === 0) {
    lines.push('No vulnerabilities found.');
    return lines.join('\n');
  }

  // Group by severity
  const bySeverity = groupBySeverity(result.findings);

  for (const severity of ['critical', 'high', 'medium', 'low'] as const) {
    const group = bySeverity[severity];
    if (!group || group.length === 0) continue;

    lines.push(`## ${severity.charAt(0).toUpperCase() + severity.slice(1)} (${group.length})`);
    lines.push('');

    for (const finding of group) {
      const vuln = finding.vulnerability;
      const fix = finding.fixAvailable ? `Fix: upgrade to ${finding.fixAvailable}` : 'No fix available';
      const source = finding.source === 'recommended' ? ' (recommended library)' : '';

      lines.push(`### ${vuln.id}${source}`);
      lines.push('');
      lines.push(`- **Package:** ${finding.packageName}@${finding.installedVersion}`);
      lines.push(`- **Summary:** ${vuln.summary}`);
      lines.push(`- **CVSS:** ${vuln.cvssScore ?? 'N/A'}`);
      lines.push(`- **${fix}**`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// SARIF output
// ---------------------------------------------------------------------------

/**
 * Build a SARIF (Static Analysis Results Interchange Format) output
 * for CI/CD integration (GitHub Code Scanning, etc.).
 */
export function buildSarifOutput(result: VulnScanResult): object {
  const rules = result.findings.map((f) => ({
    id: f.vulnerability.id,
    shortDescription: { text: f.vulnerability.summary },
    fullDescription: { text: f.vulnerability.details },
    defaultConfiguration: {
      level: sarifLevel(f.vulnerability.severity),
    },
    helpUri: f.vulnerability.references[0] ?? '',
  }));

  const results = result.findings.map((f) => ({
    ruleId: f.vulnerability.id,
    message: {
      text: `${f.packageName}@${f.installedVersion} is affected by ${f.vulnerability.id}: ${f.vulnerability.summary}`,
    },
    level: sarifLevel(f.vulnerability.severity),
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: 'package.json' },
        },
      },
    ],
    properties: {
      source: f.source,
      ecosystem: f.ecosystem,
      fixAvailable: f.fixAvailable,
    },
  }));

  return {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'Next-Unicorn Vulnerability Scanner',
            version: '1.0.0',
            rules,
          },
        },
        results,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupBySeverity(findings: VulnFinding[]): Record<string, VulnFinding[]> {
  const groups: Record<string, VulnFinding[]> = {};
  for (const f of findings) {
    const sev = f.vulnerability.severity;
    if (!groups[sev]) groups[sev] = [];
    groups[sev]!.push(f);
  }
  return groups;
}

function sarifLevel(severity: string): string {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'error';
    case 'medium':
      return 'warning';
    default:
      return 'note';
  }
}
