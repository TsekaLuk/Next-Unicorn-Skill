/**
 * Next-Unicorn SKILL — Analyze and Recommend Third-Party Optimizations
 *
 * Scans codebases and identifies hand-rolled implementations that could be
 * replaced by third-party libraries. Library recommendations are provided
 * by the caller (AI agent or programmatic client) — NOT hardcoded.
 *
 * Redundant modules removed (Occam's Razor):
 * - impact-scorer → inlined (trivial math)
 * - migration-planner → inlined (group-by-risk + sort)
 * - ux-auditor → AI-agent-driven (Claude reads package.json better)
 * - constraint-filter → inlined (Set.has)
 * - serializer → inlined (JSON.stringify)
 * - update-scorer, update-plan-builder, changelog-verifier → simplified
 * - pr-description-builder → AI agent writes better PR descriptions
 * - skill-parser, vuln-report-builder → dead code deleted
 */

import { ZodError } from 'zod';
import { InputSchema } from './schemas/input.schema.js';
import {
  OutputSchema,
  type RecommendedChange,
  type VulnReport,
  type UpdatePlan,
  type UxAuditItem,
} from './schemas/output.schema.js';
import { scanCodebase, type Detection, type ScanResult } from './analyzer/scanner.js';
import {
  verifyRecommendation,
  verifyAllRecommendations,
  type Context7Client,
} from './verifier/context7.js';
import {
  checkPeerDependencies,
  type PeerDependencyResolver,
  type PeerDependencyWarning,
} from './checker/peer-dependency-checker.js';

// Phase 2 imports (kept — non-trivial external API logic)
import type { VulnerabilityClient } from './security/osv-client.js';
import { scanVulnerabilities } from './security/vulnerability-scanner.js';
import type { RegistryClient } from './updater/registry-client.js';
import { applyUpdatePolicy } from './updater/update-policy.js';
import { planPRs } from './pr-creator/pr-strategy.js';
import { executePRPlans } from './pr-creator/pr-executor.js';
import type { PlatformClient } from './pr-creator/platform-client.js';
import type { GitOperations } from './pr-creator/git-operations.js';

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

export const VERSION = '1.0.8';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

/**
 * A library recommendation provided by the AI agent (or caller).
 */
export interface LibraryRecommendation {
  library: string;
  version: string;
  license: string;
  rationale?: string;
  ecosystem?: Array<{ library: string; version: string; role: string }>;
  antiPatterns?: string[];
  alternatives?: Array<{ library: string; when: string }>;
}

export type Recommender = (detection: Detection) => LibraryRecommendation | null;

/**
 * A capability gap — something the project SHOULD have but DOESN'T.
 */
export interface GapRecommendation {
  domain: string;
  description: string;
  recommendedLibrary: {
    name: string;
    version: string;
    license: string;
    documentationUrl?: string;
    rationale?: string;
    ecosystem?: Array<{ library: string; version: string; role: string }>;
    antiPatterns?: string[];
    alternatives?: Array<{ library: string; when: string }>;
  };
  priority: 'critical' | 'recommended' | 'nice-to-have';
  verificationStatus?: 'verified' | 'unverified' | 'unavailable';
  verificationNote?: string;
}

export interface AnalyzeOptions {
  input: unknown;
  context7Client: Context7Client;
  recommender: Recommender;
  gaps?: GapRecommendation[];
  /** Optional UX audit items — AI agent provides these based on project analysis */
  uxAudit?: UxAuditItem[];
  vulnClient?: VulnerabilityClient;
  registryClient?: RegistryClient;
  platformClient?: PlatformClient;
  gitOps?: GitOperations;
  peerDependencyResolver?: PeerDependencyResolver;
}

export type AnalyzeResult =
  | {
      success: true;
      output: OutputSchema;
      scanResult: ScanResult;
      json: string;
      prettyJson: string;
      exclusions: ExclusionRecord[];
    }
  | {
      success: false;
      error: string;
      issues?: unknown;
    };

export interface ExclusionRecord {
  libraryName: string;
  license: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export type { Context7Client, VerificationResult } from './verifier/context7.js';
export type { InputSchema } from './schemas/input.schema.js';
export type { OutputSchema, UxAuditItem } from './schemas/output.schema.js';
export type { Detection, ScanResult } from './analyzer/scanner.js';
export type { StructuralFinding, StructuralAnalysis } from './analyzer/structure-analyzer.js';
export type { CodeOrganizationAnalysis } from './analyzer/code-organization-analyzer.js';
export { scanCodebase } from './analyzer/scanner.js';
export { analyzeStructure } from './analyzer/structure-analyzer.js';
export { analyzeCodeOrganization } from './analyzer/code-organization-analyzer.js';
export { getPatternCatalog } from './analyzer/pattern-catalog.js';
export type { VulnerabilityClient } from './security/osv-client.js';
export type { RegistryClient } from './updater/registry-client.js';
export type { PlatformClient } from './pr-creator/platform-client.js';
export type { GitOperations } from './pr-creator/git-operations.js';
export type { PeerDependencyResolver } from './checker/peer-dependency-checker.js';

// ---------------------------------------------------------------------------
// analyze — main orchestrator
// ---------------------------------------------------------------------------

export async function analyze(options: AnalyzeOptions): Promise<AnalyzeResult> {
  const { input, context7Client, recommender } = options;

  // Step 1: Validate input
  let validatedInput: InputSchema;
  try {
    validatedInput = InputSchema.parse(input);
  } catch (err) {
    if (err instanceof ZodError) {
      return {
        success: false,
        error: `Input validation failed: ${err.errors.map((e) => e.message).join(', ')}`,
        issues: err.errors,
      };
    }
    return { success: false, error: `Input validation failed: ${String(err)}` };
  }

  // Step 2: Scan codebase
  const scanResult = await scanCodebase(validatedInput);

  // Step 2.5: Get library recommendations
  const libraryRecs = scanResult.detections.map((detection) => recommender(detection));

  // Step 3: Verify recommendations with Context7
  const verificationItems = scanResult.detections.map((detection, i) => {
    const rec = libraryRecs[i];
    return rec ? { libraryName: rec.library, useCase: detection.patternCategory } : null;
  });
  const verificationMap = await verifyAllRecommendations(context7Client, verificationItems);

  // Step 4 & 5: Score + build RecommendedChange (inlined)
  const recommendations: RecommendedChange[] = [];
  for (let i = 0; i < scanResult.detections.length; i++) {
    const detection = scanResult.detections[i]!;
    const rec = libraryRecs[i];
    if (!rec) continue;

    const verification = verificationMap.get(i) ?? {
      status: 'unavailable' as const,
      note: 'No verification result available',
    };

    // Inline scoring: confidence → base score, uniform across dimensions
    const baseScore = Math.max(1, Math.min(10, Math.round(3 + detection.confidenceScore * 4)));
    const composite = Math.round(baseScore * 10) / 10;

    // Inline risk derivation
    const migrationRisk: 'low' | 'medium' | 'high' =
      verification.status === 'unavailable' ? 'high'
      : detection.confidenceScore >= 0.7 && verification.status === 'verified' ? 'low'
      : detection.confidenceScore >= 0.4 ? 'medium'
      : 'high';

    // Inline effort estimation
    const lineCount = detection.lineRange.end - detection.lineRange.start + 1;
    const riskMul = migrationRisk === 'low' ? 1.0 : migrationRisk === 'medium' ? 1.5 : 2.5;
    const estimatedEffort = Math.round((2.0 + lineCount * 0.1) * riskMul * 10) / 10;

    recommendations.push({
      currentImplementation: {
        filePath: detection.filePath,
        lineRange: detection.lineRange,
        patternCategory: detection.patternCategory,
        confidenceScore: detection.confidenceScore,
      },
      recommendedLibrary: {
        name: rec.library,
        version: rec.version,
        license: rec.license,
        documentationUrl: verification.documentationUrl,
        rationale: rec.rationale,
        ecosystem: rec.ecosystem,
        antiPatterns: rec.antiPatterns,
        alternatives: rec.alternatives,
      },
      domain: detection.domain,
      impactScores: {
        scalability: baseScore,
        performance: baseScore,
        security: baseScore,
        maintainability: baseScore,
        feature_richness: baseScore,
        ux: baseScore,
        ui_aesthetics: baseScore,
        composite,
      },
      migrationRisk,
      estimatedEffort,
      verificationStatus: verification.status,
      verificationNote: verification.note,
    });
  }

  // Step 6: Dependency conflict detection (inlined)
  const conflictChecked = recommendations.map((rec) => {
    const existing = validatedInput.projectMetadata.currentLibraries[rec.recommendedLibrary.name];
    return existing !== undefined ? { ...rec, migrationRisk: 'high' as const } : rec;
  });

  // Step 6.25: Peer dependency check
  let peerWarnings: PeerDependencyWarning[] = [];
  let peerCheckedRecommendations: RecommendedChange[] = conflictChecked;
  try {
    const resolver: PeerDependencyResolver = options.peerDependencyResolver ?? {
      resolve: async () => ({}),
    };
    const peerCheckResult = await checkPeerDependencies(
      conflictChecked,
      validatedInput.projectMetadata.currentLibraries,
      resolver,
    );
    peerWarnings = peerCheckResult.warnings;
    peerCheckedRecommendations = peerCheckResult.recommendations;
  } catch {
    peerWarnings = [];
    peerCheckedRecommendations = conflictChecked;
  }

  // Step 6.5: Vulnerability scanning (optional)
  let vulnerabilityReport: VulnReport | undefined;
  if (options.vulnClient) {
    const defaultEcosystem = detectDefaultEcosystem(validatedInput.projectMetadata.packageManagers);
    const vulnResult = await scanVulnerabilities(
      {
        currentLibraries: validatedInput.projectMetadata.currentLibraries,
        recommendedChanges: peerCheckedRecommendations,
        target: 'both',
        defaultEcosystem,
      },
      options.vulnClient,
    );
    vulnerabilityReport = {
      findings: vulnResult.findings.map((f) => ({
        source: f.source,
        packageName: f.packageName,
        installedVersion: f.installedVersion,
        ecosystem: f.ecosystem,
        vulnerabilityId: f.vulnerability.id,
        aliases: f.vulnerability.aliases,
        severity: f.vulnerability.severity,
        cvssScore: f.vulnerability.cvssScore,
        summary: f.vulnerability.summary,
        fixAvailable: f.fixAvailable,
        recommendationIndex: f.recommendationIndex,
      })),
      summary: vulnResult.summary,
      serviceUnavailable: vulnResult.serviceUnavailable,
    };
  }

  // Step 7: License filtering (inlined)
  const licenseAllowlist = validatedInput.constraints.licenseAllowlist;
  const allowSet = new Set(licenseAllowlist);
  const exclusions: ExclusionRecord[] = [];
  const filteredRecommendations = licenseAllowlist.length === 0
    ? [...peerCheckedRecommendations]
    : peerCheckedRecommendations.filter((rec) => {
        if (allowSet.has(rec.recommendedLibrary.license)) return true;
        exclusions.push({
          libraryName: rec.recommendedLibrary.name,
          license: rec.recommendedLibrary.license,
          reason: `License "${rec.recommendedLibrary.license}" is not in the allowlist [${licenseAllowlist.join(', ')}]`,
        });
        return false;
      });

  // Step 8: Migration plan (inlined — group by risk, sort by file + composite)
  const riskGroups: Record<string, Array<{ index: number; rec: RecommendedChange }>> = {
    low: [], medium: [], high: [],
  };
  for (let i = 0; i < filteredRecommendations.length; i++) {
    const rec = filteredRecommendations[i]!;
    riskGroups[rec.migrationRisk]!.push({ index: i, rec });
  }
  for (const risk of ['low', 'medium', 'high'] as const) {
    riskGroups[risk]!.sort((a, b) => {
      const f = a.rec.currentImplementation.filePath.localeCompare(b.rec.currentImplementation.filePath);
      return f !== 0 ? f : b.rec.impactScores.composite - a.rec.impactScores.composite;
    });
  }
  const riskNames = { low: 'Low-Risk Quick Wins', medium: 'Medium-Risk Improvements', high: 'High-Risk Transformations' };
  const phases = (['low', 'medium', 'high'] as const)
    .filter((r) => riskGroups[r]!.length > 0)
    .map((risk, idx) => ({
      phase: idx + 1,
      name: riskNames[risk],
      steps: riskGroups[risk]!.map((item) => {
        const step: { recommendationIndex: number; description: string; adapterStrategy?: { wrapperInterface: string; legacyCode: string; targetLibrary: string; description: string } } = {
          recommendationIndex: item.index,
          description: `Replace ${item.rec.currentImplementation.patternCategory} in ${item.rec.currentImplementation.filePath} with ${item.rec.recommendedLibrary.name}${risk === 'high' ? ' using adapter strategy' : risk === 'low' ? ' (quick win)' : ''}`,
        };
        if (risk === 'high') {
          step.adapterStrategy = item.rec.adapterStrategy ?? {
            wrapperInterface: `I${item.rec.currentImplementation.patternCategory}Adapter`,
            legacyCode: item.rec.currentImplementation.filePath,
            targetLibrary: item.rec.recommendedLibrary.name,
            description: `Adapter wrapping legacy ${item.rec.currentImplementation.patternCategory} implementation to transition to ${item.rec.recommendedLibrary.name}`,
          };
        }
        return step;
      }),
    }));
  const deletionChecklist = filteredRecommendations.map((rec) => ({
    filePath: rec.currentImplementation.filePath,
    lineRange: rec.currentImplementation.lineRange,
    reason: `Replaced ${rec.currentImplementation.patternCategory} with ${rec.recommendedLibrary.name}`,
  }));

  // Step 9: UX audit — AI-agent-driven (empty default, agent fills via options.uxAudit)
  const uxAudit: UxAuditItem[] = options.uxAudit ?? [];

  // Step 10: Auto-update (simplified — uses update-policy, skips removed scorer/builder)
  let updatePlan: UpdatePlan | undefined;
  if (validatedInput.updatePolicy?.enabled && options.registryClient) {
    const policy = validatedInput.updatePolicy;
    const defaultEcosystem = detectDefaultEcosystem(validatedInput.projectMetadata.packageManagers);
    try {
      const queries = Object.entries(validatedInput.projectMetadata.currentLibraries).map(
        ([name, version]) => ({ ecosystem: defaultEcosystem, packageName: name, currentVersion: version }),
      );
      const versionInfoMap = await options.registryClient.getVersionInfoBatch(queries);
      const candidates = applyUpdatePolicy(versionInfoMap, {
        defaultStrategy: policy.defaultStrategy,
        packageOverrides: policy.packageOverrides,
        maxUpdates: policy.maxUpdates,
        minAgeDays: policy.minAgeDays,
        groupRelatedPackages: policy.groupRelatedPackages,
        pinned: policy.pinned,
      }, defaultEcosystem);

      // Simplified: build update items with defaults (AI agent enriches)
      const updates = candidates.map((c) => ({
        packageName: c.packageName,
        ecosystem: c.ecosystem,
        currentVersion: c.currentVersion,
        targetVersion: c.targetVersion,
        updateType: c.updateType,
        urgency: 'routine' as const,
        breakingRisk: 'none' as const,
        impactScores: { scalability: 5, performance: 5, security: 5, maintainability: 5, feature_richness: 5, ux: 5, ui_aesthetics: 5, composite: 5 },
        estimatedEffort: 0.5,
        hasBreakingChanges: false,
        vulnFixCount: 0,
        groupKey: c.groupKey,
      }));

      const groupMap = new Map<string, typeof updates>();
      for (const item of updates) {
        if (item.groupKey) {
          const g = groupMap.get(item.groupKey) ?? [];
          g.push(item);
          groupMap.set(item.groupKey, g);
        }
      }

      updatePlan = {
        updates,
        groups: [...groupMap.entries()]
          .filter(([, items]) => items.length > 1)
          .map(([groupKey, items]) => ({ groupKey, items, urgency: 'routine' as const })),
        summary: {
          totalUpdatesAvailable: updates.length,
          critical: 0,
          urgent: 0,
          recommended: 0,
          routine: updates.length,
          estimatedTotalEffort: updates.reduce((sum, u) => sum + u.estimatedEffort, 0),
        },
      };
    } catch {
      updatePlan = undefined;
    }
  }

  // Step 11: Assemble output
  const linesSavedEstimate = deletionChecklist.reduce((total, item) => {
    if (item.lineRange) return total + (item.lineRange.end - item.lineRange.start + 1);
    return total;
  }, 0);

  const filesToDelete = [...new Set(deletionChecklist.map((item) => item.filePath))];

  const output: OutputSchema = {
    recommendedChanges: filteredRecommendations,
    filesToDelete,
    linesSavedEstimate,
    uxAudit,
    migrationPlan: { phases, deletionChecklist, peerDependencyWarnings: peerWarnings },
    gapAnalysis: await verifyGaps(options.gaps, context7Client),
    vulnerabilityReport,
    updatePlan,
  };

  // Step 12: PR auto-creation (optional)
  if (validatedInput.prPolicy?.enabled && options.platformClient && options.gitOps) {
    const prPolicy = validatedInput.prPolicy;
    const prPlans = planPRs({
      output,
      policy: {
        enabled: prPolicy.enabled,
        maxOpenPRs: prPolicy.maxOpenPRs,
        groupUpdates: prPolicy.groupUpdates,
        separateSecurityPRs: prPolicy.separateSecurityPRs,
        createMigrationPRs: prPolicy.createMigrationPRs,
        labels: prPolicy.labels,
        reviewers: prPolicy.reviewers,
        draft: prPolicy.draft,
        branchPrefix: prPolicy.branchPrefix,
      },
    });
    const prResults = await executePRPlans({
      plans: prPlans,
      platformClient: options.platformClient,
      gitOps: options.gitOps,
      labels: prPolicy.labels,
      reviewers: prPolicy.reviewers,
      draft: prPolicy.draft,
    });
    output.pullRequests = prResults;
  }

  // Step 13: Return
  return {
    success: true,
    output,
    scanResult,
    json: JSON.stringify(output),
    prettyJson: JSON.stringify(output, null, 2),
    exclusions,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectDefaultEcosystem(packageManagers: string[]): string {
  const map: Record<string, string> = { npm: 'npm', pnpm: 'npm', yarn: 'npm', bun: 'npm', pip: 'PyPI', cargo: 'crates.io', go: 'Go' };
  for (const pm of packageManagers) { if (map[pm]) return map[pm]!; }
  return 'npm';
}

async function verifyGaps(
  gaps: GapRecommendation[] | undefined,
  client: Context7Client,
): Promise<GapRecommendation[] | undefined> {
  if (!gaps || gaps.length === 0) return undefined;
  const verified: GapRecommendation[] = [];
  for (const gap of gaps) {
    const result = await verifyRecommendation(client, gap.recommendedLibrary.name, gap.description);
    verified.push({
      ...gap,
      recommendedLibrary: {
        ...gap.recommendedLibrary,
        documentationUrl: gap.recommendedLibrary.documentationUrl ?? result.documentationUrl,
      },
      verificationStatus: result.status,
      verificationNote: result.note,
    });
  }
  return verified;
}
