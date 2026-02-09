import fs from 'node:fs';
import path from 'node:path';
import type { WorkspaceScan, StructuralFinding, StructuralAnalysis } from './types.js';

// Re-export types for backward compatibility
export type { StructuralFinding, StructuralAnalysis } from './types.js';

// ---------------------------------------------------------------------------
// Design system layer detection
// ---------------------------------------------------------------------------

/** Package name patterns that indicate a design system layer */
const TOKEN_PATTERNS = ['design-tokens', 'tokens', 'theme-tokens', 'primitives'];
const CONFIG_PATTERNS = ['tailwind-config', 'shared-config', 'config'];
const UI_PATTERNS = ['ui', 'components', 'design-system', 'component-library'];

function matchesAny(name: string, patterns: string[]): boolean {
  const lower = name.toLowerCase();
  return patterns.some((p) => lower.includes(p));
}

// ---------------------------------------------------------------------------
// analyzeStructure — main entry point
// ---------------------------------------------------------------------------

/**
 * Analyze the structural architecture of a monorepo for design system patterns.
 *
 * Checks:
 * 1. Whether design system layers exist (tokens → config → ui)
 * 2. Whether dependency flow is unidirectional
 * 3. Whether app tailwind configs use shared presets
 * 4. Whether tailwind configs contain hardcoded color values
 *
 * This is a deterministic structural analysis — no regex on code content,
 * just package.json parsing and config file inspection.
 */
export function analyzeStructure(
  repoPath: string,
  workspaces: WorkspaceScan[],
): StructuralAnalysis {
  const findings: StructuralFinding[] = [];

  // --- Step 1: Classify workspaces into design system layers ---
  const tokenPaths: string[] = [];
  const configPaths: string[] = [];
  const uiPaths: string[] = [];
  const appPaths: string[] = [];

  for (const ws of workspaces) {
    const name = path.basename(ws.root);
    if (matchesAny(name, TOKEN_PATTERNS)) {
      tokenPaths.push(ws.root);
    } else if (matchesAny(name, CONFIG_PATTERNS)) {
      configPaths.push(ws.root);
    } else if (matchesAny(name, UI_PATTERNS)) {
      uiPaths.push(ws.root);
    } else if (ws.root.startsWith('apps/') || ws.root.startsWith('apps\\')) {
      appPaths.push(ws.root);
    }
  }

  const hasTokens = tokenPaths.length > 0;
  const hasConfig = configPaths.length > 0;
  const hasUI = uiPaths.length > 0;

  // --- Step 2: Check for missing layers ---
  if (workspaces.length > 1) {
    // Only check if it's a monorepo
    if (!hasTokens && (hasConfig || hasUI)) {
      findings.push({
        type: 'missing-layer',
        domain: 'design-system',
        description: 'Monorepo has UI/config packages but no design token package. Design values lack a single source of truth.',
        paths: uiPaths.concat(configPaths),
        severity: 'critical',
      });
    }
    if (hasTokens && !hasConfig && hasUI) {
      findings.push({
        type: 'missing-layer',
        domain: 'design-system',
        description: 'Monorepo has token and UI packages but no shared Tailwind config package. Each app may duplicate the token-to-Tailwind mapping.',
        paths: tokenPaths.concat(uiPaths),
        severity: 'warning',
      });
    }
    if (!hasUI && hasTokens) {
      findings.push({
        type: 'missing-layer',
        domain: 'design-system',
        description: 'Monorepo has token package but no shared UI component library. Components may be duplicated across apps.',
        paths: tokenPaths,
        severity: 'warning',
      });
    }
  }

  // --- Step 3: Check dependency flow violations ---
  for (const ws of workspaces) {
    const isToken = tokenPaths.includes(ws.root);
    const isConfig = configPaths.includes(ws.root);
    const isUI = uiPaths.includes(ws.root);

    for (const dep of Object.keys(ws.dependencies)) {
      // Token layer should not depend on config or UI
      if (isToken) {
        for (const cfgWs of workspaces) {
          if (configPaths.includes(cfgWs.root) || uiPaths.includes(cfgWs.root)) {
            const pkgName = readPackageName(path.resolve(repoPath, cfgWs.root));
            if (pkgName && dep === pkgName) {
              findings.push({
                type: 'dependency-violation',
                domain: 'design-system',
                description: `Token package "${ws.root}" depends on "${cfgWs.root}" — tokens should be the bottom layer with no upward dependencies.`,
                paths: [ws.root, cfgWs.root],
                severity: 'critical',
              });
            }
          }
        }
      }
      // Config layer should not depend on UI
      if (isConfig) {
        for (const uiWs of workspaces) {
          if (uiPaths.includes(uiWs.root)) {
            const pkgName = readPackageName(path.resolve(repoPath, uiWs.root));
            if (pkgName && dep === pkgName) {
              findings.push({
                type: 'dependency-violation',
                domain: 'design-system',
                description: `Config package "${ws.root}" depends on UI package "${uiWs.root}" — config should not depend on UI.`,
                paths: [ws.root, uiWs.root],
                severity: 'critical',
              });
            }
          }
        }
      }
      // UI should not depend on apps
      if (isUI) {
        for (const appWs of workspaces) {
          if (appPaths.includes(appWs.root)) {
            const pkgName = readPackageName(path.resolve(repoPath, appWs.root));
            if (pkgName && dep === pkgName) {
              findings.push({
                type: 'dependency-violation',
                domain: 'design-system',
                description: `UI package "${ws.root}" depends on app "${appWs.root}" — UI should not depend on apps.`,
                paths: [ws.root, appWs.root],
                severity: 'critical',
              });
            }
          }
        }
      }
    }
  }

  // --- Step 4: Check tailwind config sharing in apps ---
  for (const appRoot of appPaths) {
    const tailwindConfigPath = findTailwindConfig(path.resolve(repoPath, appRoot));
    if (tailwindConfigPath && hasConfig) {
      const content = safeReadFile(tailwindConfigPath);
      if (content && !content.includes('presets')) {
        findings.push({
          type: 'missing-shared-preset',
          domain: 'design-system',
          description: `App "${appRoot}" tailwind.config does not use shared presets — may duplicate design values.`,
          paths: [path.relative(repoPath, tailwindConfigPath)],
          severity: 'warning',
        });
      }
    }
  }

  // --- Step 5: Check for hardcoded colors in tailwind configs ---
  for (const ws of workspaces) {
    const tailwindConfigPath = findTailwindConfig(path.resolve(repoPath, ws.root));
    if (tailwindConfigPath) {
      const content = safeReadFile(tailwindConfigPath);
      if (content && /['"`]#[0-9a-fA-F]{3,8}['"`]/.test(content)) {
        findings.push({
          type: 'hardcoded-config-values',
          domain: 'design-system',
          description: `Tailwind config in "${ws.root}" contains hardcoded hex colors — should reference CSS variables or token imports.`,
          paths: [path.relative(repoPath, tailwindConfigPath)],
          severity: 'warning',
        });
      }
    }
  }

  return {
    findings,
    designSystemLayers: {
      hasTokens,
      hasConfig,
      hasUI,
      hasDocs: workspaces.some((ws) => {
        const name = path.basename(ws.root);
        return name === 'docs' || name === 'documentation';
      }),
      tokenPaths,
      configPaths,
      uiPaths,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readPackageName(pkgDir: string): string | null {
  const pkgJsonPath = path.join(pkgDir, 'package.json');
  try {
    const content = fs.readFileSync(pkgJsonPath, 'utf-8');
    const pkg = JSON.parse(content) as { name?: string };
    return pkg.name ?? null;
  } catch {
    return null;
  }
}

function findTailwindConfig(dir: string): string | null {
  const candidates = [
    'tailwind.config.ts',
    'tailwind.config.js',
    'tailwind.config.mjs',
    'tailwind.config.cjs',
  ];
  for (const name of candidates) {
    const fullPath = path.join(dir, name);
    if (fs.existsSync(fullPath)) return fullPath;
  }
  return null;
}

function safeReadFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}
