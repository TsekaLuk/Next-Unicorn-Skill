import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import type { InputSchema } from '../schemas/input.schema.js';
import { getPatternCatalog, type PatternDefinition } from './pattern-catalog.js';
import type {
  Detection,
  WorkspaceScan,
  ScanResult,
  StructuralFinding,
  StructuralAnalysis,
} from './types.js';

// Re-export types for backward compatibility
export type { Detection, WorkspaceScan, ScanResult } from './types.js';

// ---------------------------------------------------------------------------
// Workspace manifest files → package manager + language mapping
// ---------------------------------------------------------------------------

interface ManifestInfo {
  file: string;
  packageManager: string;
  language: string;
  parseDeps: (content: string) => Record<string, string>;
}

const MANIFEST_TYPES: ManifestInfo[] = [
  {
    file: 'package.json',
    packageManager: 'npm',
    language: 'typescript',
    parseDeps: (content: string): Record<string, string> => {
      try {
        const pkg = JSON.parse(content) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        return { ...pkg.dependencies, ...pkg.devDependencies };
      } catch {
        return {};
      }
    },
  },
  {
    file: 'pyproject.toml',
    packageManager: 'pip',
    language: 'python',
    parseDeps: (content: string): Record<string, string> => {
      const deps: Record<string, string> = {};
      // Simple regex to extract dependencies from pyproject.toml
      const depSection = /\[(?:project\.)?dependencies\]\s*\n([\s\S]*?)(?:\n\[|$)/;
      const match = depSection.exec(content);
      if (match?.[1]) {
        const lines = match[1].split('\n');
        for (const line of lines) {
          const depMatch = /^\s*["']?([a-zA-Z0-9_-]+)["']?\s*(?:[><=!~]+\s*["']?([^"',\s]+))?/.exec(line.trim());
          if (depMatch?.[1]) {
            deps[depMatch[1]] = depMatch[2] ?? '*';
          }
        }
      }
      return deps;
    },
  },
  {
    file: 'Cargo.toml',
    packageManager: 'cargo',
    language: 'rust',
    parseDeps: (content: string): Record<string, string> => {
      const deps: Record<string, string> = {};
      const depSection = /\[dependencies\]\s*\n([\s\S]*?)(?:\n\[|$)/;
      const match = depSection.exec(content);
      if (match?.[1]) {
        const lines = match[1].split('\n');
        for (const line of lines) {
          const depMatch = /^\s*([a-zA-Z0-9_-]+)\s*=\s*"([^"]+)"/.exec(line.trim());
          if (depMatch?.[1] && depMatch[2]) {
            deps[depMatch[1]] = depMatch[2];
          }
        }
      }
      return deps;
    },
  },
  {
    file: 'go.mod',
    packageManager: 'go',
    language: 'go',
    parseDeps: (content: string): Record<string, string> => {
      const deps: Record<string, string> = {};
      const requireBlock = /require\s*\(([\s\S]*?)\)/;
      const match = requireBlock.exec(content);
      if (match?.[1]) {
        const lines = match[1].split('\n');
        for (const line of lines) {
          const depMatch = /^\s*(\S+)\s+(\S+)/.exec(line.trim());
          if (depMatch?.[1] && depMatch[2]) {
            deps[depMatch[1]] = depMatch[2];
          }
        }
      }
      return deps;
    },
  },
];

// ---------------------------------------------------------------------------
// File-tree walking utilities
// ---------------------------------------------------------------------------

/** File extensions that are scannable source code */
const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rs', '.go', '.java', '.sql', '.xml',
]);

/** Directories to always skip when walking the file tree */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '__pycache__',
  '.venv',
  'venv',
  'target',
  'vendor',
  '.turbo',
  'coverage',
]);

/**
 * Recursively walk a directory and yield file paths.
 * Skips common non-source directories.
 */
function* walkDir(dir: string): Generator<string> {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    // Unreadable directory — skip silently (Req 9.1 edge case)
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        yield* walkDir(fullPath);
      }
    } else if (entry.isFile()) {
      yield fullPath;
    }
  }
}

/**
 * Check whether a file path matches any of the glob-like patterns.
 * Supports simple patterns: `**\/*.ext` and `*.ext`.
 */
function matchesFilePattern(filePath: string, patterns: string[]): boolean {
  const ext = path.extname(filePath);
  const basename = path.basename(filePath);

  for (const pattern of patterns) {
    // Handle **/*.ext patterns
    if (pattern.startsWith('**/')) {
      const suffix = pattern.slice(3); // e.g. "*.ts"
      if (suffix.startsWith('*.')) {
        const requiredExt = suffix.slice(1); // e.g. ".ts"
        if (ext === requiredExt) return true;
      } else if (basename === suffix) {
        return true;
      }
    }
    // Handle *.ext patterns
    else if (pattern.startsWith('*.')) {
      const requiredExt = pattern.slice(1);
      if (ext === requiredExt) return true;
    }
    // Exact filename match
    else if (basename === pattern) {
      return true;
    }
  }
  return false;
}

/**
 * Detect the Node.js package manager by checking for lockfiles.
 */
function detectNodePackageManager(dir: string): string {
  if (fileExists(path.join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fileExists(path.join(dir, 'yarn.lock'))) return 'yarn';
  if (fileExists(path.join(dir, 'bun.lockb'))) return 'bun';
  return 'npm';
}

function fileExists(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Pattern matching
// ---------------------------------------------------------------------------

/**
 * Scan a single file's content against the pattern catalog.
 * Uses async I/O to avoid blocking the event loop on large repos.
 * Returns detections for each pattern match found.
 */
async function scanFile(
  filePath: string,
  relativeFilePath: string,
  catalog: PatternDefinition[],
): Promise<Detection[]> {
  let content: string;
  try {
    content = await fsPromises.readFile(filePath, 'utf-8');
  } catch {
    // Unreadable file (binary, permissions) — skip
    return [];
  }

  // Skip very large files (likely generated/minified)
  if (content.length > 500_000) return [];

  const lines = content.split('\n');
  const detections: Detection[] = [];

  // Filter catalog to patterns whose filePatterns match this file
  const applicablePatterns = catalog.filter((p) =>
    matchesFilePattern(filePath, p.filePatterns),
  );

  for (const pattern of applicablePatterns) {
    for (const regex of pattern.codePatterns) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line !== undefined && regex.test(line)) {
          // Determine the line range — include surrounding context (±5 lines)
          const contextRadius = 5;
          const start = Math.max(1, i + 1 - contextRadius); // 1-indexed
          const end = Math.min(lines.length, i + 1 + contextRadius);

          detections.push({
            filePath: relativeFilePath,
            lineRange: { start, end },
            patternCategory: pattern.id,
            confidenceScore: pattern.confidenceBase,
            domain: pattern.domain,
          });

          // Only report the first match per pattern per file to avoid noise
          break;
        }
      }
    }
  }

  return detections;
}

// ---------------------------------------------------------------------------
// Main scanner entry point
// ---------------------------------------------------------------------------

/**
 * Scan a codebase for hand-rolled implementations that could be replaced
 * by third-party libraries.
 *
 * - Walks the file tree under `input.projectMetadata.repoPath`
 * - Detects workspace roots for monorepos (package.json, pyproject.toml, etc.)
 * - Matches source files against the pattern catalog
 * - Returns structured `ScanResult` with detections and workspace info
 */
export async function scanCodebase(input: InputSchema): Promise<ScanResult> {
  const repoPath = path.resolve(input.projectMetadata.repoPath);

  // Verify the repo path exists
  if (!fs.existsSync(repoPath)) {
    return { detections: [], workspaces: [] };
  }

  const catalog = getPatternCatalog();

  // ── Single-pass traversal: detect workspaces AND collect source files ──
  const workspaces: WorkspaceScan[] = [];
  const visitedManifests = new Set<string>();
  const sourceFiles: { filePath: string; relativeFilePath: string }[] = [];

  for (const filePath of walkDir(repoPath)) {
    const basename = path.basename(filePath);
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);

    // Workspace detection: check if this is a manifest file
    for (const manifest of MANIFEST_TYPES) {
      const key = `${dir}:${manifest.file}`;
      if (basename === manifest.file && !visitedManifests.has(key)) {
        visitedManifests.add(key);
        let content: string;
        try {
          content = fs.readFileSync(filePath, 'utf-8');
        } catch {
          continue;
        }
        let packageManager = manifest.packageManager;
        if (manifest.file === 'package.json') {
          packageManager = detectNodePackageManager(dir);
        }
        workspaces.push({
          root: path.relative(repoPath, dir) || '.',
          packageManager,
          language: manifest.language,
          dependencies: manifest.parseDeps(content),
        });
      }
    }

    // Collect source files for scanning
    if (SOURCE_EXTENSIONS.has(ext)) {
      sourceFiles.push({
        filePath,
        relativeFilePath: path.relative(repoPath, filePath),
      });
    }
  }

  // Default workspace if none detected
  if (workspaces.length === 0) {
    workspaces.push({
      root: '.',
      packageManager: 'unknown',
      language: 'unknown',
      dependencies: {},
    });
  }

  // ── Scan source files with async I/O (batched for throughput) ──
  const BATCH_SIZE = 50;
  const detections: Detection[] = [];

  for (let i = 0; i < sourceFiles.length; i += BATCH_SIZE) {
    const batch = sourceFiles.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((f) => scanFile(f.filePath, f.relativeFilePath, catalog)),
    );
    for (const result of batchResults) {
      detections.push(...result);
    }
  }

  // ── Structural analysis (design system layers, dependency flow) ──
  let structuralFindings: StructuralFinding[] | undefined;
  let designSystemLayers: StructuralAnalysis['designSystemLayers'] | undefined;

  if (workspaces.length > 1) {
    // Only run structural analysis for monorepos
    const { analyzeStructure } = await import('./structure-analyzer.js');
    const structural = analyzeStructure(repoPath, workspaces);
    if (structural.findings.length > 0) {
      structuralFindings = structural.findings;
    }
    designSystemLayers = structural.designSystemLayers;
  }

  // ── Code organization analysis (runs for ALL projects) ──
  const { analyzeCodeOrganization } = await import('./code-organization-analyzer.js');
  const codeOrgAnalysis = analyzeCodeOrganization(repoPath);

  if (codeOrgAnalysis.findings.length > 0) {
    structuralFindings = [
      ...(structuralFindings ?? []),
      ...codeOrgAnalysis.findings,
    ];
  }

  return {
    detections,
    workspaces,
    structuralFindings,
    designSystemLayers,
    codeOrganizationStats: codeOrgAnalysis.stats,
  };
}
