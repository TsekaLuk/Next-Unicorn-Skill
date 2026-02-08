# 🦄 Next-Unicorn: Analyze & Recommend Third-Party Optimizations

<!-- SEO: codebase analysis, third-party library recommendations, dependency optimization,
     migration planning, hand-rolled code detection, library replacement, code modernization,
     Context7 verification, impact scoring, UX audit, vibe coding, MCP skill, AI agent tool,
     technical debt reduction, code quality, open source alternatives -->

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](./SKILL.md)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![Tests](https://img.shields.io/badge/tests-vitest%20%2B%20fast--check-purple.svg)](./tests/)

> **Stop reinventing the wheel.** Scan your codebase, find hand-rolled implementations, and get verified recommendations for battle-tested third-party libraries — complete with impact scores, migration plans, and deletion checklists.

## What It Does

Next-Unicorn is an AI-callable SKILL that analyzes your codebase and produces structured, actionable recommendations for replacing hand-rolled code with mature open-source libraries. Every recommendation is **verified against real documentation** via Context7 MCP.

### Key Features

- 🔍 **Pattern-based scanning** across 68 Vibe Coding Domains (ISO 25010-aligned)
- ✅ **Context7 MCP verification** — every recommendation backed by real docs
- 📊 **7-dimension impact scoring** (scalability, performance, security, maintainability, feature richness, UX, UI aesthetics)
- 📋 **Phased migration plans** with adapter strategies for high-risk changes
- 🗑️ **Deletion checklists** with estimated lines saved
- ♿ **UX completeness audit** covering A11y, error/empty/loading states, and more
- 🏗️ **Monorepo support** — scans multiple workspaces independently

## Before / After Examples

### Before: Hand-Rolled i18n

```tsx
// ❌ Custom translation function scattered across 47 files
const translations: Record<string, Record<string, string>> = {
  en: { greeting: 'Hello', farewell: 'Goodbye' },
  es: { greeting: 'Hola', farewell: 'Adiós' },
};

function t(key: string, locale: string): string {
  return translations[locale]?.[key] ?? key;
}

// No pluralization, no interpolation, no RTL, no SSR support
export default function Page() {
  return <h1>{t('greeting', userLocale)}</h1>;
}
```

### After: next-intl (Recommended)

```tsx
// ✅ next-intl — verified via Context7, MIT license
// Impact: scalability 9, maintainability 9, feature_richness 10
// Migration risk: low | Effort: 8 hours
import { useTranslations } from 'next-intl';

export default function Page() {
  const t = useTranslations('common');
  return <h1>{t('greeting')}</h1>;
}
// Gains: pluralization, interpolation, RTL, SSR, ICU message syntax
```

### Before: Hand-Rolled Request Logging

```typescript
// ❌ Custom logger with console.log and manual JSON formatting
function logRequest(req: Request) {
  const timestamp = new Date().toISOString();
  const entry = JSON.stringify({
    time: timestamp,
    method: req.method,
    url: req.url,
    headers: Object.fromEntries(req.headers),
  });
  console.log(entry);
}
// No log levels, no rotation, no structured output, no redaction
```

### After: pino (Recommended)

```typescript
// ✅ pino — verified via Context7, MIT license
// Impact: performance 10, security 8, observability 9
// Migration risk: low | Effort: 4 hours
import pino from 'pino';

const logger = pino({
  level: 'info',
  redact: ['req.headers.authorization'],
  transport: { target: 'pino-pretty' },
});

app.use((req, res, next) => {
  logger.info({ req }, 'incoming request');
  next();
});
// Gains: structured logging, log levels, redaction, 5x faster than console.log
```

## How It Differs from Existing Tools

| Feature | Next-Unicorn | Snyk | Dependabot | Renovate |
|---------|:------------:|:----:|:----------:|:--------:|
| **Finds hand-rolled code to replace** | ✅ | ❌ | ❌ | ❌ |
| **Recommends new libraries** | ✅ | ❌ | ❌ | ❌ |
| **7-dimension impact scoring** | ✅ | ❌ | ❌ | ❌ |
| **Context7 doc verification** | ✅ | ❌ | ❌ | ❌ |
| **Phased migration plans** | ✅ | ❌ | ❌ | ❌ |
| **UX completeness audit** | ✅ | ❌ | ❌ | ❌ |
| **Deletion checklists** | ✅ | ❌ | ❌ | ❌ |
| Vulnerability scanning | ❌ | ✅ | ✅ | ❌ |
| Auto-update existing deps | ❌ | ❌ | ✅ | ✅ |
| PR auto-creation for updates | ❌ | ✅ | ✅ | ✅ |
| License compliance checks | ✅ | ✅ | ❌ | ❌ |
| Monorepo support | ✅ | ✅ | ✅ | ✅ |

**In short:** Snyk, Dependabot, and Renovate manage your *existing* dependencies. Next-Unicorn finds code you wrote that *should become* a dependency.

## Usage

### As an MCP SKILL (AI Agent)

Provide the SKILL.md to your AI agent (Claude Code, Kiro, etc.) and pass a valid `InputSchema` JSON:

```json
{
  "projectMetadata": {
    "repoPath": "./my-project",
    "languages": ["typescript", "javascript"],
    "packageManagers": ["pnpm"],
    "currentLibraries": { "react": "18.2.0", "next": "14.1.0" }
  },
  "optimizationGoals": ["reduce custom code", "improve maintainability"],
  "constraints": {
    "licenseAllowlist": ["MIT", "Apache-2.0", "ISC", "BSD-2-Clause", "BSD-3-Clause"],
    "excludedLibraries": [],
    "maxDependencyCount": 100
  },
  "priorityFocusAreas": ["i18n", "observability", "auth-security"]
}
```

### Programmatic Usage

```typescript
import { analyze } from './src/index.js';

const result = await analyze({
  input: inputJson,
  context7Client: myContext7Client,
});

if (result.success) {
  console.log(result.prettyJson);
  // result.output — typed OutputSchema object
  // result.exclusions — libraries filtered by constraints
}
```

### Running Tests

```bash
pnpm install
pnpm test          # Run all tests (vitest + fast-check property tests)
pnpm typecheck     # TypeScript strict mode check
```

## Output Structure

The SKILL produces a structured `OutputSchema` JSON:

```
{
  recommendedChanges: [...]    // Array of recommendations with impact scores
  filesToDelete: [...]         // Files to remove after migration
  linesSavedEstimate: 1250     // Total lines of code saved
  uxAudit: [...]               // UX completeness checklist (8 categories)
  migrationPlan: {
    phases: [...]              // Ordered phases (low → medium → high risk)
    deletionChecklist: [...]   // Detailed deletion items with reasons
  }
}
```

## Vibe Coding Domains

Next-Unicorn covers 68 domains across 11 categories, aligned with ISO/IEC 25010 quality characteristics. Domains are problem areas most likely to be hand-rolled where mature libraries should be preferred.

| Category | Domains | ISO 25010 Mapping |
|----------|---------|-------------------|
| A. UX / Design | ux-completeness, ui-aesthetics, design-system, theming-dark-mode, a11y-accessibility, responsive-mobile-ux, empty-loading-error-states, forms-ux, validation-feedback, navigation-information-architecture, notifications-inapp, tables-data-grid-ux, filters-sort-search-ux, onboarding-guided-tour | Usability |
| B. SEO / i18n / Content | seo, i18n, localization-ux, content-marketing, landing-page-conversion | Compatibility |
| C. Growth / Data | growth-hacking, analytics-tracking, attribution-measurement, ab-testing-experimentation, product-led-growth, retention-lifecycle-crm, referrals-virality | Functional Suitability |
| D. App / Frontend Arch | agent-architecture, frontend-architecture, state-management, data-fetching-caching, error-handling-resilience, realtime-collaboration, file-upload-media, search-discovery | Maintainability |
| E. Backend / Platform | api-design-contracts, backend-architecture, database-orm-migrations, caching-rate-limit, jobs-queue-scheduler, webhooks-integrations, feature-flags-config, multi-tenancy-saas | Reliability / Scalability |
| F. Security / Compliance | auth-security, permissions-rbac-ux, security-hardening, privacy-compliance, fraud-abuse-prevention | Security |
| G. Observability / Ops | observability, logging-tracing-metrics, error-monitoring, alerting-incident-response | Reliability |
| H. Delivery / DevEx | testing-strategy, ci-cd-release, devex-tooling, documentation-sop, code-quality-linting, dependency-management | Maintainability |
| I. Performance / Cost | performance-web-vitals, backend-performance, cost-optimization | Performance Efficiency |
| J. AI Engineering | ai-model-serving, ai-evaluation-observability, rag-vector-search | Functional Suitability |
| K. Business Domains | cross-border-ecommerce, payments-billing, marketplace-platform | Functional Suitability |

> Use `customDomains?: string[]` in the input schema for project-specific domains beyond the official enum.

## Examples

See the [`examples/`](./examples/) directory for complete input/output scenarios:

- [`frontend-nextjs/`](./examples/frontend-nextjs/) — Next.js/React frontend analysis
- [`backend-node/`](./examples/backend-node/) — Node.js/Express backend analysis

## Templates

See the [`templates/`](./templates/) directory for reusable output templates:

- [`summary-table.md`](./templates/summary-table.md) — Comparison table
- [`migration-plan.md`](./templates/migration-plan.md) — Phased migration plan
- [`deletion-checklist.md`](./templates/deletion-checklist.md) — Files to delete
- [`prd-template.md`](./templates/prd-template.md) — PRD for stakeholder presentation

## License

MIT
