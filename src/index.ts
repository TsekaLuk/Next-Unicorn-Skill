/**
 * Next-Unicorn SKILL — Analyze and Recommend Third-Party Optimizations
 *
 * Scans codebases and identifies hand-rolled implementations that could be
 * replaced by third-party libraries. Library recommendations are provided
 * by the caller (AI agent or programmatic client) — NOT hardcoded.
 *
 * This is the orchestrator that wires the full pipeline:
 * validate input → scan → recommend (caller) → verify → score → plan →
 * audit → filter → vuln scan → auto-update → serialize → PR creation
 */

import { ZodError } from 'zod';
import { InputSchema } from './schemas/input.schema.js';
import {
  OutputSchema,
  type RecommendedChange,
  type VulnReport,
  type UpdatePlan,
} from './schemas/output.schema.js';
import { scanCodebase, type Detection, type ScanResult } from './analyzer/scanner.js';
import {
  verifyAllRecommendations,
  type Context7Client,
} from './verifier/context7.js';
import { computeImpactScore } from './scorer/impact-scorer.js';
import { buildMigrationPlan } from './planner/migration-planner.js';
import { auditUxCompleteness } from './auditor/ux-auditor.js';
import {
  filterByLicense,
  detectDependencyConflicts,
  type ExclusionRecord,
} from './utils/constraint-filter.js';
import { serializeOutput, prettyPrint } from './utils/serializer.js';
import {
  checkPeerDependencies,
  type PeerDependencyResolver,
  type PeerDependencyWarning,
} from './checker/peer-dependency-checker.js';

// Phase 2 imports
import type { VulnerabilityClient } from './security/osv-client.js';
import { scanVulnerabilities } from './security/vulnerability-scanner.js';
import type { RegistryClient } from './updater/registry-client.js';
import { applyUpdatePolicy } from './updater/update-policy.js';
import { verifyChangelog } from './updater/changelog-verifier.js';
import { scoreUpdate } from './updater/update-scorer.js';
import { buildUpdatePlan } from './updater/update-plan-builder.js';
import { planPRs } from './pr-creator/pr-strategy.js';
import { executePRPlans } from './pr-creator/pr-executor.js';
import type { PlatformClient } from './pr-creator/platform-client.js';
import type { GitOperations } from './pr-creator/git-operations.js';

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

export const VERSION = '1.0.2';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

/**
 * A companion package that forms part of the full recommended solution.
 */
export interface EcosystemPackage {
  /** Package name (e.g., "@lingui/macro") */
  library: string;
  /** Version constraint */
  version: string;
  /** Role in the ecosystem (e.g., "compile-time extraction", "TMS integration") */
  role: string;
}

/**
 * A library recommendation provided by the AI agent (or caller).
 *
 * The scanner detects WHAT is hand-rolled; the recommender decides WHAT to use.
 * Recommendations should target unicorn-grade solutions: not just "a library
 * that does this", but the specific combination of tools that the best
 * engineering teams use, configured the way they configure it.
 *
 * A recommendation can be a single library OR a full ecosystem stack.
 */
export interface LibraryRecommendation {
  /** Primary library name (e.g., "@lingui/core") */
  library: string;
  /** Version constraint (e.g., "^4.0.0") */
  version: string;
  /** SPDX license identifier (e.g., "MIT") */
  license: string;
  /**
   * WHY this specific library/stack is the right choice for this project.
   * Should reference project context (framework, runtime, scale).
   * Example: "Lingui uses compile-time extraction with near-zero runtime
   * overhead; integrates with Crowdin TMS for professional translation workflows"
   */
  rationale?: string;
  /**
   * Companion packages that form the full unicorn-grade solution.
   * Example: @lingui/macro (zero-runtime tagged templates),
   * @lingui/cli (CI extraction), crowdin (TMS integration)
   */
  ecosystem?: EcosystemPackage[];
  /**
   * How this recommendation connects to the broader architectural stack.
   * Example: "Combine with next-intl routing for App Router i18n,
   * or use standalone with Vite plugin for SPA"
   */
  stackContext?: string;
}

/**
 * Function that provides library recommendations for detections.
 * Called once per detection. Return null to skip a detection (no recommendation).
 *
 * In AI agent mode: the agent fills this based on its knowledge + Context7.
 * In programmatic/test mode: the caller provides a deterministic function.
 */
export type Recommender = (detection: Detection) => LibraryRecommendation | null;

export interface AnalyzeOptions {
  /** Raw input to be validated against InputSchema */
  input: unknown;
  /** Injected Context7 client for testability — no real HTTP calls in tests */
  context7Client: Context7Client;
  /**
   * Recommender function: maps each detection to a library recommendation.
   * This is the key integration point for AI agents — the agent decides
   * which library best fits each detected pattern based on project context.
   */
  recommender: Recommender;
  /** Optional — if provided, enables vulnerability scanning */
  vulnClient?: VulnerabilityClient;
  /** Optional — if provided, enables auto-update recommendations */
  registryClient?: RegistryClient;
  /** Required only if prPolicy.enabled is true */
  platformClient?: PlatformClient;
  /** Required only if prPolicy.enabled is true */
  gitOps?: GitOperations;
  /** Optional — if provided, resolves peer dependency metadata for recommended libraries */
  peerDependencyResolver?: PeerDependencyResolver;
}

export type AnalyzeResult =
  | {
      success: true;
      output: OutputSchema;
      /** Raw scan result (detections + workspaces) for AI agent further analysis */
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

// ---------------------------------------------------------------------------
// Re-exports for consumer convenience
// ---------------------------------------------------------------------------

export type { Context7Client, VerificationResult } from './verifier/context7.js';
export type { ExclusionRecord } from './utils/constraint-filter.js';
export type { InputSchema } from './schemas/input.schema.js';
export type { OutputSchema } from './schemas/output.schema.js';
export type { Detection, ScanResult } from './analyzer/scanner.js';
export type { VulnerabilityClient } from './security/osv-client.js';
export type { RegistryClient } from './updater/registry-client.js';
export type { PlatformClient } from './pr-creator/platform-client.js';
export type { GitOperations } from './pr-creator/git-operations.js';
export type { PeerDependencyResolver } from './checker/peer-dependency-checker.js';
export { scanCodebase } from './analyzer/scanner.js';
export { getPatternCatalog } from './analyzer/pattern-catalog.js';

// ---------------------------------------------------------------------------
// analyze — main orchestrator
// ---------------------------------------------------------------------------

/**
 * Run the full Next-Unicorn analysis pipeline.
 *
 * Pipeline steps:
 * 1.  Validate input with InputSchema Zod schema
 * 2.  Scan codebase with scanCodebase
 * 2.5 Get library recommendations from the recommender (AI agent / caller)
 * 3.  Verify recommendations with Context7
 * 4.  Score each detection
 * 5.  Build RecommendedChange objects
 * 6.  Apply dependency conflict detection
 * 6.5 Vulnerability scanning (optional — Phase 2)
 * 7.  Apply license filtering
 * 8.  Build migration plan
 * 9.  Audit UX completeness
 * 10. Auto-update existing dependencies (optional — Phase 2)
 * 11. Assemble OutputSchema, serialize
 * 12. PR auto-creation (optional — Phase 2)
 * 13. Return result
 */
export async function analyze(options: AnalyzeOptions): Promise<AnalyzeResult> {
  const { input, context7Client, recommender } = options;

  // -------------------------------------------------------------------------
  // Step 1: Validate input
  // -------------------------------------------------------------------------
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
    return {
      success: false,
      error: `Input validation failed: ${String(err)}`,
    };
  }

  // -------------------------------------------------------------------------
  // Step 2: Scan codebase
  // -------------------------------------------------------------------------
  const scanResult = await scanCodebase(validatedInput);

  // -------------------------------------------------------------------------
  // Step 2.5: Get library recommendations from the recommender
  // -------------------------------------------------------------------------
  const libraryRecs = scanResult.detections.map((detection) => recommender(detection));

  // -------------------------------------------------------------------------
  // Step 3: Verify recommendations with Context7
  // -------------------------------------------------------------------------
  const verificationItems = scanResult.detections.map((detection, i) => {
    const rec = libraryRecs[i];
    return rec
      ? { libraryName: rec.library, useCase: detection.patternCategory }
      : null;
  });
  const verificationMap = await verifyAllRecommendations(
    context7Client,
    verificationItems,
  );

  // -------------------------------------------------------------------------
  // Step 4 & 5: Score each detection and build RecommendedChange objects
  // -------------------------------------------------------------------------
  const recommendations: RecommendedChange[] = [];

  for (let i = 0; i < scanResult.detections.length; i++) {
    const detection = scanResult.detections[i]!;
    const rec = libraryRecs[i];
    if (!rec) continue; // Skip detections without recommendations

    const verification = verificationMap.get(i) ?? {
      status: 'unavailable' as const,
      note: 'No verification result available',
    };

    const scoringOutput = computeImpactScore({
      detection,
      verification,
      weights: validatedInput.impactWeights,
      priorityFocusAreas: validatedInput.priorityFocusAreas,
    });

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
        ecosystem: rec.ecosystem?.map((e) => ({
          library: e.library,
          version: e.version,
          role: e.role,
        })),
        stackContext: rec.stackContext,
      },
      domain: detection.domain,
      impactScores: scoringOutput.scores,
      migrationRisk: scoringOutput.migrationRisk,
      estimatedEffort: scoringOutput.estimatedEffort,
      verificationStatus: verification.status,
      verificationNote: verification.note,
    });
  }

  // -------------------------------------------------------------------------
  // Step 6: Apply dependency conflict detection
  // -------------------------------------------------------------------------
  const conflictChecked = detectDependencyConflicts(
    recommendations,
    validatedInput.projectMetadata.currentLibraries,
  );

  // -------------------------------------------------------------------------
  // Step 6.25: Check peer dependencies
  // -------------------------------------------------------------------------
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
    // Unexpected error — fall back to empty warnings and original recommendations
    peerWarnings = [];
    peerCheckedRecommendations = conflictChecked;
  }

  // -------------------------------------------------------------------------
  // Step 6.5: Vulnerability scanning (optional — Phase 2)
  // -------------------------------------------------------------------------
  let vulnerabilityReport: VulnReport | undefined;
  if (options.vulnClient) {
    const defaultEcosystem = detectDefaultEcosystem(
      validatedInput.projectMetadata.packageManagers,
    );
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

  // -------------------------------------------------------------------------
  // Step 7: Apply license filtering
  // -------------------------------------------------------------------------
  const { recommendations: filteredRecommendations, exclusions } = filterByLicense(
    peerCheckedRecommendations,
    validatedInput.constraints.licenseAllowlist,
  );

  // -------------------------------------------------------------------------
  // Step 8: Build migration plan
  // -------------------------------------------------------------------------
  const migrationPlan = buildMigrationPlan(filteredRecommendations);

  // -------------------------------------------------------------------------
  // Step 9: Audit UX completeness
  // -------------------------------------------------------------------------
  const uxAuditResult = auditUxCompleteness(scanResult, validatedInput.projectMetadata);

  // -------------------------------------------------------------------------
  // Step 10: Auto-update existing dependencies (optional — Phase 2)
  // -------------------------------------------------------------------------
  let updatePlan: UpdatePlan | undefined;
  if (
    validatedInput.updatePolicy?.enabled &&
    options.registryClient
  ) {
    const policy = validatedInput.updatePolicy;
    const defaultEcosystem = detectDefaultEcosystem(
      validatedInput.projectMetadata.packageManagers,
    );

    try {
      // Fetch version info for all current libraries
      const queries = Object.entries(validatedInput.projectMetadata.currentLibraries).map(
        ([name, version]) => ({
          ecosystem: defaultEcosystem,
          packageName: name,
          currentVersion: version,
        }),
      );

      const versionInfoMap = await options.registryClient.getVersionInfoBatch(queries);

      // Apply update policy
      const candidates = applyUpdatePolicy(versionInfoMap, {
        defaultStrategy: policy.defaultStrategy,
        packageOverrides: policy.packageOverrides,
        maxUpdates: policy.maxUpdates,
        minAgeDays: policy.minAgeDays,
        groupRelatedPackages: policy.groupRelatedPackages,
        pinned: policy.pinned,
      }, defaultEcosystem);

      // Verify changelogs via Context7
      const changelogs = await Promise.all(
        candidates.map((c) =>
          verifyChangelog(
            context7Client,
            c.packageName,
            c.currentVersion,
            c.targetVersion,
          ),
        ),
      );

      // Score each update
      const scores = candidates.map((candidate, index) =>
        scoreUpdate({
          candidate,
          changelog: changelogs[index]!,
        }),
      );

      // Build update plan
      updatePlan = buildUpdatePlan(candidates, scores, changelogs);
    } catch {
      // Registry unavailable — skip update plan silently
      updatePlan = undefined;
    }
  }

  // -------------------------------------------------------------------------
  // Step 11: Assemble OutputSchema
  // -------------------------------------------------------------------------

  // Compute lines saved estimate from deletion checklist
  const linesSavedEstimate = migrationPlan.deletionChecklist.reduce((total, item) => {
    if (item.lineRange) {
      return total + (item.lineRange.end - item.lineRange.start + 1);
    }
    return total;
  }, 0);

  // Collect files to delete from the deletion checklist
  const filesToDelete = [
    ...new Set(migrationPlan.deletionChecklist.map((item) => item.filePath)),
  ];

  const output: OutputSchema = {
    recommendedChanges: filteredRecommendations,
    filesToDelete,
    linesSavedEstimate,
    uxAudit: uxAuditResult.items,
    migrationPlan: {
      phases: migrationPlan.phases,
      deletionChecklist: migrationPlan.deletionChecklist,
      peerDependencyWarnings: peerWarnings,
    },
    // Phase 2 optional sections
    vulnerabilityReport,
    updatePlan,
  };

  // -------------------------------------------------------------------------
  // Step 12: PR auto-creation (optional — Phase 2)
  // -------------------------------------------------------------------------
  if (
    validatedInput.prPolicy?.enabled &&
    options.platformClient &&
    options.gitOps
  ) {
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

  // -------------------------------------------------------------------------
  // Step 13: Serialize and return
  // -------------------------------------------------------------------------
  const json = serializeOutput(output);
  const prettyJson = prettyPrint(output);

  return {
    success: true,
    output,
    scanResult,
    json,
    prettyJson,
    exclusions,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Detect default ecosystem from package manager list.
 */
function detectDefaultEcosystem(packageManagers: string[]): string {
  const ecosystemMap: Record<string, string> = {
    npm: 'npm',
    pnpm: 'npm',
    yarn: 'npm',
    bun: 'npm',
    pip: 'PyPI',
    cargo: 'crates.io',
    go: 'Go',
  };

  for (const pm of packageManagers) {
    const eco = ecosystemMap[pm];
    if (eco) return eco;
  }

  return 'npm';
}
