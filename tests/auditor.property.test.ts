import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { auditUxCompleteness } from '../src/auditor/ux-auditor.js';
import type { ScanResult, Detection, WorkspaceScan } from '../src/analyzer/scanner.js';
import type { InputSchema } from '../src/schemas/input.schema.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_UX_CATEGORIES = [
  'accessibility',
  'error-states',
  'empty-states',
  'loading-states',
  'form-validation',
  'performance-feel',
  'copy-consistency',
  'design-system-alignment',
] as const;

const VIBE_CODING_DOMAINS = [
  // A. UX / Design
  'ux-completeness', 'ui-aesthetics', 'design-system', 'theming-dark-mode',
  'a11y-accessibility', 'responsive-mobile-ux', 'empty-loading-error-states',
  'forms-ux', 'validation-feedback', 'navigation-information-architecture',
  'notifications-inapp', 'tables-data-grid-ux', 'filters-sort-search-ux',
  'onboarding-guided-tour',
  // B. SEO / i18n / Content
  'seo', 'i18n', 'localization-ux', 'content-marketing', 'landing-page-conversion',
  // C. Growth / Data
  'growth-hacking', 'analytics-tracking', 'attribution-measurement',
  'ab-testing-experimentation', 'product-led-growth', 'retention-lifecycle-crm',
  'referrals-virality',
  // D. App / Frontend Architecture
  'agent-architecture', 'frontend-architecture', 'state-management',
  'data-fetching-caching', 'error-handling-resilience', 'realtime-collaboration',
  'file-upload-media', 'search-discovery',
  // E. Backend / Platform
  'api-design-contracts', 'backend-architecture', 'database-orm-migrations',
  'caching-rate-limit', 'jobs-queue-scheduler', 'webhooks-integrations',
  'feature-flags-config', 'multi-tenancy-saas',
  // F. Security / Compliance
  'auth-security', 'permissions-rbac-ux', 'security-hardening',
  'privacy-compliance', 'fraud-abuse-prevention',
  // G. Observability / Ops
  'observability', 'logging-tracing-metrics', 'error-monitoring',
  'alerting-incident-response',
  // H. Delivery / Quality / DevEx
  'testing-strategy', 'ci-cd-release', 'devex-tooling', 'documentation-sop',
  'code-quality-linting', 'dependency-management',
  // I. Performance / Cost
  'performance-web-vitals', 'backend-performance', 'cost-optimization',
  // J. AI Engineering
  'ai-model-serving', 'ai-evaluation-observability', 'rag-vector-search',
  // K. Business domains
  'cross-border-ecommerce', 'payments-billing', 'marketplace-platform',
] as const;

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Safe non-empty string for file paths */
const safeFilePathArb = fc.stringMatching(/^[a-z][a-z0-9_/.-]{0,40}$/);

/** Safe non-empty string for identifiers */
const safeStringArb = fc.stringMatching(/^[a-z][a-z0-9_-]{0,20}$/);

/** Confidence score in [0, 1] */
const confidenceArb = fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true });

/** A valid VibeCodingDomain */
const domainArb = fc.constantFrom(...VIBE_CODING_DOMAINS);

/** A valid Detection arbitrary */
const detectionArb: fc.Arbitrary<Detection> = fc
  .record({
    filePath: safeFilePathArb,
    lineStart: fc.integer({ min: 1, max: 500 }),
    lineEnd: fc.integer({ min: 1, max: 1000 }),
    patternCategory: safeStringArb,
    confidenceScore: confidenceArb,
    domain: domainArb as fc.Arbitrary<string>,
  })
  .filter((r) => r.lineStart <= r.lineEnd)
  .map((r) => ({
    filePath: r.filePath,
    lineRange: { start: r.lineStart, end: r.lineEnd },
    patternCategory: r.patternCategory,
    confidenceScore: r.confidenceScore,
    domain: r.domain,
  }));

/** A WorkspaceScan arbitrary */
const workspaceScanArb: fc.Arbitrary<WorkspaceScan> = fc.record({
  root: fc.constant('.'),
  packageManager: fc.constantFrom('npm', 'pnpm', 'yarn'),
  language: fc.constantFrom('typescript', 'javascript'),
  dependencies: fc.constant({}),
});

/** A ScanResult with random detections */
const scanResultArb: fc.Arbitrary<ScanResult> = fc.record({
  detections: fc.array(detectionArb, { minLength: 0, maxLength: 20 }),
  workspaces: fc.array(workspaceScanArb, { minLength: 1, maxLength: 3 }),
});

/** Library name → version map for currentLibraries */
const currentLibrariesArb = fc.dictionary(safeStringArb, safeStringArb, {
  minKeys: 0,
  maxKeys: 10,
});

/** Project metadata arbitrary */
const projectMetadataArb: fc.Arbitrary<InputSchema['projectMetadata']> = fc.record({
  repoPath: fc.constant('/tmp/test-repo'),
  languages: fc.constant(['typescript']),
  packageManagers: fc.constant(['npm']),
  currentLibraries: currentLibrariesArb,
});

// ---------------------------------------------------------------------------
// Property 11: UX audit completeness
// ---------------------------------------------------------------------------

describe('Feature: next-unicorn, Property 11: UX audit completeness', () => {
  /**
   * **Validates: Requirements 6.1, 6.2, 6.3**
   *
   * For any frontend scan result, the UX_Auditor SHALL produce audit items
   * covering all 8 categories (accessibility, error-states, empty-states,
   * loading-states, form-validation, performance-feel, copy-consistency,
   * design-system-alignment), and every item with status "partial" or "missing"
   * SHALL have a non-empty `recommendedLibrary` and `rationale`.
   */

  it('always produces exactly 8 audit items covering all UX categories', () => {
    fc.assert(
      fc.property(scanResultArb, projectMetadataArb, (scanResult, projectMetadata) => {
        const result = auditUxCompleteness(scanResult, projectMetadata);

        // Must have exactly 8 items
        expect(result.items).toHaveLength(8);

        // All 8 categories must be present
        const categories = result.items.map((item) => item.category);
        for (const category of ALL_UX_CATEGORIES) {
          expect(categories).toContain(category);
        }

        // No duplicate categories
        const uniqueCategories = new Set(categories);
        expect(uniqueCategories.size).toBe(8);
      }),
      { numRuns: 100 },
    );
  });

  it('every item with status "partial" or "missing" has non-empty rationale (recommendedLibrary left for AI agent)', () => {
    fc.assert(
      fc.property(scanResultArb, projectMetadataArb, (scanResult, projectMetadata) => {
        const result = auditUxCompleteness(scanResult, projectMetadata);

        for (const item of result.items) {
          if (item.status === 'partial' || item.status === 'missing') {
            // recommendedLibrary is intentionally undefined — AI agent fills it
            expect(item.recommendedLibrary).toBeUndefined();
            // rationale is always present (factual description of what was found)
            expect(item.rationale.length).toBeGreaterThan(0);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('every item has a valid status value', () => {
    fc.assert(
      fc.property(scanResultArb, projectMetadataArb, (scanResult, projectMetadata) => {
        const result = auditUxCompleteness(scanResult, projectMetadata);

        for (const item of result.items) {
          expect(['present', 'partial', 'missing']).toContain(item.status);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('every item has a non-empty rationale regardless of status', () => {
    fc.assert(
      fc.property(scanResultArb, projectMetadataArb, (scanResult, projectMetadata) => {
        const result = auditUxCompleteness(scanResult, projectMetadata);

        for (const item of result.items) {
          expect(typeof item.rationale).toBe('string');
          expect(item.rationale.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('every item has a filePaths array', () => {
    fc.assert(
      fc.property(scanResultArb, projectMetadataArb, (scanResult, projectMetadata) => {
        const result = auditUxCompleteness(scanResult, projectMetadata);

        for (const item of result.items) {
          expect(Array.isArray(item.filePaths)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('empty scan result with no libraries produces all "missing" statuses', () => {
    const emptyScanResult: ScanResult = { detections: [], workspaces: [] };
    const emptyMetadata: InputSchema['projectMetadata'] = {
      repoPath: '/tmp/test',
      languages: ['typescript'],
      packageManagers: ['npm'],
      currentLibraries: {},
    };

    const result = auditUxCompleteness(emptyScanResult, emptyMetadata);

    expect(result.items).toHaveLength(8);
    for (const item of result.items) {
      expect(item.status).toBe('missing');
      // recommendedLibrary is undefined — AI agent fills it
      expect(item.recommendedLibrary).toBeUndefined();
      expect(item.rationale.length).toBeGreaterThan(0);
    }
  });

  it('scan result with UX-related detections produces "partial" for matched categories', () => {
    // Create detections that match specific UX categories
    const detections: Detection[] = [
      {
        filePath: 'src/components/Form.tsx',
        lineRange: { start: 10, end: 20 },
        patternCategory: 'ux-manual-form-validation',
        confidenceScore: 0.7,
        domain: 'ux-completeness',
      },
      {
        filePath: 'src/components/List.tsx',
        lineRange: { start: 5, end: 15 },
        patternCategory: 'ux-manual-loading-states',
        confidenceScore: 0.55,
        domain: 'ux-completeness',
      },
    ];

    const scanResult: ScanResult = { detections, workspaces: [] };
    const metadata: InputSchema['projectMetadata'] = {
      repoPath: '/tmp/test',
      languages: ['typescript'],
      packageManagers: ['npm'],
      currentLibraries: {},
    };

    const result = auditUxCompleteness(scanResult, metadata);

    // Form validation and loading states should be partial (hand-rolled detected)
    const formItem = result.items.find((i) => i.category === 'form-validation');
    expect(formItem?.status).toBe('partial');
    // recommendedLibrary is undefined — AI agent fills it
    expect(formItem?.recommendedLibrary).toBeUndefined();
    expect(formItem?.filePaths).toContain('src/components/Form.tsx');

    const loadingItem = result.items.find((i) => i.category === 'loading-states');
    expect(loadingItem?.status).toBe('partial');
    expect(loadingItem?.recommendedLibrary).toBeUndefined();
    expect(loadingItem?.filePaths).toContain('src/components/List.tsx');
  });

  it('project with UX libraries installed produces "present" for matched categories', () => {
    const scanResult: ScanResult = { detections: [], workspaces: [] };
    const metadata: InputSchema['projectMetadata'] = {
      repoPath: '/tmp/test',
      languages: ['typescript'],
      packageManagers: ['npm'],
      currentLibraries: {
        'react-hook-form': '^7.50.0',
        'react-loading-skeleton': '^3.4.0',
        'react-aria': '^3.30.0',
        'react-error-boundary': '^4.0.0',
      },
    };

    const result = auditUxCompleteness(scanResult, metadata);

    const formItem = result.items.find((i) => i.category === 'form-validation');
    expect(formItem?.status).toBe('present');

    const loadingItem = result.items.find((i) => i.category === 'loading-states');
    expect(loadingItem?.status).toBe('present');

    const a11yItem = result.items.find((i) => i.category === 'accessibility');
    expect(a11yItem?.status).toBe('present');

    const errorItem = result.items.find((i) => i.category === 'error-states');
    expect(errorItem?.status).toBe('present');
  });

  /** Validates: Requirements 6.1, 6.2, 6.3 */
});
