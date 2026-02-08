---
name: analyze-and-recommend-third-party-optimizations
description: Scans any codebase and identifies where hand-rolled implementations should be replaced by battle-tested third-party libraries, producing structured migration plans with Context7-verified recommendations
version: 1.0.0
author: Nebutra
tags:
  - code-analysis
  - third-party-libraries
  - migration-planning
  - dependency-optimization
  - context7-verification
  - ux-audit
  - impact-scoring
---

# Analyze and Recommend Third-Party Optimizations

## Purpose

This SKILL scans a codebase to identify hand-rolled implementations that should be replaced by mature, battle-tested third-party libraries. It produces structured, actionable artifacts: comparison tables, 7-dimension impact scores, phased migration plans, deletion checklists, and UX completeness audits — all verified against real documentation via Context7 MCP.

## Prerequisites

- Node.js 18+ runtime
- Access to Context7 MCP service (for library verification)
- A valid `InputSchema` JSON describing the target project

## Standard Operating Procedure

### Step 1: Validate Input

Parse and validate the incoming `InputSchema` JSON using Zod schema validation. The input must include:

- **Project metadata**: repository path, languages, package managers, current libraries map
- **Optimization goals**: array of goals describing what the project wants to improve
- **Constraints**: license allowlist, excluded libraries, max dependency count
- **Priority focus areas**: Vibe Coding Domains to prioritize (i18n, seo, growth-hacking, ai-model-serving, agent-architecture, content-marketing, cross-border-ecommerce, observability, auth-security, ux-completeness)
- **Impact weights** (optional): custom weights for the 7 scoring dimensions

If validation fails, return a structured error response with field-level messages. Do not proceed.

### Step 2: Scan Codebase

Walk the project file tree and match source files against the pattern catalog. The scanner:

1. Detects workspace roots for monorepo support (package.json, pyproject.toml, etc.)
2. Scans each workspace independently
3. Matches code patterns against a catalog covering 10 Vibe Coding Domains
4. Records each detection with: file path, line range, pattern category, confidence score, suggested library, and domain tag
5. Skips unreadable files (binary, permissions) gracefully

### Step 3: Verify with Context7 MCP

For each detected recommendation, verify the suggested library against real, version-correct documentation:

1. Call `resolve-library-id` with the library name to obtain the canonical Context7 identifier
2. Call `get-library-docs` to retrieve version-specific documentation and confirm the use case
3. Set verification status:
   - **verified** — Context7 confirmed the library and use case
   - **unverified** — Context7 could not resolve the library identifier
   - **unavailable** — Context7 service was unreachable (after one retry)

### Step 4: Score Impact

Compute a 7-dimension impact score for each recommendation:

| Dimension | Range |
|-----------|-------|
| Scalability | 1–10 |
| Performance | 1–10 |
| Security | 1–10 |
| Maintainability | 1–10 |
| Feature Richness | 1–10 |
| UX | 1–10 |
| UI Aesthetics | 1–10 |

- Compute a **composite score** as the weighted average of all dimensions
- Apply a **1.2× priority boost** (capped at 10) for recommendations in priority focus areas
- Assign **migration risk** (low / medium / high) and **estimated effort** in developer-hours

### Step 5: Build Migration Plan

Group recommendations into ordered phases based on risk:

1. **Phase 1** — Low-risk changes (quick wins)
2. **Phase 2** — Medium-risk changes (moderate refactoring)
3. **Phase 3** — High-risk changes (require adapter strategies)

For high-risk items, generate an **Adapter Strategy** specifying:
- Wrapper interface
- Legacy code being wrapped
- Target library to transition to

Build a **deletion checklist** listing every file and code range to remove after migration, with estimated lines saved.

### Step 6: Audit UX Completeness

Evaluate the frontend codebase across 8 UX categories:

1. **Accessibility (A11y)** — ARIA attributes, semantic HTML, keyboard navigation
2. **Error states** — Error boundaries, error messages, fallback UI
3. **Empty states** — Empty data placeholders, zero-state illustrations
4. **Loading states** — Skeletons, spinners, suspense boundaries
5. **Form validation** — Client-side validation, error messages, field states
6. **Performance feel** — Optimistic updates, transitions, lazy loading
7. **Copy consistency** — i18n usage, consistent terminology
8. **Design system alignment** — Component library usage, token adherence

For each gap found, map it to a recommended library with a rationale.

### Step 7: Apply Constraints and Serialize

1. **Dependency conflict detection** — Flag conflicts with existing libraries, set migration risk to high
2. **License filtering** — Exclude recommendations whose library license is not in the allowlist
3. **Serialize** the final `OutputSchema` to pretty-printed JSON (2-space indent) with round-trip guarantee

## Output Artifacts

The SKILL produces a single `OutputSchema` JSON containing:

- `recommendedChanges` — Array of recommendations with impact scores, verification status, and adapter strategies
- `filesToDelete` — Array of file paths to remove after migration
- `linesSavedEstimate` — Total lines of code saved
- `uxAudit` — Structured UX completeness checklist
- `migrationPlan` — Phased plan with deletion checklist

## Usage

```bash
# Run the analysis
npx tsx src/index.ts < input.json > output.json

# Or import programmatically
import { analyze } from './src/index.js';

const result = await analyze({
  input: inputJson,
  context7Client: myContext7Client,
});
```

## Vibe Coding Domain Coverage (68 domains, ISO 25010-aligned)

Domains are NOT "tech stack" labels — they are problem areas most likely to be hand-rolled where mature libraries should be preferred. Organized by ISO 25010 quality characteristics.

### A. UX Completeness & Design System (Usability / UI quality)

| Domain | Examples |
|--------|----------|
| ux-completeness | radix-ui, react-aria, framer-motion |
| ui-aesthetics | tailwindcss, class-variance-authority |
| design-system | @radix-ui/themes, @chakra-ui/react |
| theming-dark-mode | next-themes, tailwindcss dark mode |
| a11y-accessibility | react-aria, axe-core, eslint-plugin-jsx-a11y |
| responsive-mobile-ux | tailwindcss, react-responsive |
| empty-loading-error-states | react-loading-skeleton, react-error-boundary |
| forms-ux | react-hook-form, formik |
| validation-feedback | zod, yup, vest |
| navigation-information-architecture | next/navigation, react-router |
| notifications-inapp | sonner, react-hot-toast |
| tables-data-grid-ux | @tanstack/react-table, ag-grid |
| filters-sort-search-ux | @tanstack/react-table, fuse.js |
| onboarding-guided-tour | react-joyride, shepherd.js |

### B. SEO / i18n / Content (Discoverability / Global-ready)

| Domain | Examples |
|--------|----------|
| seo | next-seo, schema-dts, next-sitemap |
| i18n | next-intl, react-i18next, FormatJS |
| localization-ux | @formatjs/intl, date-fns/locale |
| content-marketing | contentlayer, next-mdx-remote, sanity |
| landing-page-conversion | next-seo, posthog, ab-testing libs |

### C. Growth & Data (Experimentation / Analytics)

| Domain | Examples |
|--------|----------|
| growth-hacking | posthog, launchdarkly, mixpanel |
| analytics-tracking | posthog-js, segment, plausible |
| attribution-measurement | segment, mixpanel |
| ab-testing-experimentation | posthog, growthbook, statsig |
| product-led-growth | posthog, canny, intercom |
| retention-lifecycle-crm | customer.io, braze |
| referrals-virality | referral-saasquatch |

### D. App / Frontend Architecture (Maintainability / Modularity)

| Domain | Examples |
|--------|----------|
| agent-architecture | @modelcontextprotocol/sdk, ai (Vercel AI SDK) |
| frontend-architecture | next.js, remix, vite |
| state-management | zustand, jotai, @tanstack/react-query |
| data-fetching-caching | @tanstack/react-query, swr, apollo-client |
| error-handling-resilience | react-error-boundary, neverthrow |
| realtime-collaboration | yjs, liveblocks, socket.io |
| file-upload-media | uploadthing, tus-js-client |
| search-discovery | meilisearch, typesense, algolia |

### E. Backend / Platform (Scalability / Reliability / Compatibility)

| Domain | Examples |
|--------|----------|
| api-design-contracts | openapi, trpc, graphql-codegen |
| backend-architecture | fastify, hono, nestjs |
| database-orm-migrations | prisma, drizzle, knex |
| caching-rate-limit | rate-limiter-flexible, ioredis |
| jobs-queue-scheduler | bullmq, temporal, inngest |
| webhooks-integrations | svix, hookdeck |
| feature-flags-config | unleash, launchdarkly, growthbook |
| multi-tenancy-saas | @clerk/nextjs, auth0 |

### F. Security / Compliance (Security)

| Domain | Examples |
|--------|----------|
| auth-security | next-auth, passport, jose |
| permissions-rbac-ux | casl, casbin |
| security-hardening | helmet, csp-header |
| privacy-compliance | consent-manager, cookie-consent |
| fraud-abuse-prevention | arcjet, cloudflare turnstile |

### G. Observability / Ops (Reliability / Operability)

| Domain | Examples |
|--------|----------|
| observability | pino, opentelemetry, sentry |
| logging-tracing-metrics | pino, @opentelemetry/sdk-node |
| error-monitoring | @sentry/node, bugsnag |
| alerting-incident-response | pagerduty, opsgenie |

### H. Delivery / Quality / DevEx (Maintainability / DevEx)

| Domain | Examples |
|--------|----------|
| testing-strategy | vitest, playwright, fast-check |
| ci-cd-release | changesets, semantic-release |
| devex-tooling | turborepo, nx, biome |
| documentation-sop | typedoc, storybook, mintlify |
| code-quality-linting | eslint, biome, prettier |
| dependency-management | renovate, depcheck |

### I. Performance / Cost (Performance efficiency)

| Domain | Examples |
|--------|----------|
| performance-web-vitals | @next/bundle-analyzer, lighthouse |
| backend-performance | autocannon, clinic.js |
| cost-optimization | aws-cost-explorer, infracost |

### J. AI Engineering

| Domain | Examples |
|--------|----------|
| ai-model-serving | transformers.js, onnxruntime, langchain |
| ai-evaluation-observability | langfuse, promptfoo |
| rag-vector-search | @pinecone-database/pinecone, chromadb |

### K. Business Domains (optional)

| Domain | Examples |
|--------|----------|
| cross-border-ecommerce | stripe, shopify-api, taxjar |
| payments-billing | stripe, lemon-squeezy |
| marketplace-platform | medusa, saleor |

> **Extensibility:** The enum covers official domains. Use `customDomains?: string[]` in the input schema for community/project-specific domains without breaking the type system.
