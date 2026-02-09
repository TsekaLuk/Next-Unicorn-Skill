import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { analyze, VERSION } from '../src/index.js';
import type { Recommender, LibraryRecommendation } from '../src/index.js';
import type { Context7Client } from '../src/verifier/context7.js';
import { OutputSchema } from '../src/schemas/output.schema.js';
import type { InputSchema } from '../src/schemas/input.schema.js';
import type { Detection } from '../src/analyzer/scanner.js';
import type { PeerDependencyResolver } from '../src/checker/peer-dependency-checker.js';

// ---------------------------------------------------------------------------
// Helpers — temporary directory management
// ---------------------------------------------------------------------------

let tmpDir: string;

function createTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'orchestrator-test-'));
}

function writeFile(relativePath: string, content: string): void {
  const fullPath = path.join(tmpDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf-8');
}

// ---------------------------------------------------------------------------
// Mock Context7 client
// ---------------------------------------------------------------------------

function makeMockContext7Client(): Context7Client {
  return {
    resolveLibraryId: async (name: string) => `ctx7/${name}`,
    getLibraryDocs: async (_id: string, _uc: string) => ({
      url: `https://example.com/docs`,
      version: '1.0.0',
    }),
  };
}

// ---------------------------------------------------------------------------
// Mock recommender — simulates what an AI agent would do
// ---------------------------------------------------------------------------

/**
 * Default mock recommender: recommends a test library for every detection.
 * In real usage, the AI agent would use its knowledge to recommend the best
 * library for each detection's domain and project context.
 */
function makeMockRecommender(
  overrides?: Partial<LibraryRecommendation>,
): Recommender {
  return (_detection: Detection) => ({
    library: overrides?.library ?? 'test-library',
    version: overrides?.version ?? '^1.0.0',
    license: overrides?.license ?? 'MIT',
  });
}

/**
 * Domain-aware mock recommender for more realistic testing.
 */
function makeDomainRecommender(): Recommender {
  const domainLibraries: Record<string, LibraryRecommendation> = {
    'i18n': { library: '@lingui/core', version: '^4.0.0', license: 'MIT' },
    'seo': { library: 'next-seo', version: '^6.0.0', license: 'MIT' },
    'growth-hacking': { library: 'posthog-js', version: '^1.100.0', license: 'MIT' },
    'observability': { library: 'pino', version: '^9.0.0', license: 'MIT' },
    'auth-security': { library: 'jose', version: '^5.0.0', license: 'MIT' },
    'state-management': { library: 'zustand', version: '^5.0.0', license: 'MIT' },
    'error-handling-resilience': { library: 'react-error-boundary', version: '^4.0.0', license: 'MIT' },
    'database-orm-migrations': { library: 'drizzle-orm', version: '^0.35.0', license: 'Apache-2.0' },
  };
  return (detection: Detection) =>
    domainLibraries[detection.domain] ?? { library: `lib-for-${detection.domain}`, version: '^1.0.0', license: 'MIT' };
}

// ---------------------------------------------------------------------------
// Valid input builder
// ---------------------------------------------------------------------------

function makeValidInput(overrides?: Partial<InputSchema>): InputSchema {
  return {
    projectMetadata: {
      repoPath: tmpDir,
      languages: ['typescript'],
      packageManagers: ['npm'],
      currentLibraries: {},
    },
    optimizationGoals: ['performance', 'maintainability'],
    constraints: {
      licenseAllowlist: [],
      excludedLibraries: [],
    },
    priorityFocusAreas: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  tmpDir = createTmpDir();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// VERSION export preserved
// ---------------------------------------------------------------------------

describe('VERSION export', () => {
  it('still exports VERSION alongside the orchestrator', () => {
    expect(VERSION).toBe('1.0.2');
  });
});

// ---------------------------------------------------------------------------
// End-to-end pipeline — success path
// ---------------------------------------------------------------------------

describe('analyze — end-to-end success', () => {
  it('returns success with valid output for a codebase with detections', async () => {
    // Write files that trigger known patterns
    writeFile('package.json', JSON.stringify({
      name: 'test-app',
      dependencies: { react: '^18.0.0' },
    }));
    writeFile('src/utils.ts', `
      function formatCount(count: number) {
        return count === 1 ? 'item' : 'items';
      }
    `);
    writeFile('src/logger.ts', `
      function log(msg: string) {
        console.log('[APP]', msg);
      }
    `);

    const result = await analyze({
      input: makeValidInput(),
      context7Client: makeMockContext7Client(),
      recommender: makeDomainRecommender(),
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    // Output should have recommendations
    expect(result.output.recommendedChanges.length).toBeGreaterThan(0);

    // Output should be valid against OutputSchema
    const parsed = OutputSchema.safeParse(result.output);
    expect(parsed.success).toBe(true);

    // JSON serialization should be present
    expect(result.json).toBeTruthy();
    expect(typeof result.json).toBe('string');

    // Pretty JSON should have indentation
    expect(result.prettyJson).toContain('\n');
    expect(result.prettyJson).toContain('  ');

    // JSON should be parseable back
    const reparsed = JSON.parse(result.json);
    expect(reparsed.recommendedChanges).toBeDefined();

    // scanResult should be included for AI agent further analysis
    expect(result.scanResult).toBeDefined();
    expect(result.scanResult.detections.length).toBeGreaterThan(0);
  });

  it('output matches OutputSchema Zod validation', async () => {
    writeFile('src/app.ts', `
      const variant = Math.random() < 0.5 ? 'control' : 'treatment';
    `);

    const result = await analyze({
      input: makeValidInput(),
      context7Client: makeMockContext7Client(),
      recommender: makeMockRecommender(),
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    // Validate every field of the output against the Zod schema
    const parsed = OutputSchema.parse(result.output);
    expect(parsed.recommendedChanges).toBeInstanceOf(Array);
    expect(parsed.filesToDelete).toBeInstanceOf(Array);
    expect(typeof parsed.linesSavedEstimate).toBe('number');
    expect(parsed.uxAudit).toBeInstanceOf(Array);
    expect(parsed.migrationPlan).toBeDefined();
    expect(parsed.migrationPlan.phases).toBeInstanceOf(Array);
    expect(parsed.migrationPlan.deletionChecklist).toBeInstanceOf(Array);
  });

  it('includes all 8 UX audit categories in output', async () => {
    writeFile('src/index.ts', 'export const x = 1;');

    const result = await analyze({
      input: makeValidInput(),
      context7Client: makeMockContext7Client(),
      recommender: makeMockRecommender(),
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const categories = result.output.uxAudit.map((item) => item.category);
    expect(categories).toContain('accessibility');
    expect(categories).toContain('error-states');
    expect(categories).toContain('empty-states');
    expect(categories).toContain('loading-states');
    expect(categories).toContain('form-validation');
    expect(categories).toContain('performance-feel');
    expect(categories).toContain('copy-consistency');
    expect(categories).toContain('design-system-alignment');
    expect(categories.length).toBe(8);
  });

  it('each recommended change has valid verification status', async () => {
    writeFile('src/utils.ts', `
      const payload = Buffer.from(token.split('.')[1], 'base64').toString();
    `);

    const result = await analyze({
      input: makeValidInput(),
      context7Client: makeMockContext7Client(),
      recommender: makeMockRecommender(),
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    for (const rec of result.output.recommendedChanges) {
      expect(['verified', 'unverified', 'unavailable']).toContain(rec.verificationStatus);
    }
  });

  it('recommender returning null skips that detection', async () => {
    writeFile('src/utils.ts', `
      function formatCount(count: number) {
        return count === 1 ? 'item' : 'items';
      }
    `);

    // Recommender that rejects all detections
    const result = await analyze({
      input: makeValidInput(),
      context7Client: makeMockContext7Client(),
      recommender: () => null,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    // No recommendations because recommender returned null for all
    expect(result.output.recommendedChanges).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Error case — invalid input
// ---------------------------------------------------------------------------

describe('analyze — invalid input', () => {
  it('returns success: false with error for completely invalid input', async () => {
    const result = await analyze({
      input: { invalid: true },
      context7Client: makeMockContext7Client(),
      recommender: makeMockRecommender(),
    });

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error).toBeTruthy();
    expect(typeof result.error).toBe('string');
    expect(result.issues).toBeDefined();
  });

  it('returns success: false when projectMetadata is missing', async () => {
    const result = await analyze({
      input: {
        optimizationGoals: ['performance'],
        constraints: { licenseAllowlist: [], excludedLibraries: [] },
      },
      context7Client: makeMockContext7Client(),
      recommender: makeMockRecommender(),
    });

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error).toContain('validation');
  });

  it('returns success: false when optimizationGoals is empty', async () => {
    const result = await analyze({
      input: {
        projectMetadata: {
          repoPath: tmpDir,
          languages: ['typescript'],
          packageManagers: ['npm'],
          currentLibraries: {},
        },
        optimizationGoals: [],
        constraints: { licenseAllowlist: [], excludedLibraries: [] },
      },
      context7Client: makeMockContext7Client(),
      recommender: makeMockRecommender(),
    });

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error).toBeTruthy();
  });

  it('returns Zod issues array for validation errors', async () => {
    const result = await analyze({
      input: null,
      context7Client: makeMockContext7Client(),
      recommender: makeMockRecommender(),
    });

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Empty codebase
// ---------------------------------------------------------------------------

describe('analyze — empty codebase', () => {
  it('returns valid output with empty recommendations for empty directory', async () => {
    const result = await analyze({
      input: makeValidInput(),
      context7Client: makeMockContext7Client(),
      recommender: makeMockRecommender(),
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.output.recommendedChanges).toEqual([]);
    expect(result.output.filesToDelete).toEqual([]);
    expect(result.output.linesSavedEstimate).toBe(0);
    expect(result.output.migrationPlan.phases).toEqual([]);
    expect(result.output.migrationPlan.deletionChecklist).toEqual([]);

    // Still valid against OutputSchema
    const parsed = OutputSchema.safeParse(result.output);
    expect(parsed.success).toBe(true);
  });

  it('still includes UX audit for empty codebase', async () => {
    const result = await analyze({
      input: makeValidInput(),
      context7Client: makeMockContext7Client(),
      recommender: makeMockRecommender(),
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.output.uxAudit.length).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// License filtering
// ---------------------------------------------------------------------------

describe('analyze — license filtering', () => {
  it('excludes recommendations with non-allowed licenses', async () => {
    writeFile('src/utils.ts', `
      function formatCount(count: number) {
        return count === 1 ? 'item' : 'items';
      }
    `);

    const result = await analyze({
      input: makeValidInput({
        constraints: {
          licenseAllowlist: ['Apache-2.0'], // MIT recommendations should be excluded
          excludedLibraries: [],
        },
      }),
      context7Client: makeMockContext7Client(),
      // Recommender returns MIT-licensed library → should be filtered out
      recommender: makeMockRecommender({ license: 'MIT' }),
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    // All remaining recommendations should have allowed licenses
    for (const rec of result.output.recommendedChanges) {
      expect(rec.recommendedLibrary.license).toBe('Apache-2.0');
    }

    // Should have exclusion records
    expect(result.exclusions.length).toBeGreaterThan(0);
  });

  it('returns empty exclusions when no license allowlist is set', async () => {
    writeFile('src/utils.ts', `
      function formatCount(count: number) {
        return count === 1 ? 'item' : 'items';
      }
    `);

    const result = await analyze({
      input: makeValidInput(),
      context7Client: makeMockContext7Client(),
      recommender: makeMockRecommender(),
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.exclusions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Context7 client integration
// ---------------------------------------------------------------------------

describe('analyze — Context7 client behavior', () => {
  it('handles Context7 returning unverified for unknown libraries', async () => {
    writeFile('src/utils.ts', `
      function formatCount(count: number) {
        return count === 1 ? 'item' : 'items';
      }
    `);

    const client: Context7Client = {
      resolveLibraryId: async (_name: string) => null,
      getLibraryDocs: async () => null,
    };

    const result = await analyze({
      input: makeValidInput(),
      context7Client: client,
      recommender: makeMockRecommender(),
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    for (const rec of result.output.recommendedChanges) {
      expect(rec.verificationStatus).toBe('unverified');
    }
  });

  it('handles Context7 service errors gracefully', async () => {
    writeFile('src/utils.ts', `
      function formatCount(count: number) {
        return count === 1 ? 'item' : 'items';
      }
    `);

    const client: Context7Client = {
      resolveLibraryId: async () => {
        throw new Error('Service unavailable');
      },
      getLibraryDocs: async () => {
        throw new Error('Service unavailable');
      },
    };

    const result = await analyze({
      input: makeValidInput(),
      context7Client: client,
      recommender: makeMockRecommender(),
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    // Pipeline should still complete — verification status should be unavailable
    for (const rec of result.output.recommendedChanges) {
      expect(rec.verificationStatus).toBe('unavailable');
    }

    // Output should still be valid
    const parsed = OutputSchema.safeParse(result.output);
    expect(parsed.success).toBe(true);
  });

  it('handles Context7 returning null (library not found)', async () => {
    writeFile('src/app.ts', `
      console.log('server started');
    `);

    const failingClient: Context7Client = {
      resolveLibraryId: async () => null,
      getLibraryDocs: async () => null,
    };

    const result = await analyze({
      input: makeValidInput(),
      context7Client: failingClient,
      recommender: makeMockRecommender(),
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    // Recommendations should still be generated but unverified
    for (const rec of result.output.recommendedChanges) {
      expect(rec.verificationStatus).toBe('unverified');
    }
  });
});

// ---------------------------------------------------------------------------
// Migration plan in output
// ---------------------------------------------------------------------------

describe('analyze — migration plan', () => {
  it('includes migration plan with phases for detected patterns', async () => {
    writeFile('src/utils.ts', `
      function formatCount(count: number) {
        return count === 1 ? 'item' : 'items';
      }
    `);
    writeFile('src/logger.ts', `
      function log(msg: string) {
        console.log('[APP]', msg);
      }
    `);

    const result = await analyze({
      input: makeValidInput(),
      context7Client: makeMockContext7Client(),
      recommender: makeMockRecommender(),
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    if (result.output.recommendedChanges.length > 0) {
      expect(result.output.migrationPlan.phases.length).toBeGreaterThan(0);
      expect(result.output.migrationPlan.deletionChecklist.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Serialization round-trip
// ---------------------------------------------------------------------------

describe('analyze — serialization', () => {
  it('json output can be parsed back to match OutputSchema', async () => {
    writeFile('src/utils.ts', `
      function formatCount(count: number) {
        return count === 1 ? 'item' : 'items';
      }
    `);

    const result = await analyze({
      input: makeValidInput(),
      context7Client: makeMockContext7Client(),
      recommender: makeMockRecommender(),
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    // Parse the JSON string back and validate
    const reparsed = JSON.parse(result.json);
    const validated = OutputSchema.safeParse(reparsed);
    expect(validated.success).toBe(true);
  });

  it('prettyJson output can be parsed back to match OutputSchema', async () => {
    writeFile('src/index.ts', 'export const x = 1;');

    const result = await analyze({
      input: makeValidInput(),
      context7Client: makeMockContext7Client(),
      recommender: makeMockRecommender(),
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const reparsed = JSON.parse(result.prettyJson);
    const validated = OutputSchema.safeParse(reparsed);
    expect(validated.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Peer dependency warnings
// ---------------------------------------------------------------------------

describe('analyze — peer dependency warnings', () => {
  it('includes warnings in output when peerDependencyResolver returns peer deps', async () => {
    writeFile('package.json', JSON.stringify({
      name: 'test-app',
      dependencies: { react: '^18.0.0' },
    }));
    writeFile('src/utils.ts', `
      function formatCount(count: number) {
        return count === 1 ? 'item' : 'items';
      }
    `);

    // Mock resolver that returns peer deps for any library
    const mockResolver: PeerDependencyResolver = {
      resolve: async () => ({
        react: '^18.0.0',
        'react-dom': '^18.0.0',
      }),
    };

    const result = await analyze({
      input: makeValidInput({
        projectMetadata: {
          repoPath: tmpDir,
          languages: ['typescript'],
          packageManagers: ['npm'],
          currentLibraries: {
            react: '18.2.0',       // satisfies ^18.0.0 → compatible
            // react-dom missing   → missing
          },
        },
      }),
      context7Client: makeMockContext7Client(),
      recommender: makeMockRecommender(),
      peerDependencyResolver: mockResolver,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    // Should have recommendations (the files trigger detections)
    expect(result.output.recommendedChanges.length).toBeGreaterThan(0);

    // Should have peer dependency warnings in the migration plan
    const warnings = result.output.migrationPlan.peerDependencyWarnings;
    expect(warnings.length).toBeGreaterThan(0);

    // Verify warning structure
    for (const warning of warnings) {
      expect(typeof warning.recommendedLibrary).toBe('string');
      expect(typeof warning.peerDependency).toBe('string');
      expect(typeof warning.requiredRange).toBe('string');
      expect(['string', 'object'].includes(typeof warning.installedVersion)).toBe(true); // string or null
      expect(['conflict', 'missing', 'compatible']).toContain(warning.severity);
    }

    // Verify specific expected warnings: react should be compatible, react-dom should be missing
    const reactWarning = warnings.find((w) => w.peerDependency === 'react');
    const reactDomWarning = warnings.find((w) => w.peerDependency === 'react-dom');

    if (reactWarning) {
      expect(reactWarning.severity).toBe('compatible');
      expect(reactWarning.installedVersion).toBe('18.2.0');
      expect(reactWarning.requiredRange).toBe('^18.0.0');
    }

    if (reactDomWarning) {
      expect(reactDomWarning.severity).toBe('missing');
      expect(reactDomWarning.installedVersion).toBeNull();
      expect(reactDomWarning.requiredRange).toBe('^18.0.0');
    }

    // Output should still be valid against OutputSchema
    const parsed = OutputSchema.safeParse(result.output);
    expect(parsed.success).toBe(true);
  });

  it('returns empty peerDependencyWarnings when no resolver is provided', async () => {
    writeFile('src/utils.ts', `
      function formatCount(count: number) {
        return count === 1 ? 'item' : 'items';
      }
    `);

    const result = await analyze({
      input: makeValidInput(),
      context7Client: makeMockContext7Client(),
      recommender: makeMockRecommender(),
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    // peerDependencyWarnings should be an empty array
    expect(result.output.migrationPlan.peerDependencyWarnings).toEqual([]);

    // Output should still be valid against OutputSchema
    const parsed = OutputSchema.safeParse(result.output);
    expect(parsed.success).toBe(true);
  });

  it('detects new domain patterns (state-management, error-handling, etc.)', async () => {
    // Error boundary
    writeFile('src/ErrorBoundary.tsx', `
      class AppErrorBoundary extends React.Component {
        componentDidCatch(error, info) {
          logErrorToService(error, info);
        }
        getDerivedStateFromError(error) {
          return { hasError: true };
        }
        render() {
          return this.state.hasError ? <Fallback /> : this.props.children;
        }
      }
    `);

    // Raw SQL
    writeFile('src/db.ts', [
      "async function getUsers(role: string) {",
      "  const q = `SELECT * FROM users WHERE role = ${role}`;",
      "  return db.query(q);",
      "}",
    ].join('\n'));

    const result = await analyze({
      input: makeValidInput(),
      context7Client: makeMockContext7Client(),
      recommender: makeDomainRecommender(),
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const domains = new Set(result.output.recommendedChanges.map(r => r.domain));
    expect(domains.has('error-handling-resilience')).toBe(true);
    expect(domains.has('database-orm-migrations')).toBe(true);
  });
});
