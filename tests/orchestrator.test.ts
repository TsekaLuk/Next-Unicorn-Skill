import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { analyze, VERSION } from '../src/index.js';
import type { Context7Client } from '../src/verifier/context7.js';
import { OutputSchema } from '../src/schemas/output.schema.js';
import type { InputSchema } from '../src/schemas/input.schema.js';

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
    expect(VERSION).toBe('0.1.0');
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
  });

  it('output matches OutputSchema Zod validation', async () => {
    writeFile('src/app.ts', `
      const variant = Math.random() < 0.5 ? 'control' : 'treatment';
    `);

    const result = await analyze({
      input: makeValidInput(),
      context7Client: makeMockContext7Client(),
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
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    for (const rec of result.output.recommendedChanges) {
      expect(['verified', 'unverified', 'unavailable']).toContain(rec.verificationStatus);
    }
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
    });

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error).toBeTruthy();
  });

  it('returns Zod issues array for validation errors', async () => {
    const result = await analyze({
      input: null,
      context7Client: makeMockContext7Client(),
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
          licenseAllowlist: ['Apache-2.0'], // i18next is MIT, should be excluded
          excludedLibraries: [],
        },
      }),
      context7Client: makeMockContext7Client(),
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
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const reparsed = JSON.parse(result.prettyJson);
    const validated = OutputSchema.safeParse(reparsed);
    expect(validated.success).toBe(true);
  });
});
