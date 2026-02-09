/**
 * Next-Unicorn SKILL — public API entry point.
 *
 * This file is a pure re-export surface. All orchestration logic
 * lives in orchestrator.ts (Occam's Razor: index.ts does not think).
 */

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

export const VERSION = '2.1.0';

// ---------------------------------------------------------------------------
// Orchestrator (main pipeline)
// ---------------------------------------------------------------------------

export { analyze } from './orchestrator.js';
export type {
  LibraryRecommendation,
  Recommender,
  GapRecommendation,
  AnalyzeOptions,
  AnalyzeResult,
  ExclusionRecord,
} from './orchestrator.js';

// ---------------------------------------------------------------------------
// Analyzer
// ---------------------------------------------------------------------------

export { scanCodebase } from './analyzer/scanner.js';
export { analyzeStructure } from './analyzer/structure-analyzer.js';
export { analyzeCodeOrganization } from './analyzer/code-organization-analyzer.js';
export { getPatternCatalog } from './analyzer/pattern-catalog.js';

// Types — all shared types come from types.ts (no circular deps)
export type {
  Detection,
  WorkspaceScan,
  ScanResult,
  StructuralFinding,
  StructuralAnalysis,
  CodeOrganizationStats,
} from './analyzer/types.js';
export type { CodeOrganizationAnalysis } from './analyzer/code-organization-analyzer.js';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export type { InputSchema } from './schemas/input.schema.js';
export type { OutputSchema, UxAuditItem } from './schemas/output.schema.js';

// ---------------------------------------------------------------------------
// Verifier
// ---------------------------------------------------------------------------

export type { Context7Client, VerificationResult } from './verifier/context7.js';

// ---------------------------------------------------------------------------
// Phase 2: Security, Updates, PRs
// ---------------------------------------------------------------------------

export type { VulnerabilityClient } from './security/osv-client.js';
export type { RegistryClient } from './updater/registry-client.js';
export type { PlatformClient } from './pr-creator/platform-client.js';
export type { GitOperations } from './pr-creator/git-operations.js';
export type { PeerDependencyResolver } from './checker/peer-dependency-checker.js';
