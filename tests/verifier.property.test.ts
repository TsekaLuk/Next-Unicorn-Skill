import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  verifyRecommendation,
  type Context7Client,
  type VerificationResult,
} from '../src/verifier/context7.js';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Non-empty alphanumeric library name */
const libraryNameArb = fc.stringMatching(/^[a-z][a-z0-9@/_-]{0,30}$/);

/** Non-empty use case string */
const useCaseArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,30}$/);

/** A library ID returned by Context7 */
const libraryIdArb = fc.stringMatching(/^[a-z0-9/_-]{1,40}$/);

/** Documentation URL */
const docUrlArb = fc.stringMatching(/^https:\/\/[a-z0-9.-]{1,30}\/[a-z0-9/_-]{1,30}$/);

/** Semver-like version string */
const versionArb = fc.stringMatching(/^[0-9]+\.[0-9]+\.[0-9]+$/);

// ---------------------------------------------------------------------------
// Property 5: Verification status matches Context7 response
// ---------------------------------------------------------------------------

describe('Feature: next-unicorn, Property 5: Verification status matches Context7 response', () => {
  /**
   * **Validates: Requirements 2.3, 2.4**
   *
   * When Context7 resolves a library ID and returns documentation,
   * the verification status SHALL be "verified".
   * When Context7 cannot resolve a library ID (returns null),
   * the verification status SHALL be "unverified".
   */

  it('returns "verified" when Context7 resolves library and returns docs', async () => {
    await fc.assert(
      fc.asyncProperty(
        libraryNameArb,
        useCaseArb,
        libraryIdArb,
        docUrlArb,
        versionArb,
        async (libraryName, useCase, libraryId, docUrl, version) => {
          const client: Context7Client = {
            resolveLibraryId: async (_name: string) => libraryId,
            getLibraryDocs: async (_id: string, _uc: string) => ({
              url: docUrl,
              version,
            }),
          };

          const result: VerificationResult = await verifyRecommendation(
            client,
            libraryName,
            useCase,
          );

          expect(result.status).toBe('verified');
          expect(result.libraryId).toBe(libraryId);
          expect(result.documentationUrl).toBe(docUrl);
          expect(result.version).toBe(version);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns "unverified" when Context7 cannot resolve library ID (returns null)', async () => {
    await fc.assert(
      fc.asyncProperty(
        libraryNameArb,
        useCaseArb,
        async (libraryName, useCase) => {
          const client: Context7Client = {
            resolveLibraryId: async (_name: string) => null,
            getLibraryDocs: async (_id: string, _uc: string) => {
              throw new Error('Should not be called when library ID is null');
            },
          };

          const result: VerificationResult = await verifyRecommendation(
            client,
            libraryName,
            useCase,
          );

          expect(result.status).toBe('unverified');
          expect(result.note).toBeDefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns "unverified" when library is found but docs return null (use case not confirmed)', async () => {
    await fc.assert(
      fc.asyncProperty(
        libraryNameArb,
        useCaseArb,
        libraryIdArb,
        async (libraryName, useCase, libraryId) => {
          const client: Context7Client = {
            resolveLibraryId: async (_name: string) => libraryId,
            getLibraryDocs: async (_id: string, _uc: string) => null,
          };

          const result: VerificationResult = await verifyRecommendation(
            client,
            libraryName,
            useCase,
          );

          expect(result.status).toBe('unverified');
          expect(result.libraryId).toBe(libraryId);
        },
      ),
      { numRuns: 100 },
    );
  });

  /** Validates: Requirements 2.3, 2.4 */
});
