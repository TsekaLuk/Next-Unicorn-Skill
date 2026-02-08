import { describe, it, expect, vi } from 'vitest';
import {
  verifyRecommendation,
  verifyAllRecommendations,
  type Context7Client,
} from '../src/verifier/context7.js';
import type { Detection } from '../src/analyzer/scanner.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDetection(overrides?: Partial<Detection>): Detection {
  return {
    filePath: 'src/utils.ts',
    lineRange: { start: 1, end: 10 },
    patternCategory: 'i18n-manual-pluralization',
    confidenceScore: 0.8,
    suggestedLibrary: 'i18next',
    domain: 'i18n',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// verifyRecommendation — successful verification flow
// ---------------------------------------------------------------------------

describe('verifyRecommendation — successful verification', () => {
  it('returns "verified" with docs when Context7 resolves library and returns docs', async () => {
    const client: Context7Client = {
      resolveLibraryId: async (_name: string) => 'ctx7/i18next',
      getLibraryDocs: async (_id: string, _uc: string) => ({
        url: 'https://i18next.com/docs',
        version: '23.7.0',
      }),
    };

    const result = await verifyRecommendation(client, 'i18next', 'i18n-manual-pluralization');

    expect(result.status).toBe('verified');
    expect(result.libraryId).toBe('ctx7/i18next');
    expect(result.documentationUrl).toBe('https://i18next.com/docs');
    expect(result.version).toBe('23.7.0');
    expect(result.note).toBeUndefined();
  });

  it('returns "unverified" when resolveLibraryId returns null', async () => {
    const client: Context7Client = {
      resolveLibraryId: async (_name: string) => null,
      getLibraryDocs: async () => {
        throw new Error('Should not be called');
      },
    };

    const result = await verifyRecommendation(client, 'unknown-lib', 'some-use-case');

    expect(result.status).toBe('unverified');
    expect(result.note).toContain('unknown-lib');
    expect(result.note).toContain('not found');
  });

  it('returns "unverified" when getLibraryDocs returns null (use case not confirmed)', async () => {
    const client: Context7Client = {
      resolveLibraryId: async (_name: string) => 'ctx7/react',
      getLibraryDocs: async (_id: string, _uc: string) => null,
    };

    const result = await verifyRecommendation(client, 'react', 'state-machine');

    expect(result.status).toBe('unverified');
    expect(result.libraryId).toBe('ctx7/react');
    expect(result.note).toContain('react');
    expect(result.note).toContain('state-machine');
  });
});

// ---------------------------------------------------------------------------
// verifyRecommendation — retry logic
// ---------------------------------------------------------------------------

describe('verifyRecommendation — retry logic', () => {
  it('retries resolveLibraryId once on failure then succeeds', async () => {
    let callCount = 0;
    const client: Context7Client = {
      resolveLibraryId: async (_name: string) => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Network error');
        }
        return 'ctx7/date-fns';
      },
      getLibraryDocs: async (_id: string, _uc: string) => ({
        url: 'https://date-fns.org/docs',
        version: '3.0.0',
      }),
    };

    const result = await verifyRecommendation(client, 'date-fns', 'date-formatting');

    expect(callCount).toBe(2);
    expect(result.status).toBe('verified');
    expect(result.libraryId).toBe('ctx7/date-fns');
    expect(result.documentationUrl).toBe('https://date-fns.org/docs');
  });

  it('returns "unavailable" when resolveLibraryId fails twice (after retry)', async () => {
    let callCount = 0;
    const client: Context7Client = {
      resolveLibraryId: async (_name: string) => {
        callCount++;
        throw new Error('Service unavailable');
      },
      getLibraryDocs: async () => {
        throw new Error('Should not be called');
      },
    };

    const result = await verifyRecommendation(client, 'date-fns', 'date-formatting');

    expect(callCount).toBe(2); // initial + 1 retry
    expect(result.status).toBe('unavailable');
    expect(result.note).toContain('date-fns');
    expect(result.note).toContain('retry');
  });

  it('retries getLibraryDocs once on failure then succeeds', async () => {
    let docsCallCount = 0;
    const client: Context7Client = {
      resolveLibraryId: async (_name: string) => 'ctx7/zod',
      getLibraryDocs: async (_id: string, _uc: string) => {
        docsCallCount++;
        if (docsCallCount === 1) {
          throw new Error('Timeout');
        }
        return { url: 'https://zod.dev/docs', version: '3.23.0' };
      },
    };

    const result = await verifyRecommendation(client, 'zod', 'schema-validation');

    expect(docsCallCount).toBe(2);
    expect(result.status).toBe('verified');
    expect(result.version).toBe('3.23.0');
  });

  it('returns "unavailable" when getLibraryDocs fails twice (after retry)', async () => {
    let docsCallCount = 0;
    const client: Context7Client = {
      resolveLibraryId: async (_name: string) => 'ctx7/zod',
      getLibraryDocs: async (_id: string, _uc: string) => {
        docsCallCount++;
        throw new Error('Connection refused');
      },
    };

    const result = await verifyRecommendation(client, 'zod', 'schema-validation');

    expect(docsCallCount).toBe(2); // initial + 1 retry
    expect(result.status).toBe('unavailable');
    expect(result.libraryId).toBe('ctx7/zod');
    expect(result.note).toContain('zod');
    expect(result.note).toContain('retry');
  });
});

// ---------------------------------------------------------------------------
// verifyRecommendation — service unavailability
// ---------------------------------------------------------------------------

describe('verifyRecommendation — service unavailability', () => {
  it('handles connection refused errors gracefully', async () => {
    const client: Context7Client = {
      resolveLibraryId: async (_name: string) => {
        throw new Error('ECONNREFUSED');
      },
      getLibraryDocs: async () => {
        throw new Error('ECONNREFUSED');
      },
    };

    const result = await verifyRecommendation(client, 'express', 'http-server');

    expect(result.status).toBe('unavailable');
    expect(result.note).toBeDefined();
  });

  it('handles timeout errors gracefully', async () => {
    const client: Context7Client = {
      resolveLibraryId: async (_name: string) => {
        throw new Error('ETIMEDOUT');
      },
      getLibraryDocs: async () => {
        throw new Error('ETIMEDOUT');
      },
    };

    const result = await verifyRecommendation(client, 'express', 'http-server');

    expect(result.status).toBe('unavailable');
  });
});

// ---------------------------------------------------------------------------
// verifyAllRecommendations
// ---------------------------------------------------------------------------

describe('verifyAllRecommendations', () => {
  it('processes all detections and returns a result for each', async () => {
    const client: Context7Client = {
      resolveLibraryId: async (name: string) => `ctx7/${name}`,
      getLibraryDocs: async (_id: string, _uc: string) => ({
        url: 'https://example.com/docs',
        version: '1.0.0',
      }),
    };

    const detections: Detection[] = [
      makeDetection({ suggestedLibrary: 'i18next', domain: 'i18n' }),
      makeDetection({ suggestedLibrary: 'next-seo', domain: 'seo' }),
      makeDetection({ suggestedLibrary: 'pino', domain: 'observability' }),
    ];

    const results = await verifyAllRecommendations(client, detections);

    expect(results.size).toBe(3);
    expect(results.get(0)?.status).toBe('verified');
    expect(results.get(1)?.status).toBe('verified');
    expect(results.get(2)?.status).toBe('verified');
  });

  it('handles mixed results — some verified, some unverified', async () => {
    const client: Context7Client = {
      resolveLibraryId: async (name: string) => {
        if (name === 'unknown-lib') return null;
        return `ctx7/${name}`;
      },
      getLibraryDocs: async (_id: string, _uc: string) => ({
        url: 'https://example.com/docs',
        version: '1.0.0',
      }),
    };

    const detections: Detection[] = [
      makeDetection({ suggestedLibrary: 'i18next' }),
      makeDetection({ suggestedLibrary: 'unknown-lib' }),
      makeDetection({ suggestedLibrary: 'pino' }),
    ];

    const results = await verifyAllRecommendations(client, detections);

    expect(results.size).toBe(3);
    expect(results.get(0)?.status).toBe('verified');
    expect(results.get(1)?.status).toBe('unverified');
    expect(results.get(2)?.status).toBe('verified');
  });

  it('continues processing when one library fails (isolation)', async () => {
    let resolveCallCount = 0;
    const client: Context7Client = {
      resolveLibraryId: async (name: string) => {
        resolveCallCount++;
        if (name === 'flaky-lib') {
          throw new Error('Service error');
        }
        return `ctx7/${name}`;
      },
      getLibraryDocs: async (_id: string, _uc: string) => ({
        url: 'https://example.com/docs',
        version: '1.0.0',
      }),
    };

    const detections: Detection[] = [
      makeDetection({ suggestedLibrary: 'i18next' }),
      makeDetection({ suggestedLibrary: 'flaky-lib' }),
      makeDetection({ suggestedLibrary: 'pino' }),
    ];

    const results = await verifyAllRecommendations(client, detections);

    expect(results.size).toBe(3);
    expect(results.get(0)?.status).toBe('verified');
    // flaky-lib fails twice (initial + retry) → unavailable
    expect(results.get(1)?.status).toBe('unavailable');
    // pino should still be verified — failure is isolated
    expect(results.get(2)?.status).toBe('verified');
  });

  it('returns empty map for empty detections array', async () => {
    const client: Context7Client = {
      resolveLibraryId: async (_name: string) => 'ctx7/lib',
      getLibraryDocs: async (_id: string, _uc: string) => ({
        url: 'https://example.com',
        version: '1.0.0',
      }),
    };

    const results = await verifyAllRecommendations(client, []);

    expect(results.size).toBe(0);
  });

  it('passes correct library name and pattern category to client methods', async () => {
    const resolveLibraryIdSpy = vi.fn(async (name: string) => `ctx7/${name}`);
    const getLibraryDocsSpy = vi.fn(async (_id: string, _uc: string) => ({
      url: 'https://example.com/docs',
      version: '1.0.0',
    }));

    const client: Context7Client = {
      resolveLibraryId: resolveLibraryIdSpy,
      getLibraryDocs: getLibraryDocsSpy,
    };

    const detections: Detection[] = [
      makeDetection({
        suggestedLibrary: 'date-fns',
        patternCategory: 'i18n-date-formatting',
      }),
    ];

    await verifyAllRecommendations(client, detections);

    expect(resolveLibraryIdSpy).toHaveBeenCalledWith('date-fns');
    expect(getLibraryDocsSpy).toHaveBeenCalledWith('ctx7/date-fns', 'i18n-date-formatting');
  });
});
