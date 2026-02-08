import { z } from 'zod';

/**
 * VibeCodingDomain — ISO 25010-aligned problem domains where hand-rolled code
 * is most common and mature third-party libraries should be preferred.
 *
 * Classification principle: domains are NOT "tech stack" labels — they are
 * "problem areas most likely to be hand-rolled and should use mature wheels".
 *
 * Covers two axes:
 *   - Product / Growth / UX (frontend code most likely to be hand-rolled)
 *   - Engineering / Architecture / Delivery (backend/platform code most likely unmaintainable)
 *
 * Maps to ISO 25010 quality characteristics:
 *   usability / performance / security / maintainability / reliability /
 *   compatibility / portability / functional suitability
 *
 * Naming: kebab-case throughout for README/API/TS type consistency.
 */
export const VibeCodingDomain = z.enum([
  // A. UX Completeness & Design System (Usability / UI quality)
  'ux-completeness',
  'ui-aesthetics',
  'design-system',
  'theming-dark-mode',
  'a11y-accessibility',
  'responsive-mobile-ux',
  'empty-loading-error-states',
  'forms-ux',
  'validation-feedback',
  'navigation-information-architecture',
  'notifications-inapp',
  'tables-data-grid-ux',
  'filters-sort-search-ux',
  'onboarding-guided-tour',

  // B. SEO / i18n / Content (Discoverability / Global-ready)
  'seo',
  'i18n',
  'localization-ux',
  'content-marketing',
  'landing-page-conversion',

  // C. Growth & Data (Experimentation / Analytics)
  'growth-hacking',
  'analytics-tracking',
  'attribution-measurement',
  'ab-testing-experimentation',
  'product-led-growth',
  'retention-lifecycle-crm',
  'referrals-virality',

  // D. App / Frontend Architecture (Maintainability / Modularity)
  'agent-architecture',
  'frontend-architecture',
  'state-management',
  'data-fetching-caching',
  'error-handling-resilience',
  'realtime-collaboration',
  'file-upload-media',
  'search-discovery',

  // E. Backend / Platform (Scalability / Reliability / Compatibility)
  'api-design-contracts',
  'backend-architecture',
  'database-orm-migrations',
  'caching-rate-limit',
  'jobs-queue-scheduler',
  'webhooks-integrations',
  'feature-flags-config',
  'multi-tenancy-saas',

  // F. Security / Compliance (Security)
  'auth-security',
  'permissions-rbac-ux',
  'security-hardening',
  'privacy-compliance',
  'fraud-abuse-prevention',

  // G. Observability / Ops (Reliability / Operability)
  'observability',
  'logging-tracing-metrics',
  'error-monitoring',
  'alerting-incident-response',

  // H. Delivery / Quality / DevEx (Maintainability / DevEx)
  'testing-strategy',
  'ci-cd-release',
  'devex-tooling',
  'documentation-sop',
  'code-quality-linting',
  'dependency-management',

  // I. Performance / Cost (Performance efficiency)
  'performance-web-vitals',
  'backend-performance',
  'cost-optimization',

  // J. AI Engineering
  'ai-model-serving',
  'ai-evaluation-observability',
  'rag-vector-search',

  // K. Business domains (optional — marketing tags, may not participate in rules)
  'cross-border-ecommerce',
  'payments-billing',
  'marketplace-platform',
]);

export type VibeCodingDomain = z.infer<typeof VibeCodingDomain>;

export const InputSchema = z.object({
  projectMetadata: z.object({
    repoPath: z.string().min(1),
    languages: z.array(z.string()).min(1),
    packageManagers: z.array(z.string()).min(1),
    currentLibraries: z.record(z.string(), z.string()), // name -> version
  }),
  optimizationGoals: z.array(z.string()).min(1),
  constraints: z.object({
    licenseAllowlist: z.array(z.string()).default([]),
    excludedLibraries: z.array(z.string()).default([]),
    maxDependencyCount: z.number().int().positive().optional(),
  }),
  priorityFocusAreas: z.array(VibeCodingDomain).default([]),
  /** User-defined custom domains beyond the official enum — extensibility escape hatch */
  customDomains: z.array(z.string().min(1)).optional(),
  impactWeights: z
    .object({
      scalability: z.number().min(0).max(1),
      performance: z.number().min(0).max(1),
      security: z.number().min(0).max(1),
      maintainability: z.number().min(0).max(1),
      feature_richness: z.number().min(0).max(1),
      ux: z.number().min(0).max(1),
      ui_aesthetics: z.number().min(0).max(1),
    })
    .optional(),
});

export type InputSchema = z.infer<typeof InputSchema>;
