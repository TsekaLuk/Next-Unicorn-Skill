import fs from 'node:fs';
import path from 'node:path';
import type { StructuralFinding, CodeOrganizationStats } from './types.js';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface CodeOrganizationAnalysis {
  findings: StructuralFinding[];
  stats: CodeOrganizationStats;
}

// ---------------------------------------------------------------------------
// Constants — thresholds for code organization heuristics
//
// These thresholds are informed by the directory structures of
// Vercel (Next.js), Stripe (API docs), Linear, Supabase, shadcn/ui, Dub,
// and other reference Silicon Valley products. They represent the point
// where hand-rolled organization becomes unmaintainable and tools
// (eslint-plugin-import, knip, Barrel-file analyzers) are justified.
//
// Claude cannot determine these values without filesystem access.
// ---------------------------------------------------------------------------

/** Max source files in a single directory before it becomes a "god directory" */
const GOD_DIRECTORY_THRESHOLD = 15;

/** Max directory nesting depth from project root (src/) */
const MAX_NESTING_DEPTH = 5;

/** Max re-export lines in a barrel file */
const BARREL_BLOAT_THRESHOLD = 10;

/** Max files in a catch-all directory (utils/, helpers/, shared/, common/, lib/) */
const CATCH_ALL_THRESHOLD = 10;

/** Source file extensions to consider */
const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

/** Directories to skip during analysis */
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '__pycache__',
  '.venv', 'venv', 'target', 'vendor', '.turbo', 'coverage',
]);

/** Catch-all directory names that should be split by domain */
const CATCH_ALL_NAMES = new Set(['utils', 'helpers', 'common', 'shared', 'lib']);

// ---------------------------------------------------------------------------
// Naming convention detection
// ---------------------------------------------------------------------------

type NamingConvention = 'kebab-case' | 'camelCase' | 'PascalCase' | 'snake_case' | 'SCREAMING_SNAKE' | 'unknown';

function detectNamingConvention(filename: string): NamingConvention {
  // Strip extension and any leading dot
  const name = filename.replace(/\.[^.]+$/, '').replace(/^\./, '');
  if (!name || name === 'index') return 'unknown';

  if (/^[A-Z][A-Z0-9_]+$/.test(name)) return 'SCREAMING_SNAKE';
  if (/^[A-Z][a-zA-Z0-9]*$/.test(name)) return 'PascalCase';
  if (/^[a-z][a-zA-Z0-9]*$/.test(name)) return 'camelCase';
  if (/^[a-z][a-z0-9]*(-[a-z0-9]+)+$/.test(name)) return 'kebab-case';
  if (/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(name)) return 'snake_case';
  // Mixed patterns
  if (name.includes('-')) return 'kebab-case';
  if (name.includes('_')) return 'snake_case';
  if (/^[A-Z]/.test(name)) return 'PascalCase';
  return 'camelCase';
}

// ---------------------------------------------------------------------------
// File tree walking
// ---------------------------------------------------------------------------

interface DirEntry {
  name: string;
  fullPath: string;
  relativePath: string;
  isDirectory: boolean;
}

function* walkDirEntries(dir: string, repoPath: string): Generator<DirEntry> {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(repoPath, fullPath);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        yield { name: entry.name, fullPath, relativePath, isDirectory: true };
        yield* walkDirEntries(fullPath, repoPath);
      }
    } else if (entry.isFile()) {
      yield { name: entry.name, fullPath, relativePath, isDirectory: false };
    }
  }
}

// ---------------------------------------------------------------------------
// Import graph for circular dependency detection
// ---------------------------------------------------------------------------

/** Regex patterns to extract import/require paths from source files */
const IMPORT_PATTERNS = [
  /(?:import\s+(?:[\s\S]*?\s+from\s+)?['"`])(\.{1,2}\/[^'"`\n]+)['"`]/g,
  /(?:import\s*\(\s*['"`])(\.{1,2}\/[^'"`\n]+)['"`]/g,
  /require\s*\(\s*['"`](\.{1,2}\/[^'"`\n]+)['"`]\s*\)/g,
  /export\s+(?:\*|{[^}]*})\s+from\s+['"`](\.{1,2}\/[^'"`\n]+)['"`]/g,
];

function extractImports(filePath: string): string[] {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }
  if (content.length > 500_000) return [];

  const imports: string[] = [];
  for (const pattern of IMPORT_PATTERNS) {
    // Reset regex state
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (match[1]) imports.push(match[1]);
    }
  }
  return imports;
}

function resolveImportPath(fromFile: string, importPath: string): string | null {
  const fromDir = path.dirname(fromFile);
  let resolved = path.resolve(fromDir, importPath);

  // Try extensions if no extension present
  const ext = path.extname(resolved);
  if (!ext || !SOURCE_EXTS.has(ext)) {
    for (const tryExt of ['.ts', '.tsx', '.js', '.jsx']) {
      if (fs.existsSync(resolved + tryExt)) return resolved + tryExt;
    }
    // Try index file
    const indexPath = path.join(resolved, 'index');
    for (const tryExt of ['.ts', '.tsx', '.js', '.jsx']) {
      if (fs.existsSync(indexPath + tryExt)) return indexPath + tryExt;
    }
    return null;
  }
  return fs.existsSync(resolved) ? resolved : null;
}

/**
 * Detect circular dependencies using DFS cycle detection.
 * Returns arrays of file paths forming cycles.
 */
function detectCircularDependencies(
  sourceFiles: string[],
  repoPath: string,
): string[][] {
  // Build adjacency list
  const graph = new Map<string, string[]>();
  for (const file of sourceFiles) {
    const imports = extractImports(file);
    const resolved: string[] = [];
    for (const imp of imports) {
      const target = resolveImportPath(file, imp);
      if (target && sourceFiles.includes(target)) {
        resolved.push(target);
      }
    }
    graph.set(file, resolved);
  }

  // DFS cycle detection
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const onStack = new Set<string>();
  const pathStack: string[] = [];
  const seen = new Set<string>(); // deduplicate cycles

  function dfs(node: string): void {
    visited.add(node);
    onStack.add(node);
    pathStack.push(node);

    const neighbors = graph.get(node) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (onStack.has(neighbor)) {
        // Found a cycle — extract it
        const cycleStart = pathStack.indexOf(neighbor);
        if (cycleStart >= 0) {
          const cycle = pathStack.slice(cycleStart).map((f) => path.relative(repoPath, f));
          const key = [...cycle].sort().join('|');
          if (!seen.has(key)) {
            seen.add(key);
            cycles.push(cycle);
          }
        }
      }
    }

    pathStack.pop();
    onStack.delete(node);
  }

  for (const file of sourceFiles) {
    if (!visited.has(file)) {
      dfs(file);
    }
  }

  return cycles;
}

// ---------------------------------------------------------------------------
// analyzeCodeOrganization — main entry point
// ---------------------------------------------------------------------------

/**
 * Analyze project code organization for structural issues.
 *
 * Deterministic filesystem analysis that Claude cannot replicate:
 * - Counts files per directory (god directories)
 * - Reads filenames to check naming conventions
 * - Measures directory nesting depth
 * - Counts re-exports in barrel files
 * - Builds import graph to detect circular dependencies
 *
 * Recommendations (which pattern to adopt, which tools to use)
 * are the AI agent's responsibility.
 */
export function analyzeCodeOrganization(repoPath: string): CodeOrganizationAnalysis {
  const findings: StructuralFinding[] = [];
  const allSourceFiles: string[] = [];
  const namingConventions: Record<string, number> = {};

  // --- Collect directory info ---
  const dirFileCount = new Map<string, { count: number; files: string[] }>();
  let maxDepth = 0;

  for (const entry of walkDirEntries(repoPath, repoPath)) {
    if (entry.isDirectory) {
      // Track nesting depth
      const depth = entry.relativePath.split(path.sep).length;
      if (depth > maxDepth) maxDepth = depth;
    } else {
      const ext = path.extname(entry.name);
      if (!SOURCE_EXTS.has(ext)) continue;

      allSourceFiles.push(entry.fullPath);

      // Track naming convention
      const convention = detectNamingConvention(entry.name);
      if (convention !== 'unknown') {
        namingConventions[convention] = (namingConventions[convention] ?? 0) + 1;
      }

      // Track files per directory
      const dir = path.dirname(entry.relativePath);
      const existing = dirFileCount.get(dir);
      if (existing) {
        existing.count++;
        existing.files.push(entry.name);
      } else {
        dirFileCount.set(dir, { count: 1, files: [entry.name] });
      }
    }
  }

  // --- Check 1: God directories ---
  for (const [dir, info] of dirFileCount) {
    if (info.count > GOD_DIRECTORY_THRESHOLD) {
      findings.push({
        type: 'god-directory',
        domain: 'code-organization',
        description: `Directory "${dir}" contains ${info.count} source files (threshold: ${GOD_DIRECTORY_THRESHOLD}). Split by feature or domain.`,
        paths: [dir],
        severity: info.count > GOD_DIRECTORY_THRESHOLD * 2 ? 'critical' : 'warning',
        metadata: { fileCount: info.count, threshold: GOD_DIRECTORY_THRESHOLD },
      });
    }
  }

  // --- Check 2: Mixed naming conventions per directory ---
  for (const [dir, info] of dirFileCount) {
    if (info.files.length < 3) continue; // need enough files to judge

    const conventions = new Map<NamingConvention, string[]>();
    for (const file of info.files) {
      const conv = detectNamingConvention(file);
      if (conv === 'unknown') continue;
      const list = conventions.get(conv) ?? [];
      list.push(file);
      conventions.set(conv, list);
    }

    // Filter out conventions with only 1 file (noise)
    const significant = [...conventions.entries()].filter(([, files]) => files.length >= 2);
    if (significant.length >= 2) {
      const summary = significant
        .map(([conv, files]) => `${conv} (${files.length} files)`)
        .join(', ');
      findings.push({
        type: 'mixed-naming-convention',
        domain: 'code-organization',
        description: `Directory "${dir}" uses mixed naming conventions: ${summary}. Choose one convention and enforce it.`,
        paths: [dir],
        severity: 'warning',
        metadata: {
          conventions: Object.fromEntries(significant.map(([k, v]) => [k, v.length])),
        },
      });
    }
  }

  // --- Check 3: Deep nesting ---
  for (const entry of walkDirEntries(repoPath, repoPath)) {
    if (!entry.isDirectory) continue;
    const parts = entry.relativePath.split(path.sep);
    // Only measure from src/ or packages/ onwards
    const srcIdx = parts.indexOf('src');
    const depth = srcIdx >= 0 ? parts.length - srcIdx : parts.length;
    if (depth > MAX_NESTING_DEPTH) {
      findings.push({
        type: 'deep-nesting',
        domain: 'code-organization',
        description: `Directory "${entry.relativePath}" is ${depth} levels deep (max: ${MAX_NESTING_DEPTH}). Consider flattening or using path aliases.`,
        paths: [entry.relativePath],
        severity: 'warning',
        metadata: { depth, threshold: MAX_NESTING_DEPTH },
      });
    }
  }

  // --- Check 4: Barrel bloat (index files with many re-exports) ---
  for (const file of allSourceFiles) {
    const basename = path.basename(file, path.extname(file));
    if (basename !== 'index') continue;

    let content: string;
    try {
      content = fs.readFileSync(file, 'utf-8');
    } catch {
      continue;
    }

    const reexportCount = (content.match(/export\s+(?:\*|{[^}]*})\s+from\s+['"`]/g) ?? []).length;
    if (reexportCount > BARREL_BLOAT_THRESHOLD) {
      const relativePath = path.relative(repoPath, file);
      findings.push({
        type: 'barrel-bloat',
        domain: 'code-organization',
        description: `Barrel file "${relativePath}" has ${reexportCount} re-exports (threshold: ${BARREL_BLOAT_THRESHOLD}). Consider direct imports or code-splitting.`,
        paths: [relativePath],
        severity: reexportCount > BARREL_BLOAT_THRESHOLD * 2 ? 'critical' : 'warning',
        metadata: { reexportCount, threshold: BARREL_BLOAT_THRESHOLD },
      });
    }
  }

  // --- Check 5: Catch-all directories ---
  for (const [dir, info] of dirFileCount) {
    const dirName = path.basename(dir);
    if (!CATCH_ALL_NAMES.has(dirName)) continue;
    if (info.count > CATCH_ALL_THRESHOLD) {
      findings.push({
        type: 'catch-all-directory',
        domain: 'code-organization',
        description: `Catch-all directory "${dir}" contains ${info.count} files (threshold: ${CATCH_ALL_THRESHOLD}). Split into domain-specific modules (e.g., utils/date, utils/string, utils/validation).`,
        paths: [dir],
        severity: info.count > CATCH_ALL_THRESHOLD * 2 ? 'critical' : 'warning',
        metadata: { fileCount: info.count, threshold: CATCH_ALL_THRESHOLD },
      });
    }
  }

  // --- Check 6: Mixed export styles (default + multiple named in same file) ---
  for (const file of allSourceFiles) {
    const basename = path.basename(file, path.extname(file));
    if (basename === 'index') continue; // barrel files are expected to have many exports

    let content: string;
    try {
      content = fs.readFileSync(file, 'utf-8');
    } catch {
      continue;
    }

    const hasDefaultExport = /export\s+default\s/.test(content);
    const namedExportCount = (content.match(/export\s+(?:function|class|const|let|var|enum|type|interface)\s+\w/g) ?? []).length;

    if (hasDefaultExport && namedExportCount >= 3) {
      const relativePath = path.relative(repoPath, file);
      findings.push({
        type: 'god-directory', // reuse closest type — file is a "god module"
        domain: 'code-organization',
        description: `File "${relativePath}" mixes a default export with ${namedExportCount} named exports. One module, one responsibility — split into separate files.`,
        paths: [relativePath],
        severity: 'info',
        metadata: { hasDefaultExport, namedExportCount, issue: 'mixed-export-style' },
      });
    }
  }

  // --- Check 7: Circular dependencies ---
  const cycles = detectCircularDependencies(allSourceFiles, repoPath);
  for (const cycle of cycles) {
    findings.push({
      type: 'circular-dependency',
      domain: 'code-organization',
      description: `Circular dependency detected: ${cycle.join(' → ')} → ${cycle[0]}`,
      paths: cycle,
      severity: cycle.length > 3 ? 'critical' : 'warning',
      metadata: { cycleLength: cycle.length },
    });
  }

  return {
    findings,
    stats: {
      totalSourceFiles: allSourceFiles.length,
      maxDirectoryDepth: maxDepth,
      namingConventions,
      circularDependencyCount: cycles.length,
    },
  };
}
