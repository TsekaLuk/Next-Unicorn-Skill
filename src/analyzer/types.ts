// ---------------------------------------------------------------------------
// Shared types for the analyzer module
//
// Extracted to break circular dependencies:
//   scanner.ts → structure-analyzer.ts → scanner.ts
//   scanner.ts → code-organization-analyzer.ts → structure-analyzer.ts → scanner.ts
//
// All cross-module types live here. Each analyzer imports from types.ts only.
// ---------------------------------------------------------------------------

/**
 * A structural finding detected by filesystem analysis.
 * Used by structure-analyzer (design system) and code-organization-analyzer.
 */
export interface StructuralFinding {
  /** Type of structural issue */
  type:
    | 'missing-layer'           // expected architectural layer missing
    | 'dependency-violation'    // package depends on something it shouldn't
    | 'config-duplication'      // multiple packages define same config
    | 'missing-shared-preset'   // app tailwind config not using shared preset
    | 'hardcoded-config-values' // config file contains hardcoded design values
    // Code organization types
    | 'god-directory'           // directory with too many source files
    | 'mixed-naming-convention' // files in same directory use different naming styles
    | 'deep-nesting'            // directory tree exceeds reasonable depth
    | 'barrel-bloat'            // index file with excessive re-exports
    | 'catch-all-directory'     // utils/helpers/shared with too many unrelated files
    | 'circular-dependency';    // files forming import cycles
  /** Vibe Coding domain this relates to */
  domain: string;
  /** Human-readable description */
  description: string;
  /** File/directory paths relevant to this finding */
  paths: string[];
  /** Severity level */
  severity: 'critical' | 'warning' | 'info';
  /** Optional structured metadata for tooling */
  metadata?: Record<string, unknown>;
}

/**
 * Design system layer analysis result.
 */
export interface StructuralAnalysis {
  findings: StructuralFinding[];
  /** Detected design system layers (if any) */
  designSystemLayers: {
    hasTokens: boolean;
    hasConfig: boolean;
    hasUI: boolean;
    hasDocs: boolean;
    tokenPaths: string[];
    configPaths: string[];
    uiPaths: string[];
  };
}

/**
 * A single workspace detected during codebase scanning.
 */
export interface WorkspaceScan {
  root: string;
  packageManager: string;
  language: string;
  dependencies: Record<string, string>;
}

/**
 * A hand-rolled code detection from the scanner.
 */
export interface Detection {
  filePath: string;
  lineRange: { start: number; end: number };
  patternCategory: string;
  confidenceScore: number;
  domain: string;
}

/**
 * Code organization analysis stats.
 */
export interface CodeOrganizationStats {
  totalSourceFiles: number;
  maxDirectoryDepth: number;
  /** Naming convention distribution: kebab → count, camelCase → count, etc. */
  namingConventions: Record<string, number>;
  circularDependencyCount: number;
}

/**
 * Full scan result returned by scanCodebase().
 */
export interface ScanResult {
  detections: Detection[];
  workspaces: WorkspaceScan[];
  /** Structural analysis of monorepo architecture (design system layers, dependency flow) */
  structuralFindings?: StructuralFinding[];
  /** Detected design system layer info */
  designSystemLayers?: StructuralAnalysis['designSystemLayers'];
  /** Code organization analysis stats */
  codeOrganizationStats?: CodeOrganizationStats;
}
