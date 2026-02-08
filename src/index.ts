/**
 * Next-Unicorn SKILL — Analyze and Recommend Third-Party Optimizations
 *
 * Scans codebases and recommends replacing hand-rolled implementations
 * with battle-tested third-party libraries.
 *
 * This is the orchestrator that wires the full pipeline:
 * validate input → scan → verify → score → plan → audit → filter → serialize
 */

import { ZodError } from 'zod';
import { InputSchema } from './schemas/input.schema.js';
import {
  OutputSchema,
  type RecommendedChange,
} from './schemas/output.schema.js';
import { scanCodebase } from './analyzer/scanner.js';
import { getPatternCatalog } from './analyzer/pattern-catalog.js';
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

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

export const VERSION = '0.1.0';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface AnalyzeOptions {
  /** Raw input to be validated against InputSchema */
  input: unknown;
  /** Injected Context7 client for testability — no real HTTP calls in tests */
  context7Client: Context7Client;
}

export type AnalyzeResult =
  | {
      success: true;
      output: OutputSchema;
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

// ---------------------------------------------------------------------------
// analyze — main orchestrator
// ---------------------------------------------------------------------------

/**
 * Run the full Next-Unicorn analysis pipeline.
 *
 * Pipeline steps:
 * 1. Validate input with InputSchema Zod schema
 * 2. Scan codebase with scanCodebase
 * 3. Verify all detections with Context7
 * 4. Score each detection
 * 5. Build RecommendedChange objects
 * 6. Apply dependency conflict detection
 * 7. Apply license filtering
 * 8. Build migration plan
 * 9. Audit UX completeness
 * 10. Assemble OutputSchema, serialize, and return
 *
 * Requirements: 1.1, 7.3
 */
export async function analyze(options: AnalyzeOptions): Promise<AnalyzeResult> {
  const { input, context7Client } = options;

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
  // Step 3: Verify all detections with Context7
  // -------------------------------------------------------------------------
  const verificationMap = await verifyAllRecommendations(
    context7Client,
    scanResult.detections,
  );

  // -------------------------------------------------------------------------
  // Step 4 & 5: Score each detection and build RecommendedChange objects
  // -------------------------------------------------------------------------
  const catalog = getPatternCatalog();
  const catalogMap = new Map(catalog.map((p) => [p.id, p]));

  const recommendations: RecommendedChange[] = scanResult.detections.map(
    (detection, index) => {
      const verification = verificationMap.get(index) ?? {
        status: 'unavailable' as const,
        note: 'No verification result available',
      };

      const scoringOutput = computeImpactScore({
        detection,
        verification,
        weights: validatedInput.impactWeights,
        priorityFocusAreas: validatedInput.priorityFocusAreas,
      });

      // Look up the pattern definition for version and license info
      const patternDef = catalogMap.get(detection.patternCategory);

      return {
        currentImplementation: {
          filePath: detection.filePath,
          lineRange: detection.lineRange,
          patternCategory: detection.patternCategory,
          confidenceScore: detection.confidenceScore,
        },
        recommendedLibrary: {
          name: detection.suggestedLibrary,
          version: patternDef?.suggestedVersion ?? 'latest',
          license: patternDef?.license ?? 'MIT',
          documentationUrl: verification.documentationUrl,
        },
        domain: detection.domain,
        impactScores: scoringOutput.scores,
        migrationRisk: scoringOutput.migrationRisk,
        estimatedEffort: scoringOutput.estimatedEffort,
        verificationStatus: verification.status,
        verificationNote: verification.note,
      };
    },
  );

  // -------------------------------------------------------------------------
  // Step 6: Apply dependency conflict detection
  // -------------------------------------------------------------------------
  const conflictChecked = detectDependencyConflicts(
    recommendations,
    validatedInput.projectMetadata.currentLibraries,
  );

  // -------------------------------------------------------------------------
  // Step 7: Apply license filtering
  // -------------------------------------------------------------------------
  const { recommendations: filteredRecommendations, exclusions } = filterByLicense(
    conflictChecked,
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
  // Step 10: Assemble OutputSchema, serialize, and return
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
    },
  };

  const json = serializeOutput(output);
  const prettyJson = prettyPrint(output);

  return {
    success: true,
    output,
    json,
    prettyJson,
    exclusions,
  };
}
