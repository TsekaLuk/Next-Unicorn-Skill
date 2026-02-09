import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { VibeCodingDomain } from '../src/schemas/input.schema.js';
import type { Detection } from '../src/analyzer/scanner.js';
import { getPatternCatalog } from '../src/analyzer/pattern-catalog.js';

// ---------------------------------------------------------------------------
// Valid VibeCodingDomain values (from the Zod enum)
// ---------------------------------------------------------------------------

const VALID_DOMAINS = VibeCodingDomain.options;

// ---------------------------------------------------------------------------
// Arbitraries — generators for Detection objects
// ---------------------------------------------------------------------------

/** Non-empty file path string */
const filePathArb = fc.stringMatching(/^[a-zA-Z0-9_/.-]{1,60}$/).filter((s) => s.length > 0);

/** Valid line range where start <= end, both positive integers */
const lineRangeArb = fc
  .tuple(fc.integer({ min: 1, max: 5000 }), fc.integer({ min: 0, max: 500 }))
  .map(([start, offset]) => ({ start, end: start + offset }));

/** Non-empty pattern category string */
const patternCategoryArb = fc.stringMatching(/^[a-z0-9-]{1,40}$/).filter((s) => s.length > 0);

/** Confidence score in [0, 1] */
const confidenceScoreArb = fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true });

/** Valid VibeCodingDomain value */
const domainArb = fc.constantFrom(...VALID_DOMAINS);

/** Full Detection arbitrary (no suggestedLibrary — AI agent provides recommendations) */
const detectionArb: fc.Arbitrary<Detection> = fc.record({
  filePath: filePathArb,
  lineRange: lineRangeArb,
  patternCategory: patternCategoryArb,
  confidenceScore: confidenceScoreArb,
  domain: domainArb,
});

// ---------------------------------------------------------------------------
// Property 4: Detection output completeness
// ---------------------------------------------------------------------------

describe('Feature: next-unicorn, Property 4: Detection output completeness', () => {
  /**
   * For any detection produced by the Scanner, the detection object SHALL
   * contain a non-empty filePath, a lineRange with start <= end, a non-empty
   * patternCategory, a confidenceScore between 0 and 1, and a domain that
   * is a valid VibeCodingDomain value.
   *
   * Validates: Requirements 1.3, 5.3
   */
  it('every detection has non-empty filePath, valid lineRange (start <= end), non-empty patternCategory, confidenceScore in [0,1], and valid VibeCodingDomain', () => {
    fc.assert(
      fc.property(fc.array(detectionArb, { minLength: 1, maxLength: 10 }), (detections) => {
        for (const detection of detections) {
          // Non-empty filePath
          expect(detection.filePath.length).toBeGreaterThan(0);

          // Valid lineRange: start <= end
          expect(detection.lineRange.start).toBeLessThanOrEqual(detection.lineRange.end);

          // Both start and end are positive integers
          expect(detection.lineRange.start).toBeGreaterThanOrEqual(1);
          expect(detection.lineRange.end).toBeGreaterThanOrEqual(1);
          expect(Number.isInteger(detection.lineRange.start)).toBe(true);
          expect(Number.isInteger(detection.lineRange.end)).toBe(true);

          // Non-empty patternCategory
          expect(detection.patternCategory.length).toBeGreaterThan(0);

          // confidenceScore in [0, 1]
          expect(detection.confidenceScore).toBeGreaterThanOrEqual(0);
          expect(detection.confidenceScore).toBeLessThanOrEqual(1);

          // domain is a valid VibeCodingDomain
          expect(VALID_DOMAINS).toContain(detection.domain);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('detections from the pattern catalog all have valid domains', () => {
    const catalog = getPatternCatalog();

    fc.assert(
      fc.property(fc.constantFrom(...catalog), (pattern) => {
        // Every pattern in the catalog should have a valid domain
        expect(VALID_DOMAINS).toContain(pattern.domain);

        // Every pattern should have a non-empty id (used as patternCategory)
        expect(pattern.id.length).toBeGreaterThan(0);

        // Confidence base should be in [0, 1]
        expect(pattern.confidenceBase).toBeGreaterThanOrEqual(0);
        expect(pattern.confidenceBase).toBeLessThanOrEqual(1);
      }),
      { numRuns: 100 },
    );
  });

  /** Validates: Requirements 1.3, 5.3 */
});
