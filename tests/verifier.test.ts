import { describe, it, expect, vi } from 'vitest';
import {
  verifyRecommendation,
  verifyAllRecommendations,
  type Context7Client,
  type VerificationItem,
} from '../src/verifier/context7.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(overrides?: Partial<VerificationItem>): VerificationItem {
  return {
    libraryName: 'i18next',
    useCase: 'i18n-manual-pluralization',
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
// verifyAllRecommendations — now takes VerificationItem[] (not Detection[])
// ---------------------------------------------------------------------------

describe('verifyAllRecommendations', () => {
  it('processes all items and returns a result for each', async () => {
    const client: Context7Client = {
      resolveLibraryId: async (name: string) => `ctx7/${name}`,
      getLibraryDocs: async (_id: string, _uc: string) => ({
        url: 'https://example.com/docs',
        version: '1.0.0',
      }),
    };

    const items: Array<VerificationItem | null> = [
      makeItem({ libraryName: 'i18next', useCase: 'i18n' }),
      makeItem({ libraryName: 'next-seo', useCase: 'seo' }),
      makeItem({ libraryName: 'pino', useCase: 'observability' }),
    ];

    const results = await verifyAllRecommendations(client, items);

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

    const items: Array<VerificationItem | null> = [
      makeItem({ libraryName: 'i18next' }),
      makeItem({ libraryName: 'unknown-lib' }),
      makeItem({ libraryName: 'pino' }),
    ];

    const results = await verifyAllRecommendations(client, items);

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

    const items: Array<VerificationItem | null> = [
      makeItem({ libraryName: 'i18next' }),
      makeItem({ libraryName: 'flaky-lib' }),
      makeItem({ libraryName: 'pino' }),
    ];

    const results = await verifyAllRecommendations(client, items);

    expect(results.size).toBe(3);
    expect(results.get(0)?.status).toBe('verified');
    // flaky-lib fails twice (initial + retry) → unavailable
    expect(results.get(1)?.status).toBe('unavailable');
    // pino should still be verified — failure is isolated
    expect(results.get(2)?.status).toBe('verified');
  });

  it('skips null items (detections without recommendations)', async () => {
    const client: Context7Client = {
      resolveLibraryId: async (name: string) => `ctx7/${name}`,
      getLibraryDocs: async (_id: string, _uc: string) => ({
        url: 'https://example.com/docs',
        version: '1.0.0',
      }),
    };

    const items: Array<VerificationItem | null> = [
      makeItem({ libraryName: 'i18next' }),
      null, // detection without recommendation — skipped
      makeItem({ libraryName: 'pino' }),
    ];

    const results = await verifyAllRecommendations(client, items);

    // Only 2 results — null item at index 1 was skipped
    expect(results.size).toBe(2);
    expect(results.has(0)).toBe(true);
    expect(results.has(1)).toBe(false);
    expect(results.has(2)).toBe(true);
    expect(results.get(0)?.status).toBe('verified');
    expect(results.get(2)?.status).toBe('verified');
  });

  it('returns empty map for empty items array', async () => {
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

  it('passes correct library name and use case to client methods', async () => {
    const resolveLibraryIdSpy = vi.fn(async (name: string) => `ctx7/${name}`);
    const getLibraryDocsSpy = vi.fn(async (_id: string, _uc: string) => ({
      url: 'https://example.com/docs',
      version: '1.0.0',
    }));

    const client: Context7Client = {
      resolveLibraryId: resolveLibraryIdSpy,
      getLibraryDocs: getLibraryDocsSpy,
    };

    const items: Array<VerificationItem | null> = [
      makeItem({
        libraryName: 'date-fns',
        useCase: 'i18n-date-formatting',
      }),
    ];

    await verifyAllRecommendations(client, items);

    expect(resolveLibraryIdSpy).toHaveBeenCalledWith('date-fns');
    expect(getLibraryDocsSpy).toHaveBeenCalledWith('ctx7/date-fns', 'i18n-date-formatting');
  });
});
