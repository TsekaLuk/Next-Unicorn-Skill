import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { OutputSchema } from '../src/schemas/output.schema.js';
import { InputSchema } from '../src/schemas/input.schema.js';
// serializer and skill-parser removed (Occam's Razor) — inline equivalents
function prettyPrint(output: unknown): string { return JSON.stringify(output, null, 2); }

// ---------------------------------------------------------------------------
// Arbitraries — reusable generators for schema types
// ---------------------------------------------------------------------------

/** Integer between 1 and 10 (inclusive) for impact dimension scores */
const dimensionScore = fc.integer({ min: 1, max: 10 });

/** Floating-point composite score between 1 and 10 */
const compositeScore = fc.double({ min: 1, max: 10, noNaN: true, noDefaultInfinity: true });

const verificationStatusArb = fc.constantFrom('verified' as const, 'unverified' as const, 'unavailable' as const);

const migrationRiskArb = fc.constantFrom('low' as const, 'medium' as const, 'high' as const);

const uxCategoryArb = fc.constantFrom(
  'accessibility' as const,
  'error-states' as const,
  'empty-states' as const,
  'loading-states' as const,
  'form-validation' as const,
  'performance-feel' as const,
  'copy-consistency' as const,
  'design-system-alignment' as const,
);

const uxStatusArb = fc.constantFrom('present' as const, 'partial' as const, 'missing' as const);

/** Non-empty alphanumeric string (avoids problematic unicode in JSON round-trip) */
const safeString = fc.stringMatching(/^[a-z0-9_/.-]{1,30}$/);

const impactScoresArb = fc.record({
  scalability: dimensionScore,
  performance: dimensionScore,
  security: dimensionScore,
  maintainability: dimensionScore,
  feature_richness: dimensionScore,
  ux: dimensionScore,
  ui_aesthetics: dimensionScore,
  composite: compositeScore,
});

const adapterStrategyArb = fc.record({
  wrapperInterface: safeString,
  legacyCode: safeString,
  targetLibrary: safeString,
  description: safeString,
});

const recommendedChangeArb = fc.record({
  currentImplementation: fc.record({
    filePath: safeString,
    lineRange: fc.record({
      start: fc.integer({ min: 0, max: 500 }),
      end: fc.integer({ min: 0, max: 1000 }),
    }),
    patternCategory: safeString,
    confidenceScore: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
  }),
  recommendedLibrary: fc.record({
    name: safeString,
    version: safeString,
    license: safeString,
    documentationUrl: fc.option(safeString, { nil: undefined }),
    rationale: fc.option(safeString, { nil: undefined }),
    ecosystem: fc.option(
      fc.array(fc.record({ library: safeString, version: safeString, role: safeString }), { minLength: 0, maxLength: 3 }),
      { nil: undefined },
    ),
    antiPatterns: fc.option(fc.array(safeString, { minLength: 0, maxLength: 3 }), { nil: undefined }),
    alternatives: fc.option(
      fc.array(fc.record({ library: safeString, when: safeString }), { minLength: 0, maxLength: 3 }),
      { nil: undefined },
    ),
  }),
  domain: safeString,
  impactScores: impactScoresArb,
  migrationRisk: migrationRiskArb,
  estimatedEffort: fc.double({ min: 0.01, max: 10000, noNaN: true, noDefaultInfinity: true }),
  adapterStrategy: fc.option(adapterStrategyArb, { nil: undefined }),
  verificationStatus: verificationStatusArb,
  verificationNote: fc.option(safeString, { nil: undefined }),
});

const uxAuditItemArb = fc.record({
  category: uxCategoryArb,
  status: uxStatusArb,
  filePaths: fc.array(safeString, { minLength: 0, maxLength: 5 }),
  recommendedLibrary: fc.option(safeString, { nil: undefined }),
  rationale: safeString,
});

const migrationStepArb = fc.record({
  recommendationIndex: fc.integer({ min: 0, max: 100 }),
  description: safeString,
  adapterStrategy: fc.option(adapterStrategyArb, { nil: undefined }),
});

const migrationPhaseArb = fc.record({
  phase: fc.integer({ min: 1, max: 20 }),
  name: safeString,
  steps: fc.array(migrationStepArb, { minLength: 0, maxLength: 5 }),
});

const deletionChecklistItemArb = fc.record({
  filePath: safeString,
  lineRange: fc.option(
    fc.record({
      start: fc.integer({ min: 0, max: 500 }),
      end: fc.integer({ min: 0, max: 1000 }),
    }),
    { nil: undefined },
  ),
  reason: safeString,
});
const warningSeverityArb = fc.constantFrom('conflict' as const, 'missing' as const, 'compatible' as const);

const peerDependencyWarningArb = fc.record({
  recommendedLibrary: safeString,
  peerDependency: safeString,
  requiredRange: safeString,
  installedVersion: fc.option(safeString, { nil: null }),
  severity: warningSeverityArb,
});

const outputSchemaArb = fc.record({
  recommendedChanges: fc.array(recommendedChangeArb, { minLength: 0, maxLength: 3 }),
  filesToDelete: fc.array(safeString, { minLength: 0, maxLength: 5 }),
  linesSavedEstimate: fc.integer({ min: 0, max: 100000 }),
  uxAudit: fc.array(uxAuditItemArb, { minLength: 0, maxLength: 4 }),
  migrationPlan: fc.record({
    phases: fc.array(migrationPhaseArb, { minLength: 0, maxLength: 3 }),
    deletionChecklist: fc.array(deletionChecklistItemArb, { minLength: 0, maxLength: 5 }),
    peerDependencyWarnings: fc.array(peerDependencyWarningArb, { minLength: 0, maxLength: 5 }),
  }),
});

// ---------------------------------------------------------------------------
// Property 1: Output_Schema JSON round-trip
// ---------------------------------------------------------------------------

describe('Feature: next-unicorn, Property 1: Output_Schema JSON round-trip', () => {
  it('serializing to JSON and deserializing produces a deeply equal object', () => {
    fc.assert(
      fc.property(outputSchemaArb, (original) => {
        // Validate the generated object against the Zod schema
        const parsed = OutputSchema.parse(original);

        // Serialize to JSON
        const json = JSON.stringify(parsed);

        // Deserialize and re-validate
        const deserialized = OutputSchema.parse(JSON.parse(json));

        // Assert deep equality
        expect(deserialized).toEqual(parsed);
      }),
      { numRuns: 100 },
    );
  });

  /** Validates: Requirements 7.3 */
});

// ---------------------------------------------------------------------------
// Property 4: Output schema round-trip with peerDependencyWarnings
// ---------------------------------------------------------------------------

describe('Feature: peer-dependency-warnings, Property 4: Output schema round-trip with peerDependencyWarnings', () => {
  it('serializing to JSON and deserializing produces a deeply equal object including peerDependencyWarnings', () => {
    // Use an arbitrary that always generates at least one peerDependencyWarning
    const outputWithWarningsArb = fc.record({
      recommendedChanges: fc.array(recommendedChangeArb, { minLength: 0, maxLength: 3 }),
      filesToDelete: fc.array(safeString, { minLength: 0, maxLength: 5 }),
      linesSavedEstimate: fc.integer({ min: 0, max: 100000 }),
      uxAudit: fc.array(uxAuditItemArb, { minLength: 0, maxLength: 4 }),
      migrationPlan: fc.record({
        phases: fc.array(migrationPhaseArb, { minLength: 0, maxLength: 3 }),
        deletionChecklist: fc.array(deletionChecklistItemArb, { minLength: 0, maxLength: 5 }),
        peerDependencyWarnings: fc.array(peerDependencyWarningArb, { minLength: 1, maxLength: 5 }),
      }),
    });

    fc.assert(
      fc.property(outputWithWarningsArb, (original) => {
        // Validate the generated object against the Zod schema
        const parsed = OutputSchema.parse(original);

        // Serialize to JSON
        const json = JSON.stringify(parsed);

        // Deserialize and re-validate
        const deserialized = OutputSchema.parse(JSON.parse(json));

        // Assert deep equality — including peerDependencyWarnings
        expect(deserialized).toEqual(parsed);

        // Verify peerDependencyWarnings survived the round-trip
        expect(deserialized.migrationPlan.peerDependencyWarnings.length).toBeGreaterThan(0);
        for (const warning of deserialized.migrationPlan.peerDependencyWarnings) {
          expect(['conflict', 'missing', 'compatible']).toContain(warning.severity);
          expect(typeof warning.recommendedLibrary).toBe('string');
          expect(typeof warning.peerDependency).toBe('string');
          expect(typeof warning.requiredRange).toBe('string');
          expect(warning.installedVersion === null || typeof warning.installedVersion === 'string').toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  /** Validates: Requirements 4.3 */
});

// ---------------------------------------------------------------------------
// Property 3: Schema validation rejects invalid input with descriptive errors
// ---------------------------------------------------------------------------

describe('Feature: next-unicorn, Property 3: Schema validation rejects invalid input with descriptive errors', () => {
  /**
   * Strategy: generate objects that are missing one or more required top-level
   * fields of InputSchema, or have fields with wrong types. Then assert that
   * Zod's safeParse returns an error whose issues reference the invalid field.
   */

  const requiredTopLevelFields = [
    'projectMetadata',
    'optimizationGoals',
    'constraints',
  ] as const;

  it('rejects objects missing required top-level fields and references the missing field', () => {
    // Build a valid base input to selectively remove fields from
    const validBaseArb = fc.record({
      projectMetadata: fc.record({
        repoPath: safeString,
        languages: fc.array(safeString, { minLength: 1, maxLength: 3 }),
        packageManagers: fc.array(safeString, { minLength: 1, maxLength: 3 }),
        currentLibraries: fc.dictionary(safeString, safeString, { minKeys: 0, maxKeys: 3 }),
      }),
      optimizationGoals: fc.array(safeString, { minLength: 1, maxLength: 3 }),
      constraints: fc.record({
        licenseAllowlist: fc.array(safeString, { minLength: 0, maxLength: 3 }),
        excludedLibraries: fc.array(safeString, { minLength: 0, maxLength: 3 }),
      }),
    });

    fc.assert(
      fc.property(
        validBaseArb,
        fc.constantFrom(...requiredTopLevelFields),
        (base, fieldToRemove) => {
          // Remove the chosen required field
          const invalid = { ...base } as Record<string, unknown>;
          delete invalid[fieldToRemove];

          const result = InputSchema.safeParse(invalid);

          // Must fail
          expect(result.success).toBe(false);

          if (!result.success) {
            // The error issues must reference the removed field name
            const fieldNames = result.error.issues.map((issue) => issue.path.join('.'));
            const mentionsField = fieldNames.some((name) => name.includes(fieldToRemove));
            expect(mentionsField).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects objects with wrong types for required fields and references the invalid field', () => {
    // Provide wrong types for each required field
    const wrongTypeArb = fc.record({
      field: fc.constantFrom(...requiredTopLevelFields),
      wrongValue: fc.constantFrom(42, true, null, 'not-an-object', [1, 2, 3]),
    });

    const validBaseArb = fc.record({
      projectMetadata: fc.record({
        repoPath: safeString,
        languages: fc.array(safeString, { minLength: 1, maxLength: 3 }),
        packageManagers: fc.array(safeString, { minLength: 1, maxLength: 3 }),
        currentLibraries: fc.dictionary(safeString, safeString, { minKeys: 0, maxKeys: 3 }),
      }),
      optimizationGoals: fc.array(safeString, { minLength: 1, maxLength: 3 }),
      constraints: fc.record({
        licenseAllowlist: fc.array(safeString, { minLength: 0, maxLength: 3 }),
        excludedLibraries: fc.array(safeString, { minLength: 0, maxLength: 3 }),
      }),
    });

    fc.assert(
      fc.property(validBaseArb, wrongTypeArb, (base, { field, wrongValue }) => {
        const invalid = { ...base, [field]: wrongValue } as Record<string, unknown>;

        const result = InputSchema.safeParse(invalid);

        // Must fail
        expect(result.success).toBe(false);

        if (!result.success) {
          // The error issues must reference the field with the wrong type
          const fieldNames = result.error.issues.map((issue) => issue.path.join('.'));
          const mentionsField = fieldNames.some((name) =>
            name === field || name.startsWith(field),
          );
          expect(mentionsField).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('rejects objects with invalid nested projectMetadata fields', () => {
    const nestedFieldArb = fc.constantFrom(
      'repoPath',
      'languages',
      'packageManagers',
      'currentLibraries',
    );

    fc.assert(
      fc.property(nestedFieldArb, (nestedField) => {
        // Build a valid projectMetadata then corrupt one nested field
        const validMetadata: Record<string, unknown> = {
          repoPath: '/some/path',
          languages: ['typescript'],
          packageManagers: ['pnpm'],
          currentLibraries: { react: '18.0.0' },
        };

        // Set the nested field to an invalid type
        validMetadata[nestedField] = nestedField === 'repoPath' ? '' : 'not-an-array';

        const invalid = {
          projectMetadata: validMetadata,
          optimizationGoals: ['performance'],
          constraints: {
            licenseAllowlist: [],
            excludedLibraries: [],
          },
        };

        const result = InputSchema.safeParse(invalid);

        expect(result.success).toBe(false);

        if (!result.success) {
          const paths = result.error.issues.map((issue) => issue.path.join('.'));
          const mentionsField = paths.some(
            (p) => p.includes('projectMetadata') || p.includes(nestedField),
          );
          expect(mentionsField).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('rejects OutputSchema objects with wrong types and references the invalid field', () => {
    const outputFieldArb = fc.constantFrom(
      'recommendedChanges',
      'filesToDelete',
      'linesSavedEstimate',
      'uxAudit',
      'migrationPlan',
    );

    fc.assert(
      fc.property(outputFieldArb, (field) => {
        // Build a minimal valid output then corrupt one field
        const validOutput: Record<string, unknown> = {
          recommendedChanges: [],
          filesToDelete: [],
          linesSavedEstimate: 0,
          uxAudit: [],
          migrationPlan: { phases: [], deletionChecklist: [], peerDependencyWarnings: [] },
        };

        // Set the field to a wrong type
        validOutput[field] = 'invalid-string-value';

        const result = OutputSchema.safeParse(validOutput);

        expect(result.success).toBe(false);

        if (!result.success) {
          const paths = result.error.issues.map((issue) => issue.path.join('.'));
          const mentionsField = paths.some(
            (p) => p === field || p.startsWith(field),
          );
          expect(mentionsField).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  /** Validates: Requirements 1.4, 7.1, 7.2 */
});


// skill-parser tests removed (module deleted — dead code)

// ---------------------------------------------------------------------------
// Property 14: Pretty-printed JSON uses consistent indentation
// ---------------------------------------------------------------------------

describe('Feature: next-unicorn, Property 14: Pretty-printed JSON uses consistent indentation', () => {
  it('pretty-printed output uses 2-space indentation at each nesting level', () => {
    fc.assert(
      fc.property(outputSchemaArb, (original) => {
        // Validate through Zod first
        const validated = OutputSchema.parse(original);

        // Pretty-print
        const printed = prettyPrint(validated);

        // Must contain newlines (not a single-line JSON)
        expect(printed).toContain('\n');

        // Verify indentation: each line's leading whitespace must be a multiple of 2 spaces
        const lines = printed.split('\n');
        for (const line of lines) {
          if (line.trim() === '') continue; // skip empty lines

          // Count leading spaces
          const leadingSpaces = line.match(/^( *)/)?.[1]?.length ?? 0;

          // Must be a multiple of 2
          expect(leadingSpaces % 2).toBe(0);
        }

        // Verify nesting: indented lines should be exactly 2 spaces deeper than their parent
        // We check that the indentation difference between consecutive non-empty lines
        // is at most 2 when increasing (opening a new nesting level)
        const nonEmptyLines = lines.filter((l) => l.trim() !== '');
        for (let i = 1; i < nonEmptyLines.length; i++) {
          const prevIndent = (nonEmptyLines[i - 1]?.match(/^( *)/)?.[1]?.length) ?? 0;
          const currIndent = (nonEmptyLines[i]?.match(/^( *)/)?.[1]?.length) ?? 0;

          // When indentation increases, it should increase by exactly 2
          if (currIndent > prevIndent) {
            expect(currIndent - prevIndent).toBe(2);
          }
        }

        // Verify it's valid JSON that round-trips
        const reparsed = JSON.parse(printed);
        expect(reparsed).toEqual(validated);
      }),
      { numRuns: 100 },
    );
  });

  /** Validates: Requirements 7.4 */
});
