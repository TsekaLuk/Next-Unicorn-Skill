---
name: analyze-and-recommend-third-party-optimizations
description: Scans any codebase and identifies where hand-rolled implementations should be replaced by battle-tested third-party libraries, producing structured migration plans with Context7-verified recommendations
version: 1.0.2
author: TsekaLuk
tags:
  - code-analysis
  - third-party-libraries
  - migration-planning
  - dependency-optimization
  - context7-verification
  - ux-audit
  - impact-scoring
  - vulnerability-scanning
  - auto-update
  - pr-automation
---

# Analyze and Recommend Third-Party Optimizations

## Purpose

Scan a codebase to identify hand-rolled implementations that should be replaced by third-party libraries. The scanner detects WHAT is hand-rolled; the AI agent decides WHAT to recommend based on project context, current ecosystem knowledge, and Context7 MCP verification.

## Architecture

```
Scanner (deterministic)     →  AI Agent (generative)        →  Pipeline (deterministic)
Regex patterns detect          Agent recommends library         Score, plan, audit,
hand-rolled code               using knowledge + Context7       filter, serialize
```

**Key principle**: The pattern catalog contains NO hardcoded library recommendations. Library choices depend on project framework, runtime, existing dependencies, and current ecosystem state — all of which the AI agent evaluates dynamically.

## Standard Operating Procedure

### Step 1: Validate Input

Parse and validate `InputSchema` JSON via Zod. Required fields:
- **Project metadata**: repo path, languages, package managers, current libraries
- **Optimization goals**: what the project wants to improve
- **Constraints**: license allowlist, excluded libraries
- **Priority focus areas**: Vibe Coding Domains to prioritize

### Step 2: Scan Codebase

Run `scanCodebase(input)` to walk the file tree and match against regex patterns. The scanner:

1. Detects workspace roots for monorepo support
2. Matches code against 20+ domain patterns (i18n, auth, state-management, etc.)
3. Records each detection with: file path, line range, pattern category, confidence score, domain
4. Returns `ScanResult` with detections and workspace info

Detections contain **no library suggestions** — only what was detected and where.

### Step 3: Recommend Solutions (AI Agent)

For each detection, recommend a **unicorn-grade solution** — not just "a library that does this", but the specific combination of tools that the best engineering teams ship with, configured the way they configure it.

**Recommendation approach:**

1. **Project context** — framework, runtime, existing deps determine the primary library (Next.js App Router → next-intl; Vite SPA → @lingui/core; Edge → jose, not jsonwebtoken)
2. **Full ecosystem** — include companion packages that complete the solution (e.g., @lingui/macro for zero-runtime tagged templates + @lingui/cli for CI extraction + Crowdin TMS for professional translation workflows)
3. **Stack integration** — explain how this fits the broader architecture (e.g., "combine react-hook-form + @hookform/resolvers + zod for schema-validated forms that share types with server validation")
4. **Context7 verification** — call `resolve-library-id` + `query-docs` to confirm the library exists and get latest version/docs

Return a `LibraryRecommendation` per detection:
```typescript
{
  library: '@lingui/core',
  version: '^4.0.0',
  license: 'MIT',
  rationale: 'Compile-time message extraction with near-zero runtime overhead',
  ecosystem: [
    { library: '@lingui/macro', version: '^4.0.0', role: 'Zero-runtime tagged template macros' },
    { library: '@lingui/cli', version: '^4.0.0', role: 'CI/CD message extraction pipeline' },
  ],
  stackContext: 'Integrate with Crowdin TMS for professional translation workflows; use @lingui/vite-plugin for Vite or @lingui/swc-plugin for Next.js SWC compiler',
}
```

Return `null` to skip a detection (intentional custom code, false positive, etc.).

**False positive filtering** — skip if:
- Code has comments explaining why it is custom
- Detection is in test/mock/fixture files
- Library is already in project dependencies (suggest version update instead)
- Hand-rolled code is simpler than the library (3-line utility vs 50KB dep)

### Step 4: Score Impact

Compute 7-dimension impact scores (scalability, performance, security, maintainability, feature richness, UX, UI aesthetics) with composite score, migration risk, and estimated effort.

### Step 5: Build Migration Plan

Group recommendations into phases by risk (low → medium → high), ordered by domain priority (infrastructure first, presentation last). High-risk items include adapter strategies.

### Step 6: Audit UX Completeness

Evaluate frontend codebase across 8 UX categories: accessibility, error/empty/loading states, form validation, performance feel, copy consistency, design system alignment.

### Step 7: Apply Constraints and Serialize

Filter by license allowlist, detect dependency conflicts, serialize to JSON.

### Optional Steps

- **Step 8**: Vulnerability scanning via OSV database
- **Step 9**: Auto-update existing dependencies via registry queries
- **Step 10**: PR auto-creation via GitHub/GitLab API

## Programmatic API

```typescript
import { analyze, scanCodebase } from './src/index.js';
import type { Recommender } from './src/index.js';

// Step 1: Scan standalone (for AI agent inspection)
const scanResult = await scanCodebase(validatedInput);

// Step 2: Full pipeline with ecosystem-level recommender
const recommender: Recommender = (detection) => ({
  library: '@lingui/core',
  version: '^4.0.0',
  license: 'MIT',
  rationale: 'Compile-time extraction with near-zero runtime overhead',
  ecosystem: [
    { library: '@lingui/macro', version: '^4.0.0', role: 'Zero-runtime tagged templates' },
    { library: '@lingui/cli', version: '^4.0.0', role: 'CI message extraction' },
  ],
  stackContext: 'Integrate with Crowdin TMS; use @lingui/swc-plugin for Next.js',
});

const result = await analyze({
  input: inputJson,
  context7Client: myContext7Client,
  recommender, // AI agent provides ecosystem-level recommendations
});
```

## Output Artifacts

Single `OutputSchema` JSON containing:
- `recommendedChanges` — recommendations with scores, verification status, adapter strategies
- `filesToDelete` — file paths to remove after migration
- `linesSavedEstimate` — total lines saved
- `uxAudit` — UX completeness checklist
- `migrationPlan` — phased plan with deletion checklist
- `vulnerabilityReport` (optional)
- `updatePlan` (optional)
- `pullRequests` (optional)

## Vibe Coding Domain Coverage (20+ detection patterns)

| Category | Domains |
|----------|---------|
| UX / Design | ux-completeness, a11y-accessibility, forms-ux, state-management |
| SEO / i18n / Content | seo, i18n, content-marketing |
| Growth / Data | growth-hacking |
| App Architecture | agent-architecture, data-fetching-caching, error-handling-resilience |
| Backend / Platform | database-orm-migrations, auth-security |
| Observability | observability, logging-tracing-metrics |
| Testing | testing-strategy |
| AI Engineering | ai-model-serving |
| Business | cross-border-ecommerce |
| File / Media | file-upload-media |

> **Extensibility:** Use `customDomains?: string[]` in input for project-specific domains.
