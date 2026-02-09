---
name: analyze-and-recommend-third-party-optimizations
description: >-
  Scan a codebase to identify hand-rolled implementations that should be replaced
  by third-party libraries, and identify missing capabilities the project should
  have. Produce structured migration plans with Context7-verified recommendations.
  Use when analyzing technical debt, auditing dependency health, reviewing
  hand-rolled code, planning library migrations, or assessing capability gaps.
---

# Analyze and Recommend Third-Party Optimizations

## Architecture

```
Scanner (deterministic)     →  AI Agent (generative)           →  Pipeline (deterministic)
Regex patterns detect          1. Recommend replacements           Score, plan, audit,
hand-rolled code               2. Identify capability gaps         filter, serialize
                               using knowledge + Context7
```

**Design constraints**:
- No hardcoded library recommendations — evaluate project context dynamically
- Two analysis modes: **replacement** (hand-rolled code found) and **gap** (capability missing entirely)

## Standard Operating Procedure

### Step 1: Validate Input

Parse and validate `InputSchema` JSON via Zod. Read `src/schemas/input.schema.ts` for the full schema.

### Step 2: Scan Codebase

Run `scanCodebase(input)`. The scanner:

1. Detect workspace roots for monorepo support
2. Match code against 20+ domain patterns (i18n, auth, state-management, etc.)
3. Record each detection with: file path, line range, pattern category, confidence score, domain
4. Return `ScanResult` with detections and workspace info

Detections contain no library suggestions — only what was detected and where.

### Step 2.5: Gap Analysis (AI Agent)

Beyond scanner detections, analyze what the project is **missing entirely**. Inspect:

1. **Installed dependencies** — identify low-level tools that should be upgraded to platform-level solutions
2. **Monorepo structure** — identify missing architectural layers (e.g., shared token package, shared config preset)
3. **Cross-cutting concerns** — identify absent capabilities: structured logging, error monitoring, rate limiting, event-driven workflows, transactional email, type-safe API layer
4. **Architecture patterns** — identify opportunities for multi-package solutions (e.g., design-tokens → tailwind-config → ui three-layer architecture for design systems)

Analyze at three levels of depth:
- **Single library gap**: missing one tool (e.g., no form validation library)
- **Ecosystem gap**: missing a coordinated set of tools (e.g., no observability stack)
- **Architecture gap**: missing an entire structural layer (e.g., no design system, no shared config)

Provide each gap as a `GapRecommendation`. Read `src/index.ts` for the interface. Pass gaps via the `gaps` option in `analyze()`.

**Design system gaps** — Two paths depending on project maturity:
- **No existing frontend**: Scaffold from reference repos. Read `references/design-system-sources.md` for curated sources and sparse-checkout workflow.
- **Existing frontend without formal design system**: First extract the spec (audit → tokens → classify → document) via `references/design-system-extraction.md`, then implement the architecture via `references/design-system-sources.md`.

### Step 3: Recommend Solutions (AI Agent)

For each scanner detection, recommend a **solution**. Consider:

1. **Stack coherence** — don't recommend libraries in isolation; consider how they fit the project's overall stack (e.g., recommending Stripe should trigger consideration of Resend for transactional email and PostHog for payment funnel analytics)
2. **Ecosystem composition** — recommend companion libraries that work together
3. **Rationale** — explain WHY this choice fits this project's framework, runtime, and scale
4. **Anti-patterns** — what NOT to use and why
5. **Alternatives** — different solutions for different architectural contexts
6. **Migration snippet** — for each recommendation, read the detected code (file path + line range from scanner) and generate a concrete before/after code example showing the migration
7. **Context7 verification** — call `resolve-library-id` + `query-docs` to confirm the library exists and get latest version/docs

Read `src/index.ts` for the `LibraryRecommendation` interface. Return `null` to skip a detection.

**Skip a detection if**:
- Code has comments explaining why it is custom
- Detection is in test/mock/fixture files
- Library is already in project dependencies (suggest version update instead)
- Hand-rolled code is simpler than the library (3-line utility vs 50KB dep)

### Step 4–7: Score, Plan, Audit, Serialize

The pipeline handles these automatically:
- **Scoring**: confidence-based dimension scores (overridable by AI agent via `dimensionHints`)
- **Migration plan**: auto-grouped by risk (low/medium/high), sorted by file co-location
- **UX audit**: provide via `uxAudit` option in `analyze()`. Evaluate 8 categories: accessibility, error/empty/loading states, form validation, performance feel, copy consistency, design system alignment. For each, assess status (present/partial/missing) based on project code and `currentLibraries`.
- **Constraints**: license allowlist filtering, dependency conflict detection, JSON serialization

### Optional Steps

- **Step 8**: Vulnerability scan via OSV database (`vulnClient`)
- **Step 9**: Auto-update existing dependencies (`registryClient`)
- **Step 10**: PR auto-creation via GitHub/GitLab (`platformClient` + `gitOps`)

## Output

Single `OutputSchema` JSON containing:
- `recommendedChanges` — replacement recommendations with scores, verification, adapter strategies
- `gapAnalysis` (optional) — missing capabilities with prioritized recommendations
- `filesToDelete` — file paths to remove after migration
- `linesSavedEstimate` — total lines saved
- `uxAudit` — UX completeness checklist (8 categories)
- `migrationPlan` — phased plan with deletion checklist
- `vulnerabilityReport` (optional)
- `updatePlan` (optional)
- `pullRequests` (optional)

Read `src/schemas/output.schema.ts` for the full schema.
