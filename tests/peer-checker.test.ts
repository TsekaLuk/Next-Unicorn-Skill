import { describe, it, expect } from 'vitest';
import {
  classifySeverity,
  escalateRisk,
  checkPeerDependencies,
  type PeerDependencyResolver,
  type PeerDependencyMap,
} from '../src/checker/peer-dependency-checker.js';
import type { RecommendedChange } from '../src/schemas/output.schema.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRecommendation(
  overrides?: Partial<RecommendedChange>,
): RecommendedChange {
  return {
    currentImplementation: {
      filePath: 'src/utils.ts',
      lineRange: { start: 1, end: 10 },
      patternCategory: 'date-formatting',
      confidenceScore: 0.85,
    },
    recommendedLibrary: {
      name: 'date-fns',
      version: '3.0.0',
      license: 'MIT',
    },
    domain: 'date-utils',
    impactScores: {
      scalability: 7,
      performance: 8,
      security: 6,
      maintainability: 9,
      feature_richness: 8,
      ux: 5,
      ui_aesthetics: 5,
      composite: 7.2,
    },
    migrationRisk: 'low',
    estimatedEffort: 4,
    verificationStatus: 'verified',
    ...overrides,
  };
}

function makeResolver(
  mapping: Record<string, PeerDependencyMap>,
): PeerDependencyResolver {
  return {
    resolve: async (name: string, _version: string) => {
      if (name in mapping) return mapping[name];
      return {};
    },
  };
}

// ---------------------------------------------------------------------------
// classifySeverity — semver edge cases
// ---------------------------------------------------------------------------

describe('classifySeverity', () => {
  it('classifies pre-release version as compatible when range allows it', () => {
    // "18.0.0-rc.1" coerces to "18.0.0" which satisfies "^18.0.0"
    expect(classifySeverity('^18.0.0', '18.0.0-rc.1')).toBe('compatible');
  });

  it('classifies loose version string that needs coercion (e.g., "v18.2")', () => {
    // "v18.2" coerces to "18.2.0" which satisfies "^18.0.0"
    expect(classifySeverity('^18.0.0', 'v18.2')).toBe('compatible');
  });

  it('classifies loose version "v18.2" as conflict against "^19.0.0"', () => {
    // "v18.2" coerces to "18.2.0" which does NOT satisfy "^19.0.0"
    expect(classifySeverity('^19.0.0', 'v18.2')).toBe('conflict');
  });

  it('classifies invalid/unparseable version string as conflict', () => {
    expect(classifySeverity('^18.0.0', 'not-a-version')).toBe('conflict');
  });

  it('classifies empty string version as conflict', () => {
    expect(classifySeverity('^18.0.0', '')).toBe('conflict');
  });

  it('classifies undefined installed version as missing', () => {
    expect(classifySeverity('^18.0.0', undefined)).toBe('missing');
  });

  it('classifies invalid semver range as conflict (conservative)', () => {
    // "not-a-range" is not a valid semver range, semver.satisfies returns false
    expect(classifySeverity('not-a-range', '18.0.0')).toBe('conflict');
  });

  it('classifies exact version match as compatible', () => {
    expect(classifySeverity('18.2.0', '18.2.0')).toBe('compatible');
  });
});

// ---------------------------------------------------------------------------
// checkPeerDependencies — resolver error handling
// ---------------------------------------------------------------------------

describe('checkPeerDependencies — resolver error handling', () => {
  it('produces zero warnings when resolver throws, pipeline continues', async () => {
    const failingResolver: PeerDependencyResolver = {
      resolve: async () => {
        throw new Error('Registry unavailable');
      },
    };

    const recs = [
      makeRecommendation({
        recommendedLibrary: { name: 'lib-a', version: '1.0.0', license: 'MIT' },
        migrationRisk: 'low',
      }),
      makeRecommendation({
        recommendedLibrary: { name: 'lib-b', version: '2.0.0', license: 'MIT' },
        migrationRisk: 'low',
      }),
    ];

    const result = await checkPeerDependencies(recs, { react: '18.2.0' }, failingResolver);

    expect(result.warnings).toHaveLength(0);
    expect(result.recommendations).toHaveLength(2);
    // Original risk preserved when resolver fails
    expect(result.recommendations[0].migrationRisk).toBe('low');
    expect(result.recommendations[1].migrationRisk).toBe('low');
  });

  it('continues processing other recommendations when resolver throws for one library', async () => {
    let callCount = 0;
    const partialFailResolver: PeerDependencyResolver = {
      resolve: async (name: string) => {
        callCount++;
        if (name === 'lib-a') throw new Error('Network error');
        return { react: '^18.0.0' };
      },
    };

    const recs = [
      makeRecommendation({
        recommendedLibrary: { name: 'lib-a', version: '1.0.0', license: 'MIT' },
      }),
      makeRecommendation({
        recommendedLibrary: { name: 'lib-b', version: '2.0.0', license: 'MIT' },
      }),
    ];

    const result = await checkPeerDependencies(
      recs,
      { react: '18.2.0' },
      partialFailResolver,
    );

    // lib-a: resolver threw → zero warnings
    // lib-b: resolved react ^18.0.0 → compatible with 18.2.0
    expect(callCount).toBe(2);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].recommendedLibrary).toBe('lib-b');
    expect(result.warnings[0].severity).toBe('compatible');
    expect(result.recommendations).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// checkPeerDependencies — empty peer dep map
// ---------------------------------------------------------------------------

describe('checkPeerDependencies — empty peer dep map', () => {
  it('produces no warnings when resolver returns empty map', async () => {
    const emptyResolver = makeResolver({ 'lib-a': {} });

    const recs = [
      makeRecommendation({
        recommendedLibrary: { name: 'lib-a', version: '1.0.0', license: 'MIT' },
        migrationRisk: 'low',
      }),
    ];

    const result = await checkPeerDependencies(recs, { react: '18.2.0' }, emptyResolver);

    expect(result.warnings).toHaveLength(0);
    expect(result.recommendations[0].migrationRisk).toBe('low');
  });

  it('produces no warnings for empty recommendations array', async () => {
    const resolver = makeResolver({});
    const result = await checkPeerDependencies([], { react: '18.2.0' }, resolver);

    expect(result.warnings).toHaveLength(0);
    expect(result.recommendations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// checkPeerDependencies — malformed resolver data
// ---------------------------------------------------------------------------

describe('checkPeerDependencies — malformed resolver data', () => {
  it('treats non-string values in peer dep map as empty (no warnings)', async () => {
    const malformedResolver: PeerDependencyResolver = {
      resolve: async () => {
        // Return malformed data with non-string values
        return { react: 123, vue: null, angular: undefined } as unknown as PeerDependencyMap;
      },
    };

    const recs = [
      makeRecommendation({
        recommendedLibrary: { name: 'lib-a', version: '1.0.0', license: 'MIT' },
        migrationRisk: 'low',
      }),
    ];

    const result = await checkPeerDependencies(
      recs,
      { react: '18.2.0' },
      malformedResolver,
    );

    expect(result.warnings).toHaveLength(0);
    expect(result.recommendations[0].migrationRisk).toBe('low');
  });
});
