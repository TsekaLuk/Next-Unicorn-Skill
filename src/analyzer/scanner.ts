import fs from 'node:fs';
import path from 'node:path';
import type { InputSchema } from '../schemas/input.schema.js';
import { getPatternCatalog, type PatternDefinition } from './pattern-catalog.js';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface Detection {
  filePath: string;
  lineRange: { start: number; end: number };
  patternCategory: string;
  confidenceScore: number;
  suggestedLibrary: string;
  domain: string;
}

export interface WorkspaceScan {
  root: string;
  packageManager: string;
  language: string;
  dependencies: Record<string, string>;
}

export interface ScanResult {
  detections: Detection[];
  workspaces: WorkspaceScan[];
}

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

// ---------------------------------------------------------------------------
// Workspace detection
// ---------------------------------------------------------------------------

/**
 * Detect workspace roots by scanning for manifest files.
 * For monorepos, each directory containing a manifest is a workspace root.
 */
function detectWorkspaces(repoPath: string): WorkspaceScan[] {
  const workspaces: WorkspaceScan[] = [];
  const visited = new Set<string>();

  for (const filePath of walkDir(repoPath)) {
    const dir = path.dirname(filePath);
    const basename = path.basename(filePath);

    for (const manifest of MANIFEST_TYPES) {
      if (basename === manifest.file && !visited.has(`${dir}:${manifest.file}`)) {
        visited.add(`${dir}:${manifest.file}`);
        let content: string;
        try {
          content = fs.readFileSync(filePath, 'utf-8');
        } catch {
          continue;
        }

        // Detect actual package manager from lockfiles
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
  }

  // If no workspaces found, create a root workspace from input metadata
  if (workspaces.length === 0) {
    workspaces.push({
      root: '.',
      packageManager: 'unknown',
      language: 'unknown',
      dependencies: {},
    });
  }

  return workspaces;
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
 * Returns detections for each pattern match found.
 */
function scanFile(
  filePath: string,
  relativeFilePath: string,
  catalog: PatternDefinition[],
): Detection[] {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
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
          // Determine the line range — include surrounding context
          const start = i + 1; // 1-indexed
          const end = Math.min(i + 1, lines.length); // at least the matched line

          detections.push({
            filePath: relativeFilePath,
            lineRange: { start, end },
            patternCategory: pattern.id,
            confidenceScore: pattern.confidenceBase,
            suggestedLibrary: pattern.suggestedLibrary,
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

  // Detect workspaces (monorepo support)
  const workspaces = detectWorkspaces(repoPath);

  // Walk the file tree and scan each source file
  const detections: Detection[] = [];

  for (const filePath of walkDir(repoPath)) {
    const relativeFilePath = path.relative(repoPath, filePath);
    const fileDetections = scanFile(filePath, relativeFilePath, catalog);
    detections.push(...fileDetections);
  }

  return { detections, workspaces };
}
