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

For each detection, recommend a **solution** — not just a library, but an ecosystem-level answer. Consider:

1. **Ecosystem composition** — recommend companion libraries that work together
   (e.g., `@lingui/core` + `@lingui/macro` + `@lingui/cli` for compile-time i18n with TMS integration)
2. **Rationale** — explain WHY this specific choice fits this project's framework, runtime, and scale
3. **Anti-patterns** — what NOT to use and why (e.g., "Never use jsonwebtoken — no edge runtime support; use jose")
4. **Alternatives** — different solutions for different architectural contexts
5. **Context7 verification** — call `resolve-library-id` + `query-docs` to confirm the library exists and get latest version/docs

Return a `LibraryRecommendation` per detection:
```typescript
{
  library: string;           // required — primary package
  version: string;           // required
  license: string;           // required
  rationale?: string;        // recommended — WHY this choice
  ecosystem?: Array<{...}>;  // when solution involves multiple packages
  antiPatterns?: string[];   // when common mistakes exist
  alternatives?: Array<{...}>;  // when architecture affects the choice
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

// Step 2: Full pipeline with recommender
const recommender: Recommender = (detection) => ({
  library: 'zustand',
  version: '^5.0.0',
  license: 'MIT',
});

const result = await analyze({
  input: inputJson,
  context7Client: myContext7Client,
  recommender, // AI agent provides this
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
